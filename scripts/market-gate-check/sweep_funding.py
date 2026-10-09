"""Preregistered OHLC sweep and extreme settled-funding experiments."""
import csv,io,json,hashlib,zipfile,urllib.request,urllib.error
from pathlib import Path
from datetime import datetime,timezone,timedelta
from concurrent.futures import ThreadPoolExecutor
import numpy as np
from numba import njit
import flow_reversal as flow
core=flow.core
RULES={
 'sweep':'Single 1m low <= prior 20 completed 1m lows minimum minus 1.5*latest pre-sweep completed 5m ATR14; volume >=2*prior20 volume mean. Immediately next 1m close > broken prior20 low; LONG at following minute open. Target entry+1.5*(entry-sweep_low), stop sweep_low*0.997; 45 completed minutes maximum.',
 'funding':'Settled funding >=+0.0005 -> LONG after first completed 5m close down >=0.4% versus latest 1m close known at publication; <=-0.0005 -> SHORT after up >=0.4%. Confirmation closes within 30m; entry next minute open. TP0.8%, SL0.6%; exit on next observed settlement at first minute open at/after it, or 8h after entry, whichever first. Settlement precedes that timeout exit, so charge/credit is included.',
}

def read_zip(url):
    for attempt in range(3):
        try:
            with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'spacehub-sweep-funding/1.0'}),timeout=30) as r:raw=r.read()
            with zipfile.ZipFile(io.BytesIO(raw)) as z:txt=z.read(z.namelist()[0]).decode()
            return txt,{'url':url,'sha256':hashlib.sha256(raw).hexdigest()}
        except urllib.error.HTTPError as e:
            if e.code==404:return None,{'url':url,'missing':404}
            if attempt==2:raise
        except Exception:
            if attempt==2:raise

def load_funding(sym):
    out=[];manifest=[];y,m=core.LOAD_DT.year,core.LOAD_DT.month
    month_end=datetime(core.END_DT.year,core.END_DT.month,1,tzinfo=timezone.utc)
    coverage_end=int(month_end.timestamp()*1000)
    while (y,m)<=(core.END_DT.year,core.END_DT.month):
        u=f'{core.BASE}/monthly/fundingRate/{sym}/{sym}-fundingRate-{y}-{m:02d}.zip'
        txt,meta=read_zip(u);manifest.append(meta)
        if txt:
            for r in csv.DictReader(io.StringIO(txt)):
                t=int(r['calc_time']);rate=float(r['last_funding_rate']);interval=float(r['funding_interval_hours'])
                if core.LOAD<=t<core.END:out.append((t,rate,interval))
            if (y,m)==(core.END_DT.year,core.END_DT.month):coverage_end=core.END
        elif (y,m)==(core.END_DT.year,core.END_DT.month):
            # Probe official daily archives; this is not an API or geo restriction bypass.
            for day in range(1,core.END_DT.day):
                u=f'{core.BASE}/daily/fundingRate/{sym}/{sym}-fundingRate-{y}-{m:02d}-{day:02d}.zip'
                daily,dm=read_zip(u);manifest.append(dm)
                if daily is None:break
                for r in csv.DictReader(io.StringIO(daily)):
                    out.append((int(r['calc_time']),float(r['last_funding_rate']),float(r['funding_interval_hours'])))
                coverage_end=int((datetime(y,m,day,tzinfo=timezone.utc)+timedelta(days=1)).timestamp()*1000)
        m+=1
        if m==13:y+=1;m=1
    out=sorted({x[0]:x for x in out}.values())
    if not out:raise ValueError('No historical funding for '+sym)
    f=np.array(out,float)
    # A larger-than-8h internal gap is suspicious for these perpetual coin contracts.
    if np.any(np.diff(f[:,0])>8*3600000+60000):raise ValueError('Funding gap '+sym)
    if coverage_end-f[-1,0]>8*3600000+60000:raise ValueError('Funding tail gap '+sym)
    meta={'symbol':sym,'records':len(f),'first_ms':int(f[0,0]),'last_ms':int(f[-1,0]),
          'coverage_end_exclusive':coverage_end,'interval_hours':sorted(set(f[:,2].tolist())),
          'extreme_positive':int(np.sum(f[:,1]>=.0005)),'extreme_negative':int(np.sum(f[:,1]<=-.0005)),'archives':manifest}
    print('FUNDING_COVERAGE '+json.dumps({k:v for k,v in meta.items() if k!='archives'}),flush=True)
    return f,meta

@njit
def find_sweeps(a,b,atr):
    out=np.empty((len(a),8));n=0;bt=b[:,0]+300000
    for q in range(20,len(a)-2):
        if a[q+2,0]<core.START:continue
        j=np.searchsorted(bt,a[q,0],side='right')-1
        if j<0 or not np.isfinite(atr[j]):continue
        level=np.min(a[q-20:q,3]);vol=np.mean(a[q-20:q,5])
        if vol<=0 or a[q,3]>level-1.5*atr[j] or a[q,5]<2*vol:continue
        if a[q+1,4]<=level:continue
        e=a[q+2,1];low=a[q,3]
        if e<=low:continue
        out[n,0]=q+2;out[n,1]=1;out[n,2]=(1.5*(e-low))/e
        out[n,3]=(e-low*.997)/e;out[n,4]=a[q+2,0]+45*60000
        out[n,5]=a[q,0];out[n,6]=low;out[n,7]=-1;n+=1
    return out[:n]

def find_funding(a,b,f,coverage_end):
    rows=[];audit={'no_next_funding':0,'no_price_reference':0,'no_countermove':0,'next_event_before_entry':0}
    closes=a[:,0]+60000;bc=b[:,0]+300000
    for k,(ts,rate,_) in enumerate(f):
        if ts<core.START or ts>=coverage_end or abs(rate)<.0005:continue
        if k+1>=len(f):audit['no_next_funding']+=1;continue
        anchor=int(np.searchsorted(closes,ts,side='right')-1)
        if anchor<0 or ts-closes[anchor]>=60000:audit['no_price_reference']+=1;continue
        reference=a[anchor,4];side=1 if rate>0 else -1
        first=np.searchsorted(bc,ts,side='right');last=np.searchsorted(bc,ts+30*60000,side='right')
        confirm=-1
        for j in range(first,last):
            move=b[j,4]/reference-1
            if side*move<=-.004:confirm=j;break
        if confirm<0:audit['no_countermove']+=1;continue
        entry_ts=int(bc[confirm]);i=int(np.searchsorted(a[:,0],entry_ts))
        if i>=len(a) or a[i,0]!=entry_ts:continue
        if entry_ts>=f[k+1,0]:audit['next_event_before_entry']+=1;continue
        next_exit=int(np.ceil(f[k+1,0]/60000)*60000)
        deadline=min(entry_ts+8*3600000,next_exit)
        rows.append([i,side,.008,.006,deadline,ts,rate,k+1])
    rows.sort(key=lambda r:r[0]);seen=set();unique=[]
    for r in rows:
        if r[0] not in seen:seen.add(r[0]);unique.append(r)
    return np.array(unique,float).reshape(-1,8),audit

@njit
def simulate(a,cand,start,end,timeout_at_open):
    # Return estimated exit time: open-gap fills at minute open, intrabar fills at minute close.
    out=np.empty((len(cand),6));n=0;last_exit=-1.;censored=0
    boundary=np.searchsorted(a[:,0],end)
    for k in range(len(cand)):
        row=cand[k];i=int(row[0]);ts=a[i,0];side=row[1]
        if ts<start or ts>=end or ts<last_exit:continue
        e=a[i,1];target=e*(1+side*row[2]);stop=e*(1-side*row[3]);deadline=row[4];found=False
        for j in range(i,boundary):
            if timeout_at_open and a[j,0]>=deadline:
                px=a[j,1];reason=3;xt=a[j,0];found=True
            else:
                reason=0;xt=a[j,0]+60000
                if side>0:
                    if a[j,1]<=stop:px=a[j,1];reason=1;xt=a[j,0]
                    elif a[j,1]>=target:px=target;reason=2;xt=a[j,0]
                    elif a[j,3]<=stop:px=stop;reason=1
                    elif a[j,2]>=target:px=target;reason=2
                else:
                    if a[j,1]>=stop:px=a[j,1];reason=1;xt=a[j,0]
                    elif a[j,1]<=target:px=target;reason=2;xt=a[j,0]
                    elif a[j,2]>=stop:px=stop;reason=1
                    elif a[j,3]<=target:px=target;reason=2
                if reason==0 and not timeout_at_open and a[j,0]+60000>=deadline:
                    px=a[j,4];reason=3
                if reason>0:found=True
            if found:
                out[n,0]=ts;out[n,1]=xt;out[n,2]=side*(px/e-1)-.0016
                out[n,3]=reason;out[n,4]=k;out[n,5]=e;n+=1;last_exit=xt
                # An open-time fill blocks duplicate entries at that same instant.
                if xt==a[j,0]:last_exit+=1
                break
        if not found:censored+=1;break
    return out[:n],censored

def mark_events(sym,times):
    groups={};result={};manifest=[]
    for ts in set(times):
        nominal=int(ts//60000)*60000;d=datetime.fromtimestamp(nominal/1000,timezone.utc)
        groups.setdefault((d.year,d.month),set()).add(nominal)
    for (y,m),needed in groups.items():
        url=f'{core.BASE}/monthly/markPriceKlines/{sym}/1m/{sym}-1m-{y}-{m:02d}.zip'
        txt,meta=read_zip(url);manifest.append(meta)
        if txt is None:raise ValueError('Missing mark-price archive '+url)
        skip=0 if txt.split(',',1)[0].isdigit() else 1
        arr=np.loadtxt(io.StringIO(txt),delimiter=',',skiprows=skip,usecols=(0,1,2,3),ndmin=2)
        for t,o,h,l in arr:
            if int(t) in needed:result[int(t)]=(float(o),float(h),float(l))
        if any(t not in result for t in needed):raise ValueError('Missing mark-price settlement minute '+sym)
    return result,manifest

def funding_links(tr,cand,f):
    # Funding strategy never enters at a settlement, and exits on the next one at the latest.
    links=[]
    for n,row in enumerate(tr):
        k=int(cand[int(row[4]),7]);ts=f[k,0]
        if row[0]<ts<=row[1]:links.append((n,k))
    return links

def apply_funding(tr,cand,f,marks):
    adjusted=tr.copy();cash=[]
    for n,k in funding_links(tr,cand,f):
        row=tr[n];side=cand[int(row[4]),1];ts,rate,_=f[k]
        op,hi,lo=marks[int(ts//60000)*60000]
        amount=-side*rate*op/row[5]
        bounds=sorted((-side*rate*hi/row[5],-side*rate*lo/row[5]))
        adjusted[n,2]+=amount;cash.append({'trade_index':n,'settlement_ms':int(ts),'rate':rate,'mark_open_proxy':op,'cashflow_return':amount,'cashflow_return_bounds':bounds})
    return adjusted,cash

def describe(rows,start,end):
    m=core.metrics(rows);m['weekly_block_avg_bps_ci95']=flow.weekly_ci(rows,start,end)
    m['trades_per_calendar_day']=round(len(rows)/((end-start)/86400000),3)
    m['avg_holding_minutes']=round(float(np.mean([(r[1]-r[0])/60000 for r in rows])),3) if len(rows) else None
    m['cost_sensitivity_avg_bps']={str(c):round(m['avg_net_bps']+16-c,4) if len(rows) else None for c in (10,14,16,20)}
    return m

def run_symbol(sym):
    a,coverage=flow.load_minutes(sym);b,_=flow.five_minutes(a)
    sweep=find_sweeps(a,b,flow.atr14(b));f,fcov=load_funding(sym)
    fund,faudit=find_funding(a,b,f,fcov['coverage_end_exclusive'])
    funds_end=min(core.END,fcov['coverage_end_exclusive'])
    periods={'sweep':flow.PERIODS,'funding':{'train':(core.START,core.SPLIT),'validation':(core.SPLIT,funds_end),'all3y':(core.START,funds_end)}}
    raw={};counts={};needed=[];candidates={'sweep':sweep,'funding':fund}
    for variant,cand in candidates.items():
        raw[variant]={};counts[variant]={}
        for p,(start,end) in periods[variant].items():
            tr,censored=simulate(a,cand,start,end,variant=='funding');raw[variant][p]=tr;counts[variant][p]=censored
            if variant=='funding':needed.extend(f[k,0] for _,k in funding_links(tr,cand,f))
    marks,mark_manifest=mark_events(sym,needed)
    result={'symbol':sym,'funding_candidate_audit':faudit,'candidate_counts':{'sweep':len(sweep),'funding':len(fund)},'variants':{}};rows={};ledger=[]
    for variant,cand in candidates.items():
        result['variants'][variant]={};rows[variant]={}
        for p,(start,end) in periods[variant].items():
            tr=raw[variant][p];cash=[]
            if variant=='funding':tr,cash=apply_funding(tr,cand,f,marks)
            rows[variant][p]=tr
            result['variants'][variant][p]={**describe(tr,start,end),'censored':counts[variant][p],
                'funding_charged_or_credited_trades':len(cash),'funding_cashflow_sum':sum(c['cashflow_return'] for c in cash),
                'funding_cashflow_sum_bounds':[sum(c['cashflow_return_bounds'][j] for c in cash) for j in (0,1)]}
            if p=='all3y':
                cmap={c['trade_index']:c for c in cash}
                for n,r in enumerate(tr):
                    c=cand[int(r[4])];ledger.append({'symbol':sym,'variant':variant,'entry_ms':int(r[0]),'exit_ms_estimate':int(r[1]),'net':r[2],'reason':int(r[3]),'side':int(c[1]),'signal_ms':int(c[5]),'tp_pct':100*c[2],'sl_pct':100*c[3],'deadline_ms':int(c[4]),'funding':cmap.get(n)})
    cov={'ohlcv':coverage,'funding':fcov,'mark_archives':mark_manifest,'mark_events_count':len(marks)}
    print('SF_SYMBOL '+json.dumps(result,allow_nan=False),flush=True)
    return result,rows,cov,ledger,periods

def run():
    results=[];coverage=[];ledger=[];allrows={k:{p:[] for p in flow.PERIODS} for k in RULES};periods=None
    with ThreadPoolExecutor(max_workers=4) as pool:
        for result,rows,cov,led,pp in pool.map(run_symbol,flow.TOP10):
            if periods is not None and periods!=pp:raise ValueError('Funding coverage differs between symbols; do not aggregate unlike windows')
            periods=pp;results.append(result);coverage.append(cov);ledger.extend(led)
            for k in RULES:
                for p in flow.PERIODS:allrows[k][p].extend(rows[k][p])
    agg={k:{p:describe(tr,*periods[k][p]) for p,tr in prs.items()} for k,prs in allrows.items()}
    eligible={k:all(agg[k][p]['n']>=300 and (agg[k][p]['pf'] or 0)>1.15 and (agg[k][p]['avg_net_bps'] or 0)>0 for p in ('train','validation')) for k in RULES}
    report={'rules':RULES,'periods_ms':periods,'cost_roundtrip_pct':.16,'aggregate':agg,'results':results,'coverage':coverage,'eligible':eligible,
      'method':['Two new signals independent of DDDDD; exact single-bar sweep interpretation frozen before run, no parameter search.',
                'OHLCV sweep does not prove stop orders or liquidations occurred; it is a price/volume proxy.',
                'Funding sign mapping follows requested specification: positive LONG after drop; negative SHORT after rise.',
                'Use actual archived settlement times and per-settlement thresholds; funding intervals may differ from 8h.',
                'Archive timestamps treated as rate-known times; first qualifying completed 5m bar thereafter, no predicted funding data.',
                'Published 5m confirmation reference is latest fully closed 1m close at publication.',
                '0.16% fixed deduction retained as requested, plus actual historical funding RATE cash flow for funding strategy; 0.14% sensitivity removes duplicate 0.02% reserve.',
                'Funding cash flow uses settlement-minute MARK OPEN as proxy for exact millisecond mark; report high/low bounds. Not exact account funding ledger.',
                'Funding exit on next settlement includes cashflow before exit. Intrabar barrier timestamp approximated by minute close, potentially charging same-minute funding conservatively.',
                'Current-month funding archive unavailable and official API probe returned HTTP451. Do not fabricate absent October funding.',
                'Nonoverlap per symbol/variant. Train/validation reset independently; no portfolio, leverage or compounding. Previously inspected validation year is not clean holdout.',
                'Liquidity sweep: last-known pre-sweep 5m ATR, prior20 1m low/volume, next minute reclaim, entry following minute; 45m timeout at close.',
                'Eligibility: PF>1.15 and >=300 trades in EACH train and validation; any apparent success needs untouched forward Shadow.']}
    out=Path('research-output');out.mkdir(exist_ok=True)
    (out/'sweep-funding-3y.json').write_text(json.dumps(report,indent=2,allow_nan=False))
    with (out/'sweep-funding-trades.jsonl').open('w') as f:
        for row in ledger:f.write(json.dumps(row,allow_nan=False)+'\n')
    print('SF_PERIODS '+json.dumps(periods),flush=True)
    print('SF_AGGREGATE '+json.dumps(agg),flush=True)
    print('SF_ELIGIBLE '+json.dumps(eligible),flush=True)

if __name__=='__main__':run()
