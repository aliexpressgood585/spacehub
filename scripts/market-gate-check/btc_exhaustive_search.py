"""BTC-only broad strategy discovery.

Research only. Searches BTCUSDT across multiple timeframes, long/short, hundreds
of candle sequences, momentum/reversal, trend, breakout, volatility, RSI,
z-score and wick structures. Candidate/risk parameters are selected only on
pre-validation data. Last-year validation is evaluated after selections freeze.

This is a broad finite grid, not literally every mathematically possible rule.
"""
import json
from itertools import product
from pathlib import Path
from datetime import datetime, timezone
import numpy as np

import market_gate_check as core
import broad_alpha_search as broad

SYMBOL="BTCUSDT"
START,SPLIT,END=core.START,core.SPLIT,core.END
DEV_END=int(datetime(2025,4,7,tzinfo=timezone.utc).timestamp()*1000)
COST=core.COST
TFS=(5,15,60,240)
SCREEN_HOURS=(0.5,1,2,4,8,12,24,48)

EXIT_CONFIGS=[
 (.003,.003,1),(.005,.003,2),(.005,.005,4),(.0075,.005,4),
 (.010,.005,8),(.010,.0075,12),(.015,.0075,12),(.015,.010,18),
 (.020,.010,24),(.020,.015,24),(.030,.015,36),(.030,.020,36),
 (.040,.020,48),(.040,.030,48),(.050,.025,48),(.060,.020,72),
 (.060,.030,72),(.080,.030,96),(.080,.040,96),(.100,.030,96),
 (.100,.040,120),(.120,.050,120),
 # high-win-rate / negative-RR controls
 (.003,.006,2),(.005,.010,4),(.010,.020,12),(.020,.040,24),(.030,.050,48),
]

TOP_SIGNAL=80
TOP_FILTERED=36
MIN_DEV=80
MIN_SEL=30
MIN_VAL=40

def resample(a, minutes):
    base=5
    k=minutes//base
    t=a[:,0].astype(np.int64)
    bucket=minutes*60000
    idx=np.flatnonzero(t%bucket==0)
    idx=idx[idx+k-1<len(a)]
    idx=idx[t[idx+k-1]-t[idx]==(k-1)*base*60000]
    b=a[idx[:,None]+np.arange(k)]
    return np.column_stack((a[idx,0],a[idx,1],b[:,:,2].max(axis=1),b[:,:,3].min(axis=1),a[idx+k-1,4],b[:,:,5].sum(axis=1)))

def ret_n(c,n):
    out=np.full(len(c),np.nan)
    if len(c)>n: out[n:]=c[n:]/c[:-n]-1
    return out

def cross_up(x,y):
    return np.r_[False,(x[1:]>y[1:])&(x[:-1]<=y[:-1])]
def cross_dn(x,y):
    return np.r_[False,(x[1:]<y[1:])&(x[:-1]>=y[:-1])]

def features(a):
    c,o,h,l,v=a[:,4],a[:,1],a[:,2],a[:,3],a[:,5]
    e9,e21,e50,e200=(broad.ema(c,n) for n in (9,21,50,200))
    r=broad.rsi(c,14)
    atr=broad.atr(a,14)
    vm20=broad.rolling_mean(v,20)
    ma20=broad.rolling_mean(c,20)
    sd20=broad.rolling_std(c,20)
    z=(c-ma20)/sd20
    atrp=atr/c
    return dict(c=c,o=o,h=h,l=l,v=v,e9=e9,e21=e21,e50=e50,e200=e200,
                rsi=r,atr=atr,atrp=atrp,vm20=vm20,z=z)

def prev_max(x,n):
    out=np.full(len(x),np.nan)
    for i in range(n,len(x)): out[i]=np.max(x[i-n:i])
    return out
def prev_min(x,n):
    out=np.full(len(x),np.nan)
    for i in range(n,len(x)): out[i]=np.min(x[i-n:i])
    return out

def add(out,name,side,mask,detail):
    idx=np.flatnonzero(mask)
    idx=idx[idx+1<len(mask)]
    out.append({"name":name,"side":int(side),"idx":idx.astype(np.int64),"detail":detail})

def generate_signals(a,tf):
    f=features(a);c,o,h,l,v=f["c"],f["o"],f["h"],f["l"],f["v"]
    out=[]

    # Every exact green/red sequence length 2-8.
    green=c>o;red=c<o
    for n in range(2,9):
        if len(a)<=n: continue
        for p in product("GR",repeat=n):
            mask=np.ones(len(a),bool)
            mask[:n-1]=False
            for q,ch in enumerate(p):
                shifted=np.r_[np.zeros(n-1-q,dtype=bool), (green if ch=="G" else red)[:len(a)-(n-1-q)]]
                mask &= shifted
            add(out,"pat_"+''.join(p),1,mask,{"family":"candle_pattern","pattern":''.join(p)})
            add(out,"pat_"+''.join(p),-1,mask,{"family":"candle_pattern","pattern":''.join(p)})

    # N-bar momentum and reversal at multiple amplitudes.
    for hours in (0.5,1,2,4,8,12,24,48):
        n=max(1,int(round(hours*60/tf)))
        rr=ret_n(c,n)
        for th in (.0025,.005,.01,.015,.02,.03,.04,.06,.08,.10):
            up=np.isfinite(rr)&(rr>=th);dn=np.isfinite(rr)&(rr<=-th)
            add(out,f"ret{hours}h_ge_{th}",1,up,{"family":"momentum","hours":hours,"threshold":th})
            add(out,f"ret{hours}h_ge_{th}",-1,up,{"family":"reversal","hours":hours,"threshold":th})
            add(out,f"ret{hours}h_le_m{th}",-1,dn,{"family":"momentum","hours":hours,"threshold":th})
            add(out,f"ret{hours}h_le_m{th}",1,dn,{"family":"reversal","hours":hours,"threshold":th})

    # RSI reversal/trend.
    for th in (15,20,25,30,35):
        add(out,f"rsi_le_{th}",1,np.isfinite(f["rsi"])&(f["rsi"]<=th),{"family":"rsi_reversal","threshold":th})
        add(out,f"rsi_le_{th}",-1,np.isfinite(f["rsi"])&(f["rsi"]<=th),{"family":"rsi_trend","threshold":th})
    for th in (65,70,75,80,85):
        add(out,f"rsi_ge_{th}",-1,np.isfinite(f["rsi"])&(f["rsi"]>=th),{"family":"rsi_reversal","threshold":th})
        add(out,f"rsi_ge_{th}",1,np.isfinite(f["rsi"])&(f["rsi"]>=th),{"family":"rsi_trend","threshold":th})

    # EMA states and crosses.
    pairs=[("9_21",f["e9"],f["e21"]),("21_50",f["e21"],f["e50"]),("50_200",f["e50"],f["e200"])]
    for nm,fast,slow in pairs:
        good=np.isfinite(fast)&np.isfinite(slow)
        add(out,f"ema_{nm}_bull",1,good&(fast>slow)&(c>fast),{"family":"ema_trend","pair":nm})
        add(out,f"ema_{nm}_bear",-1,good&(fast<slow)&(c<fast),{"family":"ema_trend","pair":nm})
        add(out,f"ema_{nm}_crossup",1,good&cross_up(fast,slow),{"family":"ema_cross","pair":nm})
        add(out,f"ema_{nm}_crossdn",-1,good&cross_dn(fast,slow),{"family":"ema_cross","pair":nm})
        add(out,f"ema_{nm}_crossup",-1,good&cross_up(fast,slow),{"family":"ema_cross_fade","pair":nm})
        add(out,f"ema_{nm}_crossdn",1,good&cross_dn(fast,slow),{"family":"ema_cross_fade","pair":nm})

    # Donchian breakouts and fades.
    for n in (10,20,50,100):
        ph=prev_max(h,n);pl=prev_min(l,n)
        up=np.isfinite(ph)&(c>ph);dn=np.isfinite(pl)&(c<pl)
        add(out,f"donch{n}_up",1,up,{"family":"breakout","n":n})
        add(out,f"donch{n}_up",-1,up,{"family":"breakout_fade","n":n})
        add(out,f"donch{n}_dn",-1,dn,{"family":"breakout","n":n})
        add(out,f"donch{n}_dn",1,dn,{"family":"breakout_fade","n":n})

    # Bollinger/z-score continuation and reversion.
    for th in (1.0,1.5,2.0,2.5,3.0):
        up=np.isfinite(f["z"])&(f["z"]>=th);dn=np.isfinite(f["z"])&(f["z"]<=-th)
        add(out,f"z_ge_{th}",1,up,{"family":"z_momentum","z":th})
        add(out,f"z_ge_{th}",-1,up,{"family":"z_reversion","z":th})
        add(out,f"z_le_m{th}",-1,dn,{"family":"z_momentum","z":th})
        add(out,f"z_le_m{th}",1,dn,{"family":"z_reversion","z":th})

    # Volatility/body expansion with volume.
    body=np.abs(c-o)
    for bm in (1.0,1.5,2.0,2.5,3.0):
        for vm in (1.0,1.5,2.0):
            ok=np.isfinite(f["atr"])&np.isfinite(f["vm20"])&(body>=bm*f["atr"])&(v>=vm*f["vm20"])
            add(out,f"expand_b{bm}_v{vm}_green",1,ok&(c>o),{"family":"vol_expansion","body_atr":bm,"vol_mult":vm})
            add(out,f"expand_b{bm}_v{vm}_green",-1,ok&(c>o),{"family":"vol_expansion_fade","body_atr":bm,"vol_mult":vm})
            add(out,f"expand_b{bm}_v{vm}_red",-1,ok&(c<o),{"family":"vol_expansion","body_atr":bm,"vol_mult":vm})
            add(out,f"expand_b{bm}_v{vm}_red",1,ok&(c<o),{"family":"vol_expansion_fade","body_atr":bm,"vol_mult":vm})

    # Wick rejection.
    rng=np.maximum(h-l,1e-12)
    uw=h-np.maximum(o,c);lw=np.minimum(o,c)-l
    for frac in (.4,.5,.6):
        add(out,f"upper_wick_{frac}",-1,(uw/rng)>=frac,{"family":"wick_reversal","wick":"upper","frac":frac})
        add(out,f"lower_wick_{frac}",1,(lw/rng)>=frac,{"family":"wick_reversal","wick":"lower","frac":frac})
        add(out,f"upper_wick_{frac}",1,(uw/rng)>=frac,{"family":"wick_follow","wick":"upper","frac":frac})
        add(out,f"lower_wick_{frac}",-1,(lw/rng)>=frac,{"family":"wick_follow","wick":"lower","frac":frac})

    # Inside/outside bars, directional interpretation both ways.
    inside=np.r_[False,(h[1:]<h[:-1])&(l[1:]>l[:-1])]
    outside=np.r_[False,(h[1:]>h[:-1])&(l[1:]<l[:-1])]
    for side in (1,-1):
        add(out,"inside_bar",side,inside,{"family":"inside_bar"})
        add(out,"outside_bar",side,outside,{"family":"outside_bar"})

    return out,f

def fixed_horizon(a,idx,side,hours,start,end):
    hold=max(1,int(round(hours*60/(a[1,0]-a[0,0])*60000))) if False else None
    tf=int(round((a[1,0]-a[0,0])/60000))
    hold=max(1,int(round(hours*60/tf)))
    idx=idx[(idx+hold<len(a))&(idx+1<len(a))]
    if not len(idx): return np.empty(0)
    et=a[idx+1,0]
    idx=idx[(et>=start)&(et<end)]
    if not len(idx): return np.empty(0)
    e=a[idx+1,1];x=a[idx+hold,4]
    return side*(x/e-1)-COST

def metrics(v): return broad.metrics(v)

def filter_masks(a,f):
    t=a[:,0].astype(np.int64)
    train=(t>=START)&(t<SPLIT)&np.isfinite(f["atrp"])
    atrmed=float(np.nanmedian(f["atrp"][train]))
    vm=f["vm20"]
    hour=((t//3600000)%24).astype(int)
    dow=((t//86400000+3)%7).astype(int) # 1970-01-01 Thu; Mon=0
    return {
      "none":np.ones(len(a),bool),
      "trend20_50_up":np.isfinite(f["e50"])&(f["e21"]>f["e50"]),
      "trend20_50_down":np.isfinite(f["e50"])&(f["e21"]<f["e50"]),
      "trend50_200_up":np.isfinite(f["e200"])&(f["e50"]>f["e200"]),
      "trend50_200_down":np.isfinite(f["e200"])&(f["e50"]<f["e200"]),
      "atr_high":np.isfinite(f["atrp"])&(f["atrp"]>=atrmed),
      "atr_low":np.isfinite(f["atrp"])&(f["atrp"]<atrmed),
      "volume_high":np.isfinite(vm)&(f["v"]>=1.5*vm),
      "rsi_lt50":np.isfinite(f["rsi"])&(f["rsi"]<50),
      "rsi_gt50":np.isfinite(f["rsi"])&(f["rsi"]>50),
      "asia_utc":hour<8,
      "europe_utc":(hour>=8)&(hour<16),
      "us_utc":hour>=16,
      "weekday":dow<5,
      "weekend":dow>=5,
    }

def select_screen(cands,a,tf):
    rows=[]
    for s in cands:
        for h in SCREEN_HOURS:
            d=fixed_horizon(a,s["idx"],s["side"],h,START,DEV_END)
            q=fixed_horizon(a,s["idx"],s["side"],h,DEV_END,SPLIT)
            md,mq=metrics(d),metrics(q)
            robust=(md["n"]>=MIN_DEV and mq["n"]>=MIN_SEL and
                    (md["avg_net_bps"] or -999)>0 and (mq["avg_net_bps"] or -999)>0)
            score=min(md["avg_net_bps"] or -999,mq["avg_net_bps"] or -999) if robust else -999
            rows.append({"signal":s,"screen_hours":h,"dev":md,"selection":mq,"robust":robust,"score":score})
    rows.sort(key=lambda r:(r["score"],r["selection"]["pf"] or -1,r["selection"]["avg_net_bps"] or -999),reverse=True)
    # Distinct signal+side; horizon already selected.
    seen=set();out=[]
    for r in rows:
        k=(r["signal"]["name"],r["signal"]["side"])
        if k in seen: continue
        seen.add(k);out.append(r)
        if len(out)>=TOP_SIGNAL: break
    return out

def choose_filter(rows,a,f):
    masks=filter_masks(a,f)
    out=[]
    for r in rows:
        s=r["signal"];best=None
        for name,m in masks.items():
            idx=s["idx"][m[s["idx"]]]
            d=fixed_horizon(a,idx,s["side"],r["screen_hours"],START,DEV_END)
            q=fixed_horizon(a,idx,s["side"],r["screen_hours"],DEV_END,SPLIT)
            md,mq=metrics(d),metrics(q)
            robust=(md["n"]>=MIN_DEV and mq["n"]>=MIN_SEL and
                    (md["avg_net_bps"] or -999)>0 and (mq["avg_net_bps"] or -999)>0)
            score=min(md["avg_net_bps"] or -999,mq["avg_net_bps"] or -999) if robust else -999
            rec={"filter":name,"mask":m,"idx":idx,"dev":md,"selection":mq,"robust":robust,"score":score}
            if best is None or (rec["score"],mq["pf"] or -1)>(best["score"],best["selection"]["pf"] or -1):
                best=rec
        out.append({**r,"filter_choice":best})
    out.sort(key=lambda r:(r["filter_choice"]["score"],r["filter_choice"]["selection"]["pf"] or -1),reverse=True)
    return out[:TOP_FILTERED]

def exact_select(a,tf,rows):
    out=[]
    for r in rows:
        s=r["signal"];fc=r["filter_choice"];idx=fc["idx"]
        best=None
        for tp,sl,hold in EXIT_CONFIGS:
            d=broad.simulate(a,idx,s["side"],tp,sl,hold,tf,START,DEV_END)
            q=broad.simulate(a,idx,s["side"],tp,sl,hold,tf,DEV_END,SPLIT)
            md,mq=metrics(d),metrics(q)
            robust=(md["n"]>=MIN_DEV and mq["n"]>=MIN_SEL and
                    (md["avg_net_bps"] or -999)>0 and (mq["avg_net_bps"] or -999)>0)
            score=min(md["avg_net_bps"] or -999,mq["avg_net_bps"] or -999) if robust else -999
            rec={"tp_pct":tp*100,"sl_pct":sl*100,"hold_hours":hold,
                 "dev":md,"selection":mq,"robust_train":robust,"score":score}
            if best is None or (rec["score"],mq["pf"] or -1)>(best["score"],best["selection"]["pf"] or -1):
                best=rec
        # validation only after frozen choice
        v=broad.simulate(a,idx,s["side"],best["tp_pct"]/100,best["sl_pct"]/100,best["hold_hours"],tf,SPLIT,END)
        mv=metrics(v)
        # 4 validation quarters
        cuts=[
          SPLIT,
          int(datetime(2026,1,7,tzinfo=timezone.utc).timestamp()*1000),
          int(datetime(2026,4,7,tzinfo=timezone.utc).timestamp()*1000),
          int(datetime(2026,7,7,tzinfo=timezone.utc).timestamp()*1000),
          END,
        ]
        qs=[]
        for x,y in zip(cuts[:-1],cuts[1:]):
            z=broad.simulate(a,idx,s["side"],best["tp_pct"]/100,best["sl_pct"]/100,best["hold_hours"],tf,x,y)
            qs.append(metrics(z))
        posq=sum(1 for m in qs if m["avg_net_bps"] is not None and m["avg_net_bps"]>0)
        eligible=bool(best["robust_train"] and mv["n"]>=MIN_VAL and
                      (mv["pf"] or 0)>1.15 and (mv["avg_net_bps"] or -999)>0 and posq>=3)
        out.append({
          "tf_min":tf,"signal":s["name"],"family":s["detail"]["family"],"detail":s["detail"],
          "side":"LONG" if s["side"]==1 else "SHORT",
          "screen_hours":r["screen_hours"],"filter":fc["filter"],
          "selected_exit":{k:best[k] for k in ("tp_pct","sl_pct","hold_hours")},
          "dev":best["dev"],"selection":best["selection"],"robust_train":best["robust_train"],
          "validation":mv,"validation_quarters":qs,"positive_validation_quarters":posq,
          "eligible_for_shadow":eligible,
        })
    return out

def run():
    a5=core.load(SYMBOL,"5m")[0]
    data={5:a5,15:resample(a5,15),60:resample(a5,60),240:resample(a5,240)}
    all_results=[]
    diagnostics={}
    for tf in TFS:
        a=data[tf]
        cands,f=generate_signals(a,tf)
        print("TF",tf,"BARS",len(a),"SIGNALS",len(cands),flush=True)
        screened=select_screen(cands,a,tf)
        filtered=choose_filter(screened,a,f)
        exact=exact_select(a,tf,filtered)
        all_results.extend(exact)
        diagnostics[str(tf)]={
          "bars":len(a),"generated_signals":len(cands),
          "screened_distinct":len(screened),"exact_finalists":len(exact)
        }
        print("TF_TOP "+json.dumps(sorted(exact,key=lambda x:(x["eligible_for_shadow"],x["validation"]["pf"] or -1),reverse=True)[:5]),flush=True)

    all_results.sort(key=lambda r:(
      1 if r["eligible_for_shadow"] else 0,
      1 if r["robust_train"] else 0,
      r["positive_validation_quarters"],
      r["validation"]["pf"] or -1,
      r["validation"]["avg_net_bps"] if r["validation"]["avg_net_bps"] is not None else -999
    ),reverse=True)
    eligible=[x for x in all_results if x["eligible_for_shadow"]]
    report={
      "symbol":SYMBOL,
      "window":{"start":core.START_DT.isoformat(),"dev_end":"2025-04-07T00:00:00+00:00",
                "split":core.SPLIT_DT.isoformat(),"end_exclusive":core.END_DT.isoformat()},
      "roundtrip_cost_pct":COST*100,
      "timeframes_min":TFS,
      "screen_horizons_hours":SCREEN_HOURS,
      "exit_configs":[{"tp_pct":a*100,"sl_pct":b*100,"hold_hours":h} for a,b,h in EXIT_CONFIGS],
      "diagnostics":diagnostics,
      "method":[
        "Research only; BTCUSDT only; no account/runtime changes.",
        "Broad finite search across 5m/15m/1h/4h; both LONG and SHORT.",
        "Signals include every exact green/red sequence length 2-8 plus multi-horizon momentum/reversal, RSI, EMA trend/cross/fade, Donchian breakout/fade, z-score momentum/reversion, volatility/volume expansion, wick reversal/follow, inside/outside bars.",
        "Train-only screening chooses signal horizon, then one predeclared BTC regime/session filter, then TP/SL/time-stop. Validation is untouched by those selections within this run.",
        "Exact exits enter next-bar open, use stop-first same-bar ordering and the inherited 0.16% round-trip cost.",
        "Final-year gate: PF>1.15, positive average net, >=40 trades and >=3 of 4 positive calendar quarters, after being positive in both pre-validation train subwindows.",
        "The final year has been inspected by earlier research, so it is temporal OOS but not a pristine untouched holdout.",
        "The phrase 'every possible variation' is operationalized as a very broad finite grid; infinitely many parameter combinations cannot be exhaustively enumerated."
      ],
      "eligible_count":len(eligible),"eligible":eligible,
      "top_results":all_results[:50],
    }
    out=Path("research-output");out.mkdir(exist_ok=True)
    (out/"btc-exhaustive-search-3y.json").write_text(json.dumps(report,indent=2,allow_nan=False))
    print("BTC_SEARCH_SUMMARY "+json.dumps({"eligible_count":len(eligible),"best":all_results[0] if all_results else None}),flush=True)

if __name__=="__main__":
    run()
