"""Fixed DDDDD exhaustion + 1m price/taker-buy confirmation experiment."""
import io,json,hashlib,zipfile,urllib.request,urllib.error
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import numpy as np
from numba import njit
import market_gate_check as core
from strategy_specs import TOP10

VARIANTS={
 'baseline':'DDDDD, immediate next-minute open',
 'atr_only':'DDDDD drop >= 2 * pre-pattern Wilder ATR14 on 5m',
 'price_confirm':'DDDDD + within next 5 completed 1m bars close > preceding 1m high',
 'price_flow':'DDDDD + 1m price confirmation and same-bar taker-buy base volume / base volume >= 0.55',
 'atr_price':'DDDDD + ATR condition + 1m price confirmation',
 'full':'DDDDD + ATR condition + 1m price confirmation + taker-buy fraction >= 0.55',
}
PERIODS={'train':(core.START,core.SPLIT),'validation':(core.SPLIT,core.END),'all3y':(core.START,core.END)}

def load_minutes(sym):
    chunks=[];manifest=[]
    for url in core.urls(sym,'1m'):
        for attempt in range(3):
            try:
                req=urllib.request.Request(url,headers={'User-Agent':'spacehub-flow-reversal/1.0'})
                with urllib.request.urlopen(req,timeout=40) as res:raw=res.read()
                with zipfile.ZipFile(io.BytesIO(raw)) as z:txt=z.read(z.namelist()[0]).decode()
                skip=0 if txt.split(',',1)[0].isdigit() else 1
                a=np.loadtxt(io.StringIO(txt),delimiter=',',skiprows=skip,usecols=(0,1,2,3,4,5,9),ndmin=2)
                if len(a) and a[0,0]>1e14:a[:,0]/=1000
                a=a[(a[:,0]>=core.LOAD)&(a[:,0]<core.END)]
                chunks.append(a);manifest.append({'url':url,'sha256':hashlib.sha256(raw).hexdigest(),'rows':len(a)})
                break
            except urllib.error.HTTPError as e:
                if e.code==404:manifest.append({'url':url,'missing':404});break
                if attempt==2:raise
            except Exception:
                if attempt==2:raise
    if not chunks:raise RuntimeError('No data: '+sym)
    a=np.concatenate(chunks);a=a[np.argsort(a[:,0])]
    if not np.isfinite(a).all() or np.any(a[:,1:5]<=0):raise ValueError('Invalid prices '+sym)
    if np.any(a[:,6]<0) or np.any(a[:,6]>a[:,5]+1e-6*np.maximum(1,a[:,5])):raise ValueError('Invalid taker volume '+sym)
    t=a[:,0].astype(np.int64);gaps=int(np.sum(np.diff(t)!=60000))
    if gaps or t[-1]+60000!=core.END:raise ValueError(f'Incomplete data {sym}: gaps={gaps}, last={t[-1]}')
    coverage={'symbol':sym,'bars':len(a),'first_ms':int(t[0]),'last_ms':int(t[-1]),'gaps':gaps,'archives':manifest}
    print('LOADED '+json.dumps({k:v for k,v in coverage.items() if k!='archives'}),flush=True)
    return a,coverage

def five_minutes(a):
    t=a[:,0].astype(np.int64)
    idx=np.flatnonzero(t%300000==0);idx=idx[idx+4<len(a)]
    idx=idx[t[idx+4]-t[idx]==240000]
    blocks=a[idx[:,None]+np.arange(5)]
    return np.column_stack((a[idx,0],a[idx,1],blocks[:,:,2].max(axis=1),blocks[:,:,3].min(axis=1),a[idx+4,4],blocks[:,:,5].sum(axis=1))),idx

@njit
def atr14(a):
    out=np.full(len(a),np.nan);sm=0.
    for i in range(1,len(a)):
        tr=max(a[i,2]-a[i,3],abs(a[i,2]-a[i-1,4]),abs(a[i,3]-a[i-1,4]))
        if i<=14:sm+=tr/14
        else:sm=(sm*13+tr)/14
        if i>=14:out[i]=sm
    return out

def candidates(a):
    b,minute_idx=five_minutes(a);atr=atr14(b)
    i=np.arange(5,len(b));valid=np.ones(len(i),bool)
    for lag in range(5):valid &= b[i-lag,4]<b[i-lag,1]
    valid &= (b[i,0]-b[i-4,0]==1200000)&(b[i,0]+300000>=core.START)
    i=i[valid];signal=minute_idx[i]+5;good=signal<len(a);i=i[good];signal=signal[good]
    drop=b[i-4,1]-b[i,4];ratio=drop/atr[i-5]
    atr_ok=np.isfinite(ratio)&(ratio>=2.)
    entries={k:[] for k in VARIANTS};features={k:[] for k in VARIANTS}
    for k,s in enumerate(signal):
        q_price=q_flow=-1
        for q in range(s,min(s+5,len(a)-1)):
            if a[q,4]>a[q-1,2]:
                if q_price<0:q_price=q
                if a[q,5]>0 and a[q,6]/a[q,5]>=.55:
                    q_flow=q;break
        options={'baseline':s,'atr_only':s if atr_ok[k] else -1,
                 'price_confirm':q_price+1 if q_price>=0 else -1,
                 'price_flow':q_flow+1 if q_flow>=0 else -1,
                 'atr_price':q_price+1 if q_price>=0 and atr_ok[k] else -1,
                 'full':q_flow+1 if q_flow>=0 and atr_ok[k] else -1}
        for key,j in options.items():
            if j<0:continue
            entries[key].append(j)
            # Features are diagnostic, never consulted by the exit simulator.
            flow=a[j-1,6]/a[j-1,5] if a[j-1,5]>0 else None
            features[key].append({'signal_ms':int(a[s,0]),'entry_ms':int(a[j,0]),'atr_ratio':float(ratio[k]) if np.isfinite(ratio[k]) else None,'last_closed_1m_buy_fraction':flow})
    return {k:np.array(v,dtype=np.int64) for k,v in entries.items()},features,{'signals':len(signal),'atr_pass':int(atr_ok.sum())}

@njit
def simulate(a,entries,start,end):
    trades=np.empty((len(entries),5),np.float64);count=0;last=-1;open_count=0;open_net=0.
    boundary=np.searchsorted(a[:,0],end)
    for k in range(len(entries)):
        eidx=entries[k];ts=a[eidx,0]
        if ts<start or ts>=end or eidx<=last:continue
        e=a[eidx,1];stop=e*.99;target=e*1.01;found=False
        for j in range(eidx,boundary):
            if a[j,1]<=stop:px=a[j,1];reason=1
            elif a[j,1]>=target:px=target;reason=2
            elif a[j,3]<=stop:px=stop;reason=1
            elif a[j,2]>=target:px=target;reason=2
            else:continue
            trades[count,0]=ts;trades[count,1]=a[j,0];trades[count,2]=px/e-1-core.COST
            trades[count,3]=reason;trades[count,4]=k;count+=1;last=j;found=True;break
        if not found:
            open_count+=1;open_net=a[boundary-1,4]/e-1-core.COST;break
    return trades[:count],open_count,open_net

def weekly_ci(rows,start,end):
    # Resample UTC 7-day blocks jointly across all coins; approximate dependence-aware interval.
    if len(rows)<2:return None
    bins=int(np.ceil((end-start)/604800000));sums=np.zeros(bins);counts=np.zeros(bins)
    for row in rows:
        k=min(bins-1,int((row[0]-start)//604800000));sums[k]+=row[2];counts[k]+=1
    rng=np.random.default_rng(20261007);draw=rng.integers(0,bins,size=(2000,bins))
    n=counts[draw].sum(axis=1);v=sums[draw].sum(axis=1);v=v[n>0]/n[n>0]
    return [round(float(x*10000),4) for x in np.quantile(v,[.025,.975])]

def describe(rows,start,end):
    m=core.metrics(rows);m['weekly_block_avg_bps_ci95']=weekly_ci(rows,start,end)
    m['avg_holding_minutes']=round(float(np.mean([(x[1]-x[0])/60000+1 for x in rows])),2) if len(rows) else None
    m['cost_sensitivity_avg_bps']={str(cost):round(m['avg_net_bps']+16-cost,4) if len(rows) else None for cost in (10,16,20)}
    return m

def run_symbol(sym):
    a,coverage=load_minutes(sym);entries,features,counts=candidates(a)
    result={'symbol':sym,'counts':counts,'variants':{}};rows={};ledger=[]
    for key,ee in entries.items():
        rows[key]={};result['variants'][key]={}
        for period,(start,end) in PERIODS.items():
            tr,oc,on=simulate(a,ee,start,end);rows[key][period]=tr
            result['variants'][key][period]={**describe(tr,start,end),'open_at_boundary':oc,'open_net_pct':round(on*100,4)}
            if period=='all3y':
                for row in tr:
                    ledger.append({'symbol':sym,'variant':key,**features[key][int(row[4])],'exit_ms':int(row[1]),'net':row[2],'reason':int(row[3])})
    print('SYMBOL_RESULT '+json.dumps(result),flush=True)
    return result,rows,coverage,ledger

def run():
    results=[];coverage=[];ledger=[];allrows={k:{p:[] for p in PERIODS} for k in VARIANTS}
    with ThreadPoolExecutor(max_workers=4) as pool:
        for result,rows,cov,led in pool.map(run_symbol,TOP10):
            results.append(result);coverage.append(cov);ledger.extend(led)
            for k in VARIANTS:
                for p in PERIODS:allrows[k][p].extend(rows[k][p])
    aggregate={k:{p:describe(rows,*PERIODS[p]) for p,rows in per.items()} for k,per in allrows.items()}
    annual={}
    for k in VARIANTS:
        annual[k]={}
        for year in (2023,2024,2025,2026):
            rows=[r for r in allrows[k]['all3y'] if core.datetime.fromtimestamp(r[0]/1000,core.timezone.utc).year==year]
            annual[k][str(year)]=core.metrics(rows)
    report={'window':{'start':core.START_DT.isoformat(),'split':core.SPLIT_DT.isoformat(),'end_exclusive':core.END_DT.isoformat()},
            'symbols':TOP10,'variants':VARIANTS,'cost_roundtrip_pct':.16,'tp_pct':1,'sl_pct':1,
            'method':['Fixed 2x pre-pattern 5m ATR14; ATR ends before first red candle.',
                      '5m DDDDD derived from exact complete 1m blocks. Up to five following 1m bars can confirm.',
                      'Confirmation: close > immediately preceding minute high; buy fraction uses actual Binance taker-buy BASE volume / BASE volume.',
                      'Entry at open of minute AFTER confirmation; baseline at first minute after fifth red 5m candle.',
                      'TP/SL evaluated on 1m, stop first on intrabar ambiguity; adverse stop gaps filled at opening price.',
                      'Same-symbol overlap suppressed separately for each variant; no timeout; unresolved boundary trades reported separately.',
                      'Train and validation reset independently; earlier year has already been studied, so not pristine unseen holdout.',
                      'Independent constant notional trades; no leverage, reinvestment, portfolio capacity or liquidation model.',
                      '0.10% fees + 0.04% slippage + 0.02% funding reserve. Funding reserve is not realized funding.',
                      'Universe fixed to prior 10 symbols, not all Futures. Shorter histories start at listing. No threshold optimization.'],
            'coverage':coverage,'aggregate':aggregate,'annual':annual,'results':results}
    out=Path('research-output');out.mkdir(exist_ok=True)
    (out/'flow-reversal-3y.json').write_text(json.dumps(report,indent=2,allow_nan=False))
    with (out/'flow-reversal-trades.jsonl').open('w') as f:
        for row in ledger:f.write(json.dumps(row,allow_nan=False)+'\n')
    print('FLOW_AGGREGATE '+json.dumps(aggregate,allow_nan=False),flush=True)

if __name__=='__main__':run()
