"""Broad alpha discovery on Binance Futures. Research only; never touches trading state.

Searches signal families beyond candle-color patterns and includes wide exits such as
TP 10% / SL 4%. Selection is train-only with an internal temporal sub-split,
then frozen validation on the last year.
"""
import json
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import numpy as np

import market_gate_check as core

SYMBOLS = [
    "BTCUSDT","ETHUSDT","SOLUSDT","BNBUSDT","XRPUSDT","DOGEUSDT","ADAUSDT","AVAXUSDT",
    "LINKUSDT","DOTUSDT","LTCUSDT","BCHUSDT","NEARUSDT","INJUSDT","ATOMUSDT","AAVEUSDT",
]
COST = core.COST
START, SPLIT, END = core.START, core.SPLIT, core.END
DEV_END = int(datetime(2025, 4, 7, tzinfo=timezone.utc).timestamp()*1000)
TFS = (15, 60)

EXIT_CONFIGS = [
    (.005,.005,4), (.0075,.005,6), (.010,.005,8), (.010,.0075,12),
    (.015,.0075,12), (.020,.010,24), (.025,.010,24), (.030,.015,24),
    (.040,.020,36), (.050,.020,48), (.060,.030,48), (.080,.030,72),
    (.100,.040,72), (.120,.050,96),
    (.005,.010,8), (.010,.020,24), (.020,.040,48), (.040,.060,72),
]

MIN_DEV = 100
MIN_SELECT = 30
MIN_VAL = 50
TOP_EVENT = 20
TOP_XS = 20

def resample_1h(a):
    t=a[:,0].astype(np.int64)
    idx=np.flatnonzero(t%3600000==0)
    idx=idx[idx+3<len(a)]
    idx=idx[t[idx+3]-t[idx]==2700000]
    b=a[idx[:,None]+np.arange(4)]
    return np.column_stack((
        a[idx,0],a[idx,1],b[:,:,2].max(axis=1),b[:,:,3].min(axis=1),a[idx+3,4],b[:,:,5].sum(axis=1)
    ))

def ema(x,n):
    out=np.full(len(x),np.nan)
    if len(x)<n:return out
    out[n-1]=np.mean(x[:n]);alpha=2/(n+1)
    for i in range(n,len(x)):out[i]=out[i-1]+alpha*(x[i]-out[i-1])
    return out

def rsi(x,n=14):
    out=np.full(len(x),np.nan)
    if len(x)<=n:return out
    d=np.diff(x);g=np.maximum(d,0);l=np.maximum(-d,0)
    ag=np.mean(g[:n]);al=np.mean(l[:n])
    out[n]=100*ag/(ag+al) if ag+al else 50
    for i in range(n+1,len(x)):
        ag=(ag*(n-1)+g[i-1])/n;al=(al*(n-1)+l[i-1])/n
        out[i]=100*ag/(ag+al) if ag+al else 50
    return out

def atr(a,n=14):
    out=np.full(len(a),np.nan)
    if len(a)<=n:return out
    tr=np.zeros(len(a))
    tr[0]=a[0,2]-a[0,3]
    for i in range(1,len(a)):
        tr[i]=max(a[i,2]-a[i,3],abs(a[i,2]-a[i-1,4]),abs(a[i,3]-a[i-1,4]))
    v=np.mean(tr[1:n+1]);out[n]=v
    for i in range(n+1,len(a)):
        v=(v*(n-1)+tr[i])/n;out[i]=v
    return out

def rolling_mean(x,n):
    out=np.full(len(x),np.nan)
    if len(x)<n:return out
    cs=np.r_[0.0,np.cumsum(x)]
    out[n-1:]=(cs[n:]-cs[:-n])/n
    return out

def rolling_std(x,n):
    out=np.full(len(x),np.nan)
    if len(x)<n:return out
    cs=np.r_[0.0,np.cumsum(x)];cs2=np.r_[0.0,np.cumsum(x*x)]
    s=cs[n:]-cs[:-n];q=cs2[n:]-cs2[:-n]
    v=np.maximum(0,q/n-(s/n)**2)
    out[n-1:]=np.sqrt(v)
    return out

def rolling_prev_max(x,n):
    out=np.full(len(x),np.nan)
    for i in range(n,len(x)):out[i]=np.max(x[i-n:i])
    return out

def rolling_prev_min(x,n):
    out=np.full(len(x),np.nan)
    for i in range(n,len(x)):out[i]=np.min(x[i-n:i])
    return out

def features(a):
    c=a[:,4];v=a[:,5]
    e20=ema(c,20);e100=ema(c,100);rr=rsi(c,14);aa=atr(a,14)
    ma20=rolling_mean(c,20);sd20=rolling_std(c,20);vm20=rolling_mean(v,20)
    z=(c-ma20)/sd20
    ret4=np.full(len(a),np.nan);ret8=np.full(len(a),np.nan);ret16=np.full(len(a),np.nan)
    ret4[4:]=c[4:]/c[:-4]-1;ret8[8:]=c[8:]/c[:-8]-1;ret16[16:]=c[16:]/c[:-16]-1
    return dict(e20=e20,e100=e100,rsi=rr,atr=aa,z=z,vm20=vm20,ret4=ret4,ret8=ret8,ret16=ret16)

def metrics(v):
    v=np.asarray(v,float);n=len(v)
    if not n:return {"n":0,"wins":0,"wr":None,"pf":None,"avg_net_bps":None,"sum_net_pct":0}
    wins=int((v>0).sum());pos=float(v[v>0].sum());neg=float(-v[v<0].sum())
    return {
        "n":n,"wins":wins,"wr":round(100*wins/n,3),
        "pf":round(pos/neg,4) if neg else None,
        "avg_net_bps":round(float(v.mean())*10000,4),
        "sum_net_pct":round(float(v.sum())*100,4),
    }

def build_signal_candidates(a, f, btc, bf, tf):
    c=a[:,4];o=a[:,1];h=a[:,2];l=a[:,3];v=a[:,5]
    out=[]
    def add(name, side, mask, detail):
        idx=np.flatnonzero(mask)
        idx=idx[idx+1<len(a)]
        out.append({"name":name,"side":side,"idx":idx.astype(np.int64),"detail":detail})

    # Donchian / volume breakout continuation.
    for n in (20,50):
        ph=rolling_prev_max(h,n);pl=rolling_prev_min(l,n)
        for vmult in (1.0,1.5):
            vol=np.isfinite(f["vm20"])&(v>=vmult*f["vm20"])
            add(f"breakout{n}_v{vmult}",1,np.isfinite(ph)&(c>ph)&vol,{"family":"breakout","n":n,"volume_mult":vmult})
            add(f"breakout{n}_v{vmult}",-1,np.isfinite(pl)&(c<pl)&vol,{"family":"breakout","n":n,"volume_mult":vmult})

    # Trend pullback recapture.
    bull=np.isfinite(f["e100"])&(f["e20"]>f["e100"]);bear=np.isfinite(f["e100"])&(f["e20"]<f["e100"])
    cross_up=np.r_[False,(c[1:]>f["e20"][1:])&(c[:-1]<=f["e20"][:-1])]
    cross_dn=np.r_[False,(c[1:]<f["e20"][1:])&(c[:-1]>=f["e20"][:-1])]
    add("trend_pullback",1,bull&cross_up&(f["rsi"]>=45)&(f["rsi"]<=65),{"family":"trend_pullback"})
    add("trend_pullback",-1,bear&cross_dn&(f["rsi"]>=35)&(f["rsi"]<=55),{"family":"trend_pullback"})

    # Mean reversion at z-score extremes; both unrestricted and against short-term impulse.
    for zthr in (1.5,2.0,2.5):
        add(f"zrevert_{zthr}",1,f["z"]<=-zthr,{"family":"mean_reversion","z":zthr})
        add(f"zrevert_{zthr}",-1,f["z"]>=zthr,{"family":"mean_reversion","z":zthr})

    # Volatility expansion continuation.
    body=np.abs(c-o);atrv=f["atr"]
    for mult in (1.25,1.75,2.25):
        vol=np.isfinite(f["vm20"])&(v>=1.25*f["vm20"])
        add(f"vol_expand_{mult}",1,np.isfinite(atrv)&(c>o)&(body>=mult*atrv)&vol,{"family":"vol_expansion","atr_mult":mult})
        add(f"vol_expand_{mult}",-1,np.isfinite(atrv)&(c<o)&(body>=mult*atrv)&vol,{"family":"vol_expansion","atr_mult":mult})

    # Shock reversal after large 4-bar move relative to ATR.
    for mult in (2.0,3.0,4.0):
        shock=f["ret4"]/(np.maximum(f["atr"],1e-12)/c)
        add(f"shock_revert_{mult}",1,shock<=-mult,{"family":"shock_reversal","atr_mult":mult})
        add(f"shock_revert_{mult}",-1,shock>=mult,{"family":"shock_reversal","atr_mult":mult})

    # Relative strength vs BTC over ~4h, with own long-term trend alignment.
    bt=btc[:,0].astype(np.int64);j=np.searchsorted(bt,a[:,0].astype(np.int64))
    exact=j<len(bt);jj=np.minimum(j,len(bt)-1);exact&=bt[jj]==a[:,0].astype(np.int64)
    br=np.full(len(a),np.nan);br[exact]=bf["ret16"][jj[exact]]
    rel=f["ret16"]-br
    for thr in (.01,.02,.03):
        add(f"relative_strength_{thr}",1,bull&(rel>=thr),{"family":"relative_strength","threshold":thr})
        add(f"relative_strength_{thr}",-1,bear&(rel<=-thr),{"family":"relative_strength","threshold":thr})

    # RSI exhaustion with trend/context variants.
    add("rsi_exhaust",1,f["rsi"]<=25,{"family":"rsi_exhaust"})
    add("rsi_exhaust",-1,f["rsi"]>=75,{"family":"rsi_exhaust"})
    add("rsi_trend",1,bull&(f["rsi"]>=55)&(f["rsi"]<=70),{"family":"rsi_trend"})
    add("rsi_trend",-1,bear&(f["rsi"]<=45)&(f["rsi"]>=30),{"family":"rsi_trend"})
    return out

def period_mask(a, idx, start, end):
    et=a[idx+1,0]
    return idx[(et>=start)&(et<end)]

def simulate(a, idx, side, tp, sl, hold_hours, tf, start, end):
    hold=max(1,int(round(hold_hours*60/tf)))
    boundary=np.searchsorted(a[:,0],end)
    vals=[];last=-1
    for i in idx:
        i=int(i)+1
        if i<=last or i>=boundary:continue
        ts=a[i,0]
        if ts<start or ts>=end:continue
        e=a[i,1]
        target=e*(1+side*tp);stop=e*(1-side*sl)
        lim=min(boundary,i+hold)
        done=False
        for j in range(i,lim):
            if side>0:
                if a[j,1]<=stop:px=a[j,1]
                elif a[j,1]>=target:px=target
                elif a[j,3]<=stop:px=stop
                elif a[j,2]>=target:px=target
                else:continue
            else:
                if a[j,1]>=stop:px=a[j,1]
                elif a[j,1]<=target:px=target
                elif a[j,2]>=stop:px=stop
                elif a[j,3]<=target:px=target
                else:continue
            vals.append(side*(px/e-1)-COST);last=j;done=True;break
        if not done:
            if i+hold>boundary:break
            j=i+hold-1;vals.append(side*(a[j,4]/e-1)-COST);last=j
    return np.array(vals,float)

def event_search(data):
    # Aggregate identical signal definitions across symbols. BTC is reference only when needed.
    btc_by_tf={}
    for tf in TFS:
        b=data["BTCUSDT"][tf];btc_by_tf[tf]=(b,features(b))
    defs={}
    for tf in TFS:
        for sym in SYMBOLS:
            a=data[sym][tf];f=features(a);btc,bf=btc_by_tf[tf]
            for s in build_signal_candidates(a,f,btc,bf,tf):
                key=(tf,s["name"],s["side"])
                defs.setdefault(key,{"tf":tf,"name":s["name"],"side":s["side"],"detail":s["detail"],"by_symbol":{}})
                defs[key]["by_symbol"][sym]=s["idx"]

    rows=[]
    for key,d in defs.items():
        tf=d["tf"];side=d["side"]
        best=None
        for tp,sl,hold in EXIT_CONFIGS:
            vals_dev=[];vals_sel=[]
            for sym in SYMBOLS:
                a=data[sym][tf];idx=d["by_symbol"].get(sym,np.empty(0,dtype=np.int64))
                x=period_mask(a,idx,START,DEV_END)
                y=period_mask(a,idx,DEV_END,SPLIT)
                if len(x):
                    z=simulate(a,x,side,tp,sl,hold,tf,START,DEV_END)
                    if len(z):vals_dev.append(z)
                if len(y):
                    z=simulate(a,y,side,tp,sl,hold,tf,DEV_END,SPLIT)
                    if len(z):vals_sel.append(z)
            md=metrics(np.concatenate(vals_dev) if vals_dev else [])
            ms=metrics(np.concatenate(vals_sel) if vals_sel else [])
            robust=(md["n"]>=MIN_DEV and ms["n"]>=MIN_SELECT and (md["avg_net_bps"] or -999)>0 and (ms["avg_net_bps"] or -999)>0)
            score=min(md["avg_net_bps"] or -999,ms["avg_net_bps"] or -999) if robust else -999
            rec={"tp_pct":tp*100,"sl_pct":sl*100,"hold_hours":hold,"dev":md,"selection":ms,"robust_train":robust,"score":score}
            if best is None or rec["score"]>best["score"] or (rec["score"]==best["score"] and (ms["pf"] or 0)>(best["selection"]["pf"] or 0)):
                best=rec
        # If nothing robust, still retain the best combined train average for diagnostics.
        if best is None or best["score"]<=-999:
            alts=[]
            for tp,sl,hold in EXIT_CONFIGS:
                vals=[]
                for sym in SYMBOLS:
                    a=data[sym][tf];idx=d["by_symbol"].get(sym,np.empty(0,dtype=np.int64))
                    z=simulate(a,period_mask(a,idx,START,SPLIT),side,tp,sl,hold,tf,START,SPLIT)
                    if len(z):vals.append(z)
                m=metrics(np.concatenate(vals) if vals else [])
                alts.append((m["avg_net_bps"] if m["avg_net_bps"] is not None else -999,tp,sl,hold,m))
            _,tp,sl,hold,m=max(alts,key=lambda x:x[0])
            best={"tp_pct":tp*100,"sl_pct":sl*100,"hold_hours":hold,"dev":None,"selection":None,"robust_train":False,"score":-999,"combined_train":m}

        vals=[]
        for sym in SYMBOLS:
            a=data[sym][tf];idx=d["by_symbol"].get(sym,np.empty(0,dtype=np.int64))
            v=period_mask(a,idx,SPLIT,END)
            if len(v):
                z=simulate(a,v,side,best["tp_pct"]/100,best["sl_pct"]/100,best["hold_hours"],tf,SPLIT,END)
                if len(z):vals.append(z)
        mv=metrics(np.concatenate(vals) if vals else [])
        eligible=bool(best["robust_train"] and mv["n"]>=MIN_VAL and (mv["pf"] or 0)>1.10 and (mv["avg_net_bps"] or -999)>0)
        rows.append({
            "tf_min":tf,"signal":d["name"],"family":d["detail"]["family"],"detail":d["detail"],
            "side":"LONG" if side==1 else "SHORT","selected_exit_train_only":best,
            "validation":mv,"eligible_for_shadow":eligible,
        })
    rows.sort(key=lambda r:((r["validation"]["pf"] or -1),(r["validation"]["avg_net_bps"] or -999)),reverse=True)
    return rows

def align_hourly(data):
    common=None
    for sym in SYMBOLS:
        t=data[sym][60][:,0].astype(np.int64)
        s=set(t[(t>=START-72*3600000)&(t<END)].tolist())
        common=s if common is None else common&s
    times=np.array(sorted(common),dtype=np.int64)
    opens=np.empty((len(times),len(SYMBOLS)));closes=np.empty_like(opens)
    for k,sym in enumerate(SYMBOLS):
        a=data[sym][60];t=a[:,0].astype(np.int64);j=np.searchsorted(t,times)
        opens[:,k]=a[j,1];closes[:,k]=a[j,4]
    return times,opens,closes

def xs_search(data):
    times,opens,closes=align_hourly(data)
    configs=[]
    for look in (6,12,24,48,72):
        for reb in (4,8,12,24):
            for nsel in (2,3,4):
                for mode in ("momentum","contrarian"):
                    configs.append((look,reb,nsel,mode))
    rows=[]
    for look,reb,nsel,mode in configs:
        vals={"dev":[],"selection":[],"validation":[]}
        legs={"dev":0,"selection":0,"validation":0}
        # Use a fixed UTC cadence to avoid adaptive timing.
        for i in range(look,len(times)-reb-1):
            if (times[i]//3600000)%reb!=0:continue
            if times[i]-times[i-look]!=look*3600000:continue
            entry_i=i+1;exit_i=entry_i+reb
            if exit_i>=len(times) or times[exit_i]-times[entry_i]!=reb*3600000:continue
            mom=closes[i]/closes[i-look]-1
            order=np.argsort(mom)
            if mode=="momentum":
                short_idx=order[:nsel];long_idx=order[-nsel:]
            else:
                long_idx=order[:nsel];short_idx=order[-nsel:]
            long_net=opens[exit_i,long_idx]/opens[entry_i,long_idx]-1-COST
            short_net=-(opens[exit_i,short_idx]/opens[entry_i,short_idx]-1)-COST
            basket=float((long_net.mean()+short_net.mean())/2)
            ts=times[entry_i]
            if START<=ts<DEV_END:p="dev"
            elif DEV_END<=ts<SPLIT:p="selection"
            elif SPLIT<=ts<END:p="validation"
            else:continue
            vals[p].append(basket);legs[p]+=2*nsel
        md,ms,mv=metrics(vals["dev"]),metrics(vals["selection"]),metrics(vals["validation"])
        robust=md["n"]>=MIN_DEV and ms["n"]>=MIN_SELECT and (md["avg_net_bps"] or -999)>0 and (ms["avg_net_bps"] or -999)>0
        eligible=robust and mv["n"]>=MIN_VAL and (mv["pf"] or 0)>1.10 and (mv["avg_net_bps"] or -999)>0
        rows.append({
            "family":"cross_sectional","mode":mode,"lookback_hours":look,"rebalance_hold_hours":reb,
            "long_count":nsel,"short_count":nsel,"dev":md,"selection":ms,"validation":mv,
            "legs":legs,"robust_train":bool(robust),"eligible_for_shadow":bool(eligible),
        })
    rows.sort(key=lambda r:((r["validation"]["pf"] or -1),(r["validation"]["avg_net_bps"] or -999)),reverse=True)
    return rows

def run():
    print("LOADING_15M",flush=True)
    with ThreadPoolExecutor(max_workers=6) as pool:
        loaded=list(pool.map(lambda s:(s,core.load(s,"15m")[0]),SYMBOLS))
    data={}
    for sym,a15 in loaded:
        data[sym]={15:a15,60:resample_1h(a15)}
        print("LOADED",sym,len(a15),len(data[sym][60]),flush=True)

    events=event_search(data)
    print("EVENT_TOP "+json.dumps(events[:10]),flush=True)
    xs=xs_search(data)
    print("XS_TOP "+json.dumps(xs[:10]),flush=True)

    eligible_events=[r for r in events if r["eligible_for_shadow"]]
    eligible_xs=[r for r in xs if r["eligible_for_shadow"]]
    report={
        "window":{"start":core.START_DT.isoformat(),"dev_end":"2025-04-07T00:00:00+00:00","split":core.SPLIT_DT.isoformat(),"end_exclusive":core.END_DT.isoformat()},
        "symbols":SYMBOLS,"roundtrip_cost_pct":COST*100,
        "exit_configs":[{"tp_pct":a*100,"sl_pct":b*100,"hold_hours":h} for a,b,h in EXIT_CONFIGS],
        "method":[
            "Research only; no paper/live account or runtime is modified.",
            "Actual Binance Futures 15m archives; 1h bars are built from four complete 15m bars.",
            "Signal families: Donchian breakouts, trend pullbacks, z-score mean reversion, volatility expansion, shock reversal, BTC-relative strength, RSI exhaustion/trend.",
            "Both LONG and SHORT are tested. Wide exits explicitly include TP 10% / SL 4% and neighboring risk/reward choices.",
            "Exit choice uses only pre-validation data, and must be positive in both development and six-month temporal selection subwindows to be called robust_train.",
            "Validation is the final year. It has been inspected in earlier unrelated research, so it is temporal OOS, not a pristine untouched holdout.",
            "Exact event exits use next-bar open, OHLC barriers, stop-first same-bar ordering, adverse stop gaps and time exits.",
            "Cross-sectional family is market-neutral: long strongest/short weakest or the reverse, ranked on 6-72h returns and rebalanced every 4-24h.",
            "All returns include 0.16% round-trip cost per leg/trade. Funding is represented only by the inherited reserve in that cost, not realized historical funding.",
            "No leverage, liquidation, compounding or portfolio-capacity model is used. Any surviving edge requires a later portfolio simulation and paper shadow test.",
        ],
        "event_top":events[:TOP_EVENT],"cross_sectional_top":xs[:TOP_XS],
        "eligible_event_count":len(eligible_events),"eligible_cross_sectional_count":len(eligible_xs),
        "eligible_events":eligible_events,"eligible_cross_sectional":eligible_xs,
    }
    out=Path("research-output");out.mkdir(exist_ok=True)
    (out/"broad-alpha-search-3y.json").write_text(json.dumps(report,indent=2,allow_nan=False))
    print("BROAD_SUMMARY "+json.dumps({
        "eligible_event_count":len(eligible_events),
        "eligible_cross_sectional_count":len(eligible_xs),
        "best_event":events[0] if events else None,
        "best_cross_sectional":xs[0] if xs else None,
    }),flush=True)

if __name__=="__main__":
    run()
