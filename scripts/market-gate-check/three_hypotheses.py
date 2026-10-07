"""Preregistered follow-up: ATR exits, relative strength, failed reversal short."""
import json
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import numpy as np
from numba import njit
import flow_reversal as flow
from strategy_specs import TOP10
core=flow.core
RULES={
 'baseline':'DDDDD LONG, TP 1%, SL 1%, entry at next minute open.',
 'fixed_rr2_control':'Same entry, TP 1%, SL 0.5%; control for changed reward/risk.',
 'atr_exits':'Same entry, TP distance 2*ATR14, SL distance 1*ATR14; Wilder ATR on latest completed 5m signal bar, fixed at entry.',
 'relative_btc':'Same baseline entry/exits, but coin simple 60m return minus simultaneous BTC simple 60m return > 0.',
 'failed_short':'After DDDDD: within 5 minutes first 1m close above prior 1m high; then within next 10 minutes first 1m close below low of original five 5m candles; SHORT next minute open, TP 1%, SL 1%.',
}

def candidate_entries(a,btc):
    b,mi=flow.five_minutes(a);atr=flow.atr14(b)
    ii=np.arange(5,len(b));valid=np.ones(len(ii),bool)
    for lag in range(5):valid &= b[ii-lag,4]<b[ii-lag,1]
    valid &= (b[ii,0]-b[ii-4,0]==1200000)&(b[ii,0]+300000>=core.START)
    ii=ii[valid];entry=mi[ii]+5;ok=entry<len(a);ii=ii[ok];entry=entry[ok]
    rows={k:[] for k in RULES};bt=btc[:,0].astype(np.int64)
    audit={'signals':len(entry),'btc_alignment_rejected':0,'no_price_bounce':0,'no_failure':0}
    for i,s in zip(ii,entry):
        signal=int(a[s,0]);atr_abs=float(atr[i]);e=float(a[s,1])
        base=[int(s),1.,.01,.01,signal,atr_abs,0.]
        rows['baseline'].append(base)
        rows['fixed_rr2_control'].append([int(s),1.,.01,.005,signal,atr_abs,0.])
        if np.isfinite(atr_abs) and 0<atr_abs<e:
            rows['atr_exits'].append([int(s),1.,2*atr_abs/e,atr_abs/e,signal,atr_abs,0.])
        j=int(np.searchsorted(bt,int(a[s-1,0])))
        if s>=61 and j>=60 and j<len(btc) and bt[j]==a[s-1,0] and bt[j-60]==a[s-61,0]:
            relative=(a[s-1,4]/a[s-61,4]-1)-(btc[j,4]/btc[j-60,4]-1)
            if relative>0:rows['relative_btc'].append([int(s),1.,.01,.01,signal,atr_abs,float(relative)])
        else:audit['btc_alignment_rejected']+=1
        bounce=-1
        for q in range(s,min(s+5,len(a)-1)):
            if a[q,4]>a[q-1,2]:bounce=q;break
        if bounce<0:audit['no_price_bounce']+=1;continue
        low=float(b[i-4:i+1,3].min());fail=-1
        for q in range(bounce+1,min(bounce+11,len(a)-1)):
            if a[q,4]<low:fail=q;break
        if fail<0:audit['no_failure']+=1;continue
        rows['failed_short'].append([fail+1,-1.,.01,.01,signal,atr_abs,low])
    out={}
    for k,r in rows.items():
        r.sort(key=lambda x:(x[0],x[4]))
        # One entry per symbol/time; retain the earliest triggering signal.
        seen=set();unique=[]
        for row in r:
            if row[0] not in seen:unique.append(row);seen.add(row[0])
        out[k]=np.array(unique,float).reshape(-1,7)
    return out,audit

@njit
def simulate(a,candidates,start,end):
    tr=np.empty((len(candidates),5),np.float64);count=0;last=-1;open_count=0;open_net=0.
    boundary=np.searchsorted(a[:,0],end)
    for k in range(len(candidates)):
        row=candidates[k];i=int(row[0]);ts=a[i,0];side=row[1]
        if ts<start or ts>=end or i<=last:continue
        e=a[i,1];target=e*(1+side*row[2]);stop=e*(1-side*row[3]);found=False
        for j in range(i,boundary):
            if side>0:
                if a[j,1]<=stop:px=a[j,1];reason=1
                elif a[j,1]>=target:px=target;reason=2
                elif a[j,3]<=stop:px=stop;reason=1
                elif a[j,2]>=target:px=target;reason=2
                else:continue
            else:
                if a[j,1]>=stop:px=a[j,1];reason=1
                elif a[j,1]<=target:px=target;reason=2
                elif a[j,2]>=stop:px=stop;reason=1
                elif a[j,3]<=target:px=target;reason=2
                else:continue
            tr[count,0]=ts;tr[count,1]=a[j,0];tr[count,2]=side*(px/e-1)-core.COST
            tr[count,3]=reason;tr[count,4]=k;count+=1;last=j;found=True;break
        if not found:
            open_count=1;open_net=side*(a[boundary-1,4]/e-1)-core.COST;break
    return tr[:count],open_count,open_net

def test_symbol(sym,btc):
    a,cov=flow.load_minutes(sym);cand,audit=candidate_entries(a,btc)
    rows={k:{} for k in RULES};result={'symbol':sym,'audit':audit,'variants':{}};ledger=[]
    for key,cc in cand.items():
        result['variants'][key]={}
        for period,(start,end) in flow.PERIODS.items():
            tr,oc,on=simulate(a,cc,start,end);rows[key][period]=tr
            result['variants'][key][period]={**flow.describe(tr,start,end),'open_at_boundary':oc,'open_net_pct':round(on*100,5)}
            if period=='all3y':
                for r in tr:
                    c=cc[int(r[4])]
                    ledger.append({'symbol':sym,'variant':key,'signal_ms':int(c[4]),'entry_ms':int(r[0]),'exit_ms':int(r[1]),'side':int(c[1]),'tp_pct':c[2]*100,'sl_pct':c[3]*100,'atr':float(c[5]) if np.isfinite(c[5]) else None,'relative_return_or_pattern_low':c[6],'net':r[2],'reason':int(r[3])})
    # Regression: new baseline must exactly reproduce prior engine's trade path.
    for period,(start,end) in flow.PERIODS.items():
        prior,oc,on=flow.simulate(a,cand['baseline'][:,0].astype(np.int64),start,end)
        if not np.allclose(prior,rows['baseline'][period],rtol=0,atol=1e-12):raise AssertionError('Baseline regression '+sym+' '+period)
    print('HYP_SYMBOL '+json.dumps(result,allow_nan=False),flush=True)
    return result,rows,cov,ledger

def run():
    btc,bcov=flow.load_minutes('BTCUSDT');results=[];coverage=[bcov];ledger=[]
    rows={k:{p:[] for p in flow.PERIODS} for k in RULES}
    with ThreadPoolExecutor(max_workers=4) as pool:
        for result,tr,cov,led in pool.map(lambda sym:test_symbol(sym,btc),TOP10):
            results.append(result);coverage.append(cov);ledger.extend(led)
            for k in RULES:
                for p in flow.PERIODS:rows[k][p].extend(tr[k][p])
    agg={k:{p:flow.describe(v,*flow.PERIODS[p]) for p,v in periods.items()} for k,periods in rows.items()}
    for k in agg:
        for p in agg[k]:agg[k][p]['trades_per_calendar_day']=round(agg[k][p]['n']/((flow.PERIODS[p][1]-flow.PERIODS[p][0])/86400000),3)
    eligibility={k:all(agg[k][p]['n']>=300 and (agg[k][p]['pf'] or 0)>1.15 and (agg[k][p]['avg_net_bps'] or 0)>0 for p in ('train','validation')) for k in RULES}
    annual={k:{str(y):core.metrics([r for r in rows[k]['all3y'] if core.datetime.fromtimestamp(r[0]/1000,core.timezone.utc).year==y]) for y in (2023,2024,2025,2026)} for k in RULES}
    report={'window':{'start':core.START_DT.isoformat(),'split':core.SPLIT_DT.isoformat(),'end_exclusive':core.END_DT.isoformat()},
            'rules':RULES,'cost_roundtrip_pct':.16,'coverage':coverage,'aggregate':agg,'annual':annual,'results':results,
            'eligible_for_shadow':eligibility,
            'method':['Three proposed ideas were underspecified by reviewer; exact definitions and RR control fixed in code before run.',
                      'Same 10-symbol universe, no symbol selection or parameter grid; 1m actual Binance Futures candles.',
                      'ATR uses last completed 5m signal candle; exits fixed at entry. Relative return uses synchronous completed 60m returns, beta implicitly 1.',
                      'Failed-short candidates sorted by actual entry time and deduplicated; one position per symbol/variant.',
                      'No timeout; conservative same-bar SL, adverse stop-gap fills; open positions at boundaries excluded and separately reported.',
                      '0.10% fees + 0.04% slippage + 0.02% funding reserve, not realized funding.',
                      'Independent fixed notional trades; no portfolio, leverage, liquidation or compound account return.',
                      'Train and validation reset independently; last year already inspected and is not pristine holdout.',
                      'Eligibility threshold from user: PF > 1.15 with at least 300 trades in EACH of train and validation.',
                      'Exact new-engine baseline trade-path equality tested against prior engine for every symbol and period.']}
    out=Path('research-output');out.mkdir(exist_ok=True)
    (out/'three-hypotheses-3y.json').write_text(json.dumps(report,indent=2,allow_nan=False))
    with (out/'three-hypotheses-trades.jsonl').open('w') as f:
        for row in ledger:f.write(json.dumps(row,allow_nan=False)+'\n')
    print('HYP_AGGREGATE '+json.dumps(agg,allow_nan=False),flush=True)
    print('HYP_ELIGIBLE '+json.dumps(eligibility),flush=True)

if __name__=='__main__':run()
