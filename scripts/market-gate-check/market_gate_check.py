"""Research only: fixed ADX/EMA/BTC RSI gates; no trading runtime imports."""
import csv, io, json, hashlib, urllib.request, urllib.error, zipfile
from pathlib import Path
from datetime import datetime, timezone, timedelta
from concurrent.futures import ThreadPoolExecutor
import numpy as np
from numba import njit
from strategy_specs import STRATS

END_DT = datetime(2026, 10, 7, tzinfo=timezone.utc)
START_DT = END_DT - timedelta(days=1095)
SPLIT_DT = END_DT - timedelta(days=365)
LOAD_DT = START_DT - timedelta(days=30)
START, SPLIT, END, LOAD = [int(d.timestamp()*1000) for d in (START_DT,SPLIT_DT,END_DT,LOAD_DT)]
STEP = {'1m':60000,'3m':180000,'5m':300000,'10m':600000,'15m':900000,'30m':1800000}
COST = .0016
BASE = 'https://data.binance.vision/data/futures/um'
OUT = Path('research-output'); OUT.mkdir(exist_ok=True)

def urls(sym, tf):
    y,m = LOAD_DT.year,LOAD_DT.month
    while (y,m)<(END_DT.year,END_DT.month):
        yield f'{BASE}/monthly/klines/{sym}/{tf}/{sym}-{tf}-{y}-{m:02d}.zip'
        m+=1
        if m==13:y+=1;m=1
    for day in range(1,END_DT.day):
        yield f'{BASE}/daily/klines/{sym}/{tf}/{sym}-{tf}-{END_DT.year}-{END_DT.month:02d}-{day:02d}.zip'

def archive(url):
    for attempt in range(3):
        try:
            req=urllib.request.Request(url,headers={'User-Agent':'spacehub-market-gate-research/1.0'})
            with urllib.request.urlopen(req,timeout=30) as r: raw=r.read()
            with zipfile.ZipFile(io.BytesIO(raw)) as z: txt=z.read(z.namelist()[0]).decode()
            data=[]
            for row in csv.reader(io.StringIO(txt)):
                if not row or not row[0].isdigit():continue
                t=int(row[0]); t=t//1000 if t>10**14 else t
                if LOAD<=t<END:data.append((t,*map(float,row[1:6])))
            return data, {'url':url,'sha256':hashlib.sha256(raw).hexdigest(),'rows':len(data)}
        except urllib.error.HTTPError as e:
            if e.code==404:return [],{'url':url,'missing':404}
            if attempt==2:raise
        except Exception:
            if attempt==2:raise

def load(sym,tf):
    arr=[]; manifest=[]
    for u in urls(sym,tf):
        data,meta=archive(u);arr.extend(data);manifest.append(meta)
    arr=sorted({x[0]:x for x in arr}.values())
    if not arr:raise RuntimeError(f'No data: {sym} {tf}')
    a=np.array(arr,float);t=a[:,0].astype(np.int64)
    if not np.isfinite(a).all() or np.any(a[:,2]<a[:,3]):raise ValueError('Invalid OHLCV')
    step=STEP[tf];gaps=np.flatnonzero(np.diff(t)!=step)
    info={'symbol':sym,'tf':tf,'bars':len(a),'first':int(t[0]),'last':int(t[-1]),
          'gap_count':int(len(gaps)),'expected_bars_between_first_last':int((t[-1]-t[0])//step+1),
          'ends_at_requested_date':bool(t[-1]+step==END),'archives':manifest}
    info['coverage_between_first_last']=len(a)/info['expected_bars_between_first_last']
    print(f'LOADED {sym} {tf} {len(a)} bars gaps={len(gaps)}',flush=True)
    return a,info

@njit
def indicators(a,step):
    n=len(a); e50=np.full(n,np.nan);e200=np.full(n,np.nan)
    rr=np.full(n,np.nan);adx=np.full(n,np.nan);plus=np.full(n,np.nan);minus=np.full(n,np.nan)
    begin=0; gain=loss=travg=pmavg=mmavg=dxsum=0.
    for i in range(n):
        if i==0 or a[i,0]-a[i-1,0]!=step:
            begin=i;gain=loss=travg=pmavg=mmavg=dxsum=0.
        k=i-begin;c=a[i,4]
        if k==49:e50[i]=np.mean(a[begin:i+1,4])
        elif k>49:e50[i]=e50[i-1]+2/51*(c-e50[i-1])
        if k==199:e200[i]=np.mean(a[begin:i+1,4])
        elif k>199:e200[i]=e200[i-1]+2/201*(c-e200[i-1])
        if k==0:continue
        d=c-a[i-1,4];g=max(d,0.);l=max(-d,0.)
        tr=max(a[i,2]-a[i,3],abs(a[i,2]-a[i-1,4]),abs(a[i,3]-a[i-1,4]))
        up=a[i,2]-a[i-1,2];down=a[i-1,3]-a[i,3]
        pd=up if up>down and up>0 else 0.;md=down if down>up and down>0 else 0.
        if k<=14:
            gain+=g/14;loss+=l/14;travg+=tr/14;pmavg+=pd/14;mmavg+=md/14
        else:
            gain=(gain*13+g)/14;loss=(loss*13+l)/14
            travg=(travg*13+tr)/14;pmavg=(pmavg*13+pd)/14;mmavg=(mmavg*13+md)/14
        if k>=14:
            rr[i]=100*gain/(gain+loss) if gain+loss>0 else 50.
            plus[i]=100*pmavg/travg if travg>0 else 0.
            minus[i]=100*mmavg/travg if travg>0 else 0.
            den=plus[i]+minus[i];dx=100*abs(plus[i]-minus[i])/den if den>0 else 0.
            if k<=27:dxsum+=dx/14
            if k==27:adx[i]=dxsum
            elif k>27:adx[i]=(adx[i-1]*13+dx)/14
    return rr,e50,e200,adx,plus,minus

def signal_indices(a,s,rr):
    t=a[:,0].astype(np.int64);o=a[:,1];c=a[:,4];v=a[:,5];n=s['n']
    idx=np.arange(n-1,len(a)-1);ok=np.ones(len(idx),bool);step=STEP[s['tf']]
    for lag in range(n-1):ok &= t[idx-lag]-t[idx-lag-1]==step
    ok &= (t[idx+1]-t[idx]==step)&(t[idx+1]>=START)
    if s['kind']=='red':
        for lag in range(n):ok &= c[idx-lag]<o[idx-lag]
    elif s['kind']=='fall':
        for lag in range(n-1):ok &= c[idx-lag]<c[idx-lag-1]
    elif s['kind']=='agt':
        cs=np.cumsum(np.r_[0.,v]);av=np.r_[np.full(19,np.nan),(cs[20:]-cs[:-20])/20]
        ok &= (c[idx-2]>o[idx-2])&(c[idx-1]<o[idx-1])&(c[idx]<o[idx])&(c[idx]/o[idx-2]-1<=-.005)&(v[idx]>=1.5*av[idx])
    elif s['kind']=='lqty':
        ok &= (c[idx-2]<o[idx-2])&(c[idx-1]<o[idx-1])&(c[idx]<o[idx])&(c[idx]/o[idx-2]-1<=-.0075)&(rr[idx]<=40)
    return idx[ok]

@njit
def outcomes(a,idx,tp,sl,hold,step):
    net=np.full(len(idx),np.nan);ex=np.full(len(idx),-1,np.int64);reason=np.zeros(len(idx),np.int64)
    for k in range(len(idx)):
        i=idx[k];j0=i+1;e=a[j0,1];stop=e*(1-sl);target=e*(1+tp)
        limit=min(len(a),j0+hold) if hold>0 else len(a)
        found=False
        for j in range(j0,limit):
            if j>j0 and a[j,0]-a[j-1,0]!=step:reason[k]=4;break
            # Stop gaps are filled at worse opening price. Target gaps use limit price.
            if a[j,1]<=stop:px=a[j,1];r=1
            elif a[j,1]>=target:px=target;r=2
            elif a[j,3]<=stop:px=stop;r=1
            elif a[j,2]>=target:px=target;r=2
            else:continue
            net[k]=px/e-1-COST;ex[k]=j;reason[k]=r;found=True;break
        if not found and reason[k]!=4:
            if hold>0 and j0+hold<=len(a):
                j=j0+hold-1;net[k]=a[j,4]/e-1-COST;ex[k]=j;reason[k]=3
            else:reason[k]=5
    return net,ex,reason

FILTERS={
 'baseline':'No market gate',
 'rsi50':'BTC 5m RSI(14) >= 50',
 'coin_ema':'Coin strategy timeframe EMA50 > EMA200 and close > EMA200',
 'coin_adx20':'Coin ADX(14) >= 20 and +DI > -DI',
 'coin_adx25':'Coin ADX(14) >= 25 and +DI > -DI',
 'coin_low_adx':'Coin ADX(14) < 20 (range regime)',
 'rsi_coin_ema':'BTC RSI >= 50 + coin EMA trend',
 'rsi_coin_adx20':'BTC RSI >= 50 + coin ADX >= 20 and +DI > -DI',
 'triple_coin20':'BTC RSI >= 50 + coin EMA trend + coin ADX >= 20 and +DI > -DI',
 'triple_coin25':'BTC RSI >= 50 + coin EMA trend + coin ADX >= 25 and +DI > -DI',
 'triple_range':'BTC RSI >= 50 + coin EMA trend + coin ADX < 20',
 'btc_ema':'BTC 5m EMA50 > EMA200 and close > EMA200',
 'btc_triple20':'BTC 5m RSI >= 50 + BTC EMA trend + BTC ADX >= 20 and +DI > -DI',
 'btc_triple_coin_ema':'BTC triple gate + coin EMA trend',
}

def gates(a,idx,ind,btc,bind,tf):
    rt,e50,e200,adx,p,m=ind
    entry=a[idx+1,0].astype(np.int64)
    bt=btc[:,0].astype(np.int64);bj=np.searchsorted(bt+300000,entry,side='right')-1
    valid=(bj>=0);bj=np.maximum(bj,0)
    valid &= (entry-(bt[bj]+300000)<300000)
    br,be50,be200,ba,bp,bm=bind
    rsi=valid&(br[bj]>=50)
    ce=(e50[idx]>e200[idx])&(a[idx,4]>e200[idx])
    ca20=(adx[idx]>=20)&(p[idx]>m[idx]);ca25=(adx[idx]>=25)&(p[idx]>m[idx]);low=adx[idx]<20
    be=valid&(be50[bj]>be200[bj])&(btc[bj,4]>be200[bj])
    ba20=valid&(ba[bj]>=20)&(bp[bj]>bm[bj]);btr=rsi&be&ba20
    return {'baseline':np.ones(len(idx),bool),'rsi50':rsi,'coin_ema':ce,'coin_adx20':ca20,'coin_adx25':ca25,
            'coin_low_adx':low,'rsi_coin_ema':rsi&ce,'rsi_coin_adx20':rsi&ca20,
            'triple_coin20':rsi&ce&ca20,'triple_coin25':rsi&ce&ca25,'triple_range':rsi&ce&low,
            'btc_ema':be,'btc_triple20':btr,'btc_triple_coin_ema':btr&ce}

def choose(idx,net,ex,reason,mask,a,start,end):
    rows=[];last=-1;purged=0;censored=0;gap=0
    for k,i in enumerate(idx):
        entry=int(a[i+1,0])
        if entry<start or entry>=end or not mask[k] or i<=last:continue
        if reason[k]==4:gap+=1;last=len(a);break  # conservative: unknown open trade blocks later entries
        if reason[k]==5:censored+=1;break
        if int(a[ex[k],0])>=end:purged+=1;break
        if not np.isfinite(net[k]):continue
        rows.append((entry,int(a[ex[k],0]),float(net[k]),int(reason[k])))
        last=int(ex[k])
    return rows,{'purged_at_boundary':purged,'censored_at_data_end':censored,'blocked_by_gap':gap}

def metrics(rows):
    v=np.array([x[2] for x in rows]);n=len(v)
    if not n:return {'n':0,'wr':None,'pf':None,'avg_net_bps':None,'sum_net_pct':0,'gross_positive':0,'gross_negative':0}
    pos=float(v[v>0].sum());neg=float(-v[v<0].sum());wins=int((v>0).sum())
    p=wins/n;z=1.96;den=1+z*z/n;centre=(p+z*z/(2*n))/den;rad=z*np.sqrt(p*(1-p)/n+z*z/(4*n*n))/den
    return {'n':n,'wins':wins,'wr':round(100*p,3),'wr_wilson95':[round(100*(centre-rad),3),round(100*(centre+rad),3)],
            'pf':round(pos/neg,4) if neg else None,'avg_net_bps':round(10000*float(v.mean()),4),
            'sum_net_pct':round(100*float(v.sum()),4),'gross_positive':pos,'gross_negative':neg,
            'avg_winner_bps':round(10000*float(v[v>0].mean()),4) if wins else None,
            'avg_loser_bps':round(10000*float(v[v<=0].mean()),4) if wins<n else None}

def run():
    keys=sorted(set((sym,'5m' if s['tf']=='10m' else s['tf']) for s in STRATS for sym in s['symbols'])|{('BTCUSDT','5m')})
    with ThreadPoolExecutor(max_workers=8) as pool:data=dict(zip(keys,pool.map(lambda k:load(*k),keys)))
    btc=data[('BTCUSDT','5m')][0];bind=indicators(btc,300000)
    results=[];allrows={key:{period:[] for period in ('train','validation','all3y')} for key in FILTERS};ledger=[]
    coverage=[]
    for _,info in data.values():coverage.append(info)
    if any(x['coverage_between_first_last']<.98 or not x['ends_at_requested_date'] for x in coverage):
        raise RuntimeError('Insufficient archive coverage; refusing completed-result claim')
    for s in STRATS:
        chosen={key:{period:[] for period in ('train','validation','all3y')} for key in FILTERS};audit=[]
        for sym in s['symbols']:
            a=data[(sym,'5m' if s['tf']=='10m' else s['tf'])][0]
            if s['tf']=='10m':
                t=a[:,0].astype(np.int64);i=np.flatnonzero((t[:-1]%600000==0)&(np.diff(t)==300000))
                a=np.column_stack((a[i,0],a[i,1],np.maximum(a[i,2],a[i+1,2]),np.minimum(a[i,3],a[i+1,3]),a[i+1,4],a[i,5]+a[i+1,5]))
            ind=indicators(a,STEP[s['tf']]);idx=signal_indices(a,s,ind[0])
            net,ex,reason=outcomes(a,idx,s['tp'],s['sl'],s['hold'] or 0,STEP[s['tf']]);masks=gates(a,idx,ind,btc,bind,s['tf'])
            for key,mask in masks.items():
                for period,start,end in [('train',START,SPLIT),('validation',SPLIT,END),('all3y',START,END)]:
                    rows,au=choose(idx,net,ex,reason,mask,a,start,end)
                    chosen[key][period].extend(rows);allrows[key][period].extend(rows)
                    audit.append({'symbol':sym,'filter':key,'period':period,**au})
                    if period=='validation':
                        ledger.extend({'strategy':s['name'],'symbol':sym,'filter':key,'entry_ms':r[0],'exit_ms':r[1],'net':r[2],'reason':r[3]} for r in rows)
        summary={key:{p:metrics(rows) for p,rows in per.items()} for key,per in chosen.items()}
        eligible=[k for k in FILTERS if summary[k]['train']['n']>=200]
        selected=max(eligible,key=lambda k:summary[k]['train']['avg_net_bps']) if eligible else None
        results.append({'strategy':s['name'],'symbols':s['symbols'],'tf':s['tf'],'filters':summary,
                        'selected_using_train_only':selected,'audit':audit})
        print('STRATEGY_RESULT '+json.dumps({'strategy':s['name'],'filters':{k:v['validation'] for k,v in summary.items()},'selected_using_train_only':selected}),flush=True)
    report={'window':{'start':START_DT.isoformat(),'split':SPLIT_DT.isoformat(),'end_exclusive':END_DT.isoformat()},
            'filters':FILTERS,'costs':{'fee_pct':.10,'slippage_pct':.04,'funding_reserve_pct':.02,'total_pct':.16},
            'method':['Fixed same strategy/symbol universe as prior RSI study; LONG only.',
                      'Entry at next candle open; coin indicators on completed signal bar; BTC latest completed 5m at entry.',
                      'EMA seeded with period SMA, Wilder RSI/ADX; reset after data gaps; 30d warmup.',
                      'SL first if both barriers touched in same candle; stop gap worse open; target gaps at limit.',
                      'Nonoverlap within each strategy/symbol/filter; independent train/validation; purge cross-boundary positions.',
                      'Existing year was already inspected, so temporal validation is not pristine unseen holdout.',
                      'Constant nominal returns, no leverage/compounding/portfolio simulation; sum_net_pct is not account return.',
                      'Funding is a fixed reserve, not actual funding history. Intrabar ordering is conservative OHLC.',
                      'Universe selected previously; survivorship/selection bias remains; not all Binance Futures.'],
            'coverage':coverage,'aggregate':{k:{p:metrics(rows) for p,rows in per.items()} for k,per in allrows.items()},'results':results}
    (OUT/'market-gates-3y.json').write_text(json.dumps(report,indent=2))
    with (OUT/'validation-trades.jsonl').open('w') as f:
        for row in ledger:f.write(json.dumps(row)+'\n')
    print('AGGREGATE_RESULT '+json.dumps(report['aggregate']),flush=True)

if __name__=='__main__':run()
