import csv, io, json, urllib.request, zipfile, concurrent.futures, math
from datetime import datetime, timezone, timedelta
import numpy as np

END_DT=datetime(2026,10,6,tzinfo=timezone.utc)
START_DT=END_DT-timedelta(days=1095)
START=int(START_DT.timestamp()*1000); END=int(END_DT.timestamp()*1000)
BASE="https://data.binance.vision/data/futures/um"
UA={"User-Agent":"spacehub-threeyear-all/1.0"}
FEE_RT=.001
SLIP_RT=.0004
FUNDING_RESERVE=.0002

TOP10=["ANKRUSDT","ARKUSDT","1000000MOGUSDT","AGTUSDT","SUSHIUSDT","LQTYUSDT","HYPERUSDT","KAVAUSDT","LUMIAUSDT","ALPINEUSDT"]

STRATS=[
 {"name":"DDDDD_5M","tf":"5m","symbols":TOP10,"kind":"red","n":5,"tp":.01,"sl":.01,"hold":None},
 {"name":"R6_3M","tf":"3m","symbols":["KAVAUSDT","1000000MOGUSDT"],"kind":"red","n":6,"tp":.01,"sl":.01,"hold":None},
 {"name":"R7_3M","tf":"3m","symbols":["KAVAUSDT","LQTYUSDT","LUMIAUSDT"],"kind":"red","n":7,"tp":.01,"sl":.01,"hold":None},
 {"name":"FALL5_10M","tf":"10m","symbols":["KAVAUSDT"],"kind":"fall","n":5,"tp":.01,"sl":.01,"hold":None},
 {"name":"R6_10M","tf":"10m","symbols":["KAVAUSDT","SUSHIUSDT"],"kind":"red","n":6,"tp":.01,"sl":.01,"hold":None},
 {"name":"FALL7_15M","tf":"15m","symbols":["ANKRUSDT","1000000MOGUSDT","SUSHIUSDT","HYPERUSDT","LUMIAUSDT"],"kind":"fall","n":7,"tp":.01,"sl":.01,"hold":None},
 {"name":"FALL5_30M","tf":"30m","symbols":["KAVAUSDT"],"kind":"fall","n":5,"tp":.01,"sl":.01,"hold":None},
 {"name":"FALL4_30M","tf":"30m","symbols":["ANKRUSDT"],"kind":"fall","n":4,"tp":.01,"sl":.01,"hold":None},
 {"name":"AGT_GRR_1M","tf":"1m","symbols":["AGTUSDT"],"kind":"agt","n":3,"tp":.005,"sl":.02,"hold":120},
 {"name":"LQTY_RRR_1M","tf":"1m","symbols":["LQTYUSDT"],"kind":"lqty","n":3,"tp":.005,"sl":.02,"hold":60},
]

def load_zip(url):
    try:
        req=urllib.request.Request(url,headers=UA)
        with urllib.request.urlopen(req,timeout=40) as r: raw=r.read()
        with zipfile.ZipFile(io.BytesIO(raw)) as z: txt=z.read(z.namelist()[0]).decode()
        out=[]
        for row in csv.reader(io.StringIO(txt)):
            if not row or not row[0].isdigit(): continue
            t=int(row[0])
            if START<=t<END:
                out.append((t,float(row[1]),float(row[2]),float(row[3]),float(row[4]),float(row[5])))
        return out
    except Exception:
        return []

def months_between(a,b):
    y,m=a.year,a.month
    out=[]
    while (y,m)<=(b.year,b.month):
        out.append((y,m))
        m+=1
        if m==13:y+=1;m=1
    return out

MONTHS=months_between(START_DT,END_DT)
def load_raw(sym,tf):
    src="5m" if tf=="10m" else tf
    arr=[]
    for y,m in MONTHS:
        # use monthly archives except current incomplete month
        if y==END_DT.year and m==END_DT.month:
            continue
        arr+=load_zip(f"{BASE}/monthly/klines/{sym}/{src}/{sym}-{src}-{y}-{m:02d}.zip")
    # add daily files for current month up to END-1 day
    d=datetime(END_DT.year,END_DT.month,1,tzinfo=timezone.utc)
    while d<END_DT:
        arr+=load_zip(f"{BASE}/daily/klines/{sym}/{src}/{sym}-{src}-{d.year}-{d.month:02d}-{d.day:02d}.zip")
        d+=timedelta(days=1)
    arr=sorted({x[0]:x for x in arr}.values())
    if tf!="10m": return arr
    out=[];i=0
    while i+1<len(arr):
        a,b=arr[i],arr[i+1];bucket=(a[0]//600000)*600000
        if a[0]==bucket and b[0]==a[0]+300000:
            out.append((a[0],a[1],max(a[2],b[2]),min(a[3],b[3]),b[4],a[5]+b[5]))
            i+=2
        else:i+=1
    return out

cache={}
def get(sym,tf):
    key=(sym,tf)
    if key not in cache: cache[key]=load_raw(sym,tf)
    return cache[key]

def rsi14(c):
    d=np.diff(c,prepend=c[0]);g=np.maximum(d,0);l=np.maximum(-d,0)
    ag=np.full(len(c),np.nan);al=np.full(len(c),np.nan)
    if len(c)>14:
        ag[14]=g[1:15].mean();al[14]=l[1:15].mean()
        for i in range(15,len(c)):
            ag[i]=(ag[i-1]*13+g[i])/14;al[i]=(al[i-1]*13+l[i])/14
    rs=np.divide(ag,al,out=np.full(len(c),np.nan),where=al>0)
    return 100-100/(1+rs)

def sma(x,n):
    cs=np.cumsum(np.insert(x,0,0.)); y=(cs[n:]-cs[:-n])/n
    return np.r_[np.full(n-1,np.nan),y]

def signal_indices(b,s):
    if not b:return np.array([],dtype=int)
    a=np.array(b,float);t=a[:,0].astype(np.int64);o=a[:,1];c=a[:,4];v=a[:,5]
    n=s["n"];idx=np.arange(n-1,len(b)-1)
    step={"1m":60000,"3m":180000,"5m":300000,"10m":600000,"15m":900000,"30m":1800000}[s["tf"]]
    ok=np.ones(len(idx),bool)
    for lag in range(n-1):ok&=(t[idx-lag]-t[idx-lag-1]==step)
    if s["kind"]=="red":
        for lag in range(n):ok&=(c[idx-lag]<o[idx-lag])
    elif s["kind"]=="fall":
        for lag in range(n-1):ok&=(c[idx-lag]<c[idx-lag-1])
    elif s["kind"]=="agt":
        ok&=(c[idx-2]>o[idx-2])&(c[idx-1]<o[idx-1])&(c[idx]<o[idx])
        ok&=(c[idx]/o[idx-2]-1<=-.005)
        av=sma(v,20);ok&=np.isfinite(av[idx])&(v[idx]>=1.5*av[idx])
    elif s["kind"]=="lqty":
        ok&=(c[idx-2]<o[idx-2])&(c[idx-1]<o[idx-1])&(c[idx]<o[idx])
        ok&=(c[idx]/o[idx-2]-1<=-.0075)
        rr=rsi14(c);ok&=np.isfinite(rr[idx])&(rr[idx]<=40)
    return idx[ok]

def eval_symbol(sym,s):
    b=get(sym,s["tf"])
    if len(b)<100:return {"sym":sym,"bars":len(b),"n":0,"tp":0,"sl":0,"timeouts":0,"netwins":0,"net":0,"pos":0,"neg":0}
    a=np.array(b,float);t=a[:,0].astype(np.int64);h=a[:,2];l=a[:,3];c=a[:,4]
    idx=signal_indices(b,s)
    tp=s["tp"];sl=s["sl"];H=s["hold"]
    trades=[];last_exit=-1
    maxH=(H if H is not None else len(b))
    for i in idx:
        if i<=last_exit:continue
        e=c[i]; outcome=None; ex=None; px=None
        limit=min(len(b)-1,i+maxH)
        for j in range(i+1,limit+1):
            hitS=l[j]<=e*(1-sl); hitT=h[j]>=e*(1+tp)
            if hitS or hitT:
                if hitS: outcome="SL";px=e*(1-sl)
                else: outcome="TP";px=e*(1+tp)
                ex=j;break
        if outcome is None:
            if H is None:
                break
            outcome="TIME";ex=limit;px=c[ex]
        gross=px/e-1
        net=gross-FEE_RT-SLIP_RT-FUNDING_RESERVE
        trades.append((outcome,net))
        last_exit=ex
    vals=np.array([x[1] for x in trades],float) if trades else np.array([])
    return {"sym":sym,"bars":len(b),"n":len(trades),"tp":sum(x[0]=="TP" for x in trades),"sl":sum(x[0]=="SL" for x in trades),
            "timeouts":sum(x[0]=="TIME" for x in trades),"netwins":int((vals>0).sum()) if len(vals) else 0,
            "net":float(vals.sum()) if len(vals) else 0.0,
            "pos":float(vals[vals>0].sum()) if len(vals) else 0.0,"neg":float(-vals[vals<0].sum()) if len(vals) else 0.0}

def run_strat(s):
    rs=[eval_symbol(sym,s) for sym in s["symbols"]]
    n=sum(x["n"] for x in rs);tp=sum(x["tp"] for x in rs);sl=sum(x["sl"] for x in rs);to=sum(x["timeouts"] for x in rs);nw=sum(x["netwins"] for x in rs)
    pos=sum(x["pos"] for x in rs);neg=sum(x["neg"] for x in rs);net=sum(x["net"] for x in rs)
    return {"strategy":s["name"],"tf":s["tf"],"symbols":s["symbols"],"n":n,"tp_first":tp,"sl_first":sl,"timeouts":to,
            "success_pct":round(100*tp/n,2) if n else 0,
            "resolved_success_pct":round(100*tp/max(1,tp+sl),2),
            "net_win_pct":round(100*nw/n,2) if n else 0,
            "pf_net":round(pos/neg,3) if neg else 999,
            "avg_net_bps":round(10000*net/n,2) if n else 0,
            "net_pct_sum":round(100*net,2),
            "per_symbol":rs}

with concurrent.futures.ThreadPoolExecutor(max_workers=8) as ex:
    results=list(ex.map(run_strat,STRATS))

report={"window":{"start":START_DT.isoformat(),"end_exclusive":END_DT.isoformat(),"days":1095},
        "costs":{"fee_roundtrip_pct":FEE_RT*100,"slippage_roundtrip_pct":SLIP_RT*100,"funding_reserve_pct_per_trade":FUNDING_RESERVE*100},
        "method":"non-overlapping same-symbol trades; LONG only; same-bar TP+SL counted as SL; 1m formulas use their live timeout and timeouts count as failure for success_pct; legacy layers have no timeout; costs affect net metrics, not TP-first success",
        "results":results}
print("HALFYEAR_ALL_START")
print(json.dumps(report,indent=2))
print("HALFYEAR_ALL_END")
