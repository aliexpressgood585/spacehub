"""High-turnover multi-coin discovery.

Research only. Goal: find a *small subset* of liquid Binance USDT perpetual
crypto contracts whose train-only selected strategy produces high capital
velocity, then validate a rotating full-equity portfolio over the final year.

No leverage. One portfolio position at a time. Overlapping signals are skipped.
All trade returns include the inherited 0.16% round-trip cost assumption.
"""
import json, math
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import numpy as np

import market_gate_check as core
import broad_alpha_search as broad

START,SPLIT,END=core.START,core.SPLIT,core.END
DEV_END=int(datetime(2025,4,7,tzinfo=timezone.utc).timestamp()*1000)
COST=core.COST

# Liquid crypto-focused universe. Newer listings are automatically skipped if
# they do not have enough pre-validation history.
SYMBOLS=[
 "BTCUSDT","ETHUSDT","SOLUSDT","XRPUSDT","NEARUSDT","ZECUSDT","DOGEUSDT","SANDUSDT",
 "UNIUSDT","SUIUSDT","BNBUSDT","ORCAUSDT","NMRUSDT","QNTUSDT","ENAUSDT","AVAXUSDT",
 "ADAUSDT","WLDUSDT","TAOUSDT","1000PEPEUSDT","LINKUSDT","FILUSDT","AAVEUSDT","ONDOUSDT",
 "TRUMPUSDT","ARBUSDT","INJUSDT","PENGUUSDT","LTCUSDT","BCHUSDT","ZROUSDT","FETUSDT",
 "DOTUSDT","XLMUSDT","APTUSDT","HBARUSDT","TRXUSDT","TIAUSDT","1000SHIBUSDT","OPUSDT",
 "ETHFIUSDT","DASHUSDT","RENDERUSDT","ETCUSDT","ICPUSDT","ATOMUSDT","RUNEUSDT","GALAUSDT",
 "CRVUSDT","DYDXUSDT","IMXUSDT","LDOUSDT","SEIUSDT","WIFUSDT","APEUSDT","MKRUSDT"
]
TFS=(15,60,240)

EXIT_CONFIGS=[
 (.005,.005,4),(.0075,.005,8),(.010,.005,12),(.010,.0075,12),
 (.015,.0075,24),(.020,.010,24),(.030,.015,36),(.040,.020,48),
 (.050,.025,72),(.010,.020,12),(.020,.030,24),(.030,.050,48),
]
SCREEN_HOURS=(4,8,12,24,48)
TOP_SCREEN_PER_TF=12
MIN_DEV=50
MIN_SEL=18
MIN_VAL=25

def safe_load(sym):
    try:
        a,info=core.load(sym,"15m")
        return sym,a,info,None
    except Exception as e:
        return sym,None,None,str(e)

def resample(a,minutes):
    k=minutes//15
    if k==1:return a
    t=a[:,0].astype(np.int64);bucket=minutes*60000
    idx=np.flatnonzero(t%bucket==0)
    idx=idx[idx+k-1<len(a)]
    idx=idx[t[idx+k-1]-t[idx]==(k-1)*900000]
    if not len(idx):return np.empty((0,6))
    b=a[idx[:,None]+np.arange(k)]
    return np.column_stack((a[idx,0],a[idx,1],b[:,:,2].max(1),b[:,:,3].min(1),a[idx+k-1,4],b[:,:,5].sum(1)))

def ret_n(c,n):
    out=np.full(len(c),np.nan)
    if len(c)>n:out[n:]=c[n:]/c[:-n]-1
    return out

def prev_max(x,n):
    out=np.full(len(x),np.nan)
    for i in range(n,len(x)):out[i]=np.max(x[i-n:i])
    return out

def prev_min(x,n):
    out=np.full(len(x),np.nan)
    for i in range(n,len(x)):out[i]=np.min(x[i-n:i])
    return out

def features(a):
    c,o,h,l,v=a[:,4],a[:,1],a[:,2],a[:,3],a[:,5]
    e20,e50,e200=(broad.ema(c,n) for n in (20,50,200))
    rsi=broad.rsi(c,14);atr=broad.atr(a,14);vm=broad.rolling_mean(v,20)
    ma20=broad.rolling_mean(c,20);sd20=broad.rolling_std(c,20)
    z=(c-ma20)/sd20
    return dict(c=c,o=o,h=h,l=l,v=v,e20=e20,e50=e50,e200=e200,rsi=rsi,atr=atr,vm=vm,z=z)

def add(out,name,side,mask,fam):
    idx=np.flatnonzero(mask)
    idx=idx[idx+1<len(mask)]
    out.append({"name":name,"side":int(side),"idx":idx.astype(np.int64),"family":fam})

def signals(a,tf):
    f=features(a);c,o,h,l,v=f["c"],f["o"],f["h"],f["l"],f["v"]
    out=[]
    # Momentum and reversal across several clocks.
    for hours in (1,2,4,8,12,24,48):
        n=max(1,int(round(hours*60/tf)))
        rr=ret_n(c,n)
        for th in (.005,.01,.015,.02,.03,.05,.08):
            up=np.isfinite(rr)&(rr>=th);dn=np.isfinite(rr)&(rr<=-th)
            add(out,f"mom_{hours}h_{th}_up",1,up,"momentum")
            add(out,f"mom_{hours}h_{th}_dn",-1,dn,"momentum")
            add(out,f"rev_{hours}h_{th}_up",-1,up,"reversal")
            add(out,f"rev_{hours}h_{th}_dn",1,dn,"reversal")

    # Volatility expansion / fade.
    body=np.abs(c-o)
    for bm in (1.0,1.5,2.0,2.5):
        for vmul in (1.0,1.5,2.0):
            ok=np.isfinite(f["atr"])&np.isfinite(f["vm"])&(body>=bm*f["atr"])&(v>=vmul*f["vm"])
            add(out,f"exp_b{bm}_v{vmul}_green",1,ok&(c>o),"vol_expansion")
            add(out,f"exp_b{bm}_v{vmul}_red",-1,ok&(c<o),"vol_expansion")
            add(out,f"fade_b{bm}_v{vmul}_green",-1,ok&(c>o),"vol_fade")
            add(out,f"fade_b{bm}_v{vmul}_red",1,ok&(c<o),"vol_fade")

    # RSI continuation/reversal.
    for th in (25,30,35):
        m=np.isfinite(f["rsi"])&(f["rsi"]<=th)
        add(out,f"rsi_le_{th}_long",1,m,"rsi_reversal")
        add(out,f"rsi_le_{th}_short",-1,m,"rsi_trend")
    for th in (65,70,75):
        m=np.isfinite(f["rsi"])&(f["rsi"]>=th)
        add(out,f"rsi_ge_{th}_short",-1,m,"rsi_reversal")
        add(out,f"rsi_ge_{th}_long",1,m,"rsi_trend")

    # Trend state / recapture.
    bull=np.isfinite(f["e200"])&(f["e50"]>f["e200"])&(c>f["e50"])
    bear=np.isfinite(f["e200"])&(f["e50"]<f["e200"])&(c<f["e50"])
    cross20up=np.r_[False,(c[1:]>f["e20"][1:])&(c[:-1]<=f["e20"][:-1])]
    cross20dn=np.r_[False,(c[1:]<f["e20"][1:])&(c[:-1]>=f["e20"][:-1])]
    add(out,"trend_recapture_long",1,bull&cross20up,"trend_pullback")
    add(out,"trend_recapture_short",-1,bear&cross20dn,"trend_pullback")

    # Z-score mean reversion / continuation.
    for zt in (1.5,2.0,2.5):
        up=np.isfinite(f["z"])&(f["z"]>=zt);dn=np.isfinite(f["z"])&(f["z"]<=-zt)
        add(out,f"z{zt}_up_fade",-1,up,"z_reversion")
        add(out,f"z{zt}_dn_fade",1,dn,"z_reversion")
        add(out,f"z{zt}_up_follow",1,up,"z_momentum")
        add(out,f"z{zt}_dn_follow",-1,dn,"z_momentum")

    # Donchian breakout/fade.
    for n in (20,50):
        ph,pl=prev_max(h,n),prev_min(l,n)
        up=np.isfinite(ph)&(c>ph);dn=np.isfinite(pl)&(c<pl)
        add(out,f"donch{n}_up",1,up,"breakout")
        add(out,f"donch{n}_dn",-1,dn,"breakout")
        add(out,f"donch{n}_up_fade",-1,up,"breakout_fade")
        add(out,f"donch{n}_dn_fade",1,dn,"breakout_fade")

    # Simple streak continuation/reversal 2-6 candles.
    green=c>o;red=c<o
    for n in range(2,7):
        mg=np.ones(len(a),bool);mr=np.ones(len(a),bool)
        mg[:n-1]=False;mr[:n-1]=False
        for lag in range(n):
            if lag==0:
                mg &= green; mr &= red
            else:
                mg &= np.r_[np.zeros(lag,dtype=bool),green[:-lag]]
                mr &= np.r_[np.zeros(lag,dtype=bool),red[:-lag]]
        add(out,f"{n}green_follow",1,mg,"streak")
        add(out,f"{n}green_fade",-1,mg,"streak")
        add(out,f"{n}red_follow",-1,mr,"streak")
        add(out,f"{n}red_fade",1,mr,"streak")
    return out

def fixed_returns(a,idx,side,hours,tf,start,end):
    hold=max(1,int(round(hours*60/tf)))
    idx=idx[(idx+1+hold<=len(a))]
    if not len(idx):return np.empty(0)
    et=a[idx+1,0]
    idx=idx[(et>=start)&(et<end)]
    if not len(idx):return np.empty(0)
    e=a[idx+1,1];x=a[idx+hold,4]
    return side*(x/e-1)-COST

def m(v): return broad.metrics(v)

def annual_velocity(metric,years):
    if not metric or metric["n"]<=0 or metric["avg_net_bps"] is None:return -999
    return (metric["avg_net_bps"]/10000)*metric["n"]/years

DEV_YEARS=(DEV_END-START)/(365.25*86400000)
SEL_YEARS=(SPLIT-DEV_END)/(365.25*86400000)

def screen(a,tf):
    rows=[]
    for s in signals(a,tf):
        for h in SCREEN_HOURS:
            md=m(fixed_returns(a,s["idx"],s["side"],h,tf,START,DEV_END))
            ms=m(fixed_returns(a,s["idx"],s["side"],h,tf,DEV_END,SPLIT))
            robust=(md["n"]>=MIN_DEV and ms["n"]>=MIN_SEL and
                    (md["avg_net_bps"] or -999)>0 and (ms["avg_net_bps"] or -999)>0)
            vd=annual_velocity(md,DEV_YEARS);vs=annual_velocity(ms,SEL_YEARS)
            score=min(vd,vs) if robust else -999
            rows.append({"s":s,"h":h,"dev":md,"sel":ms,"score":score,"robust":robust})
    rows.sort(key=lambda r:(r["score"],r["sel"]["pf"] or -1),reverse=True)
    seen=set();out=[]
    for r in rows:
        k=(r["s"]["name"],r["s"]["side"])
        if k in seen:continue
        seen.add(k);out.append(r)
        if len(out)>=TOP_SCREEN_PER_TF:break
    return out

def trade_records(a,idx,side,tp,sl,hold_hours,tf,start,end):
    hold=max(1,int(round(hold_hours*60/tf)))
    boundary=np.searchsorted(a[:,0],end)
    out=[];last=-1
    for sig_i in idx:
        i=int(sig_i)+1
        if i<=last or i>=boundary:continue
        ts=int(a[i,0])
        if ts<start or ts>=end:continue
        e=float(a[i,1]);target=e*(1+side*tp);stop=e*(1-side*sl)
        lim=min(boundary,i+hold);done=False
        for j in range(i,lim):
            reason=None
            if side>0:
                if a[j,1]<=stop:px=float(a[j,1]);reason="stop_gap"
                elif a[j,1]>=target:px=target;reason="target_gap"
                elif a[j,3]<=stop:px=stop;reason="stop"
                elif a[j,2]>=target:px=target;reason="target"
                else:continue
            else:
                if a[j,1]>=stop:px=float(a[j,1]);reason="stop_gap"
                elif a[j,1]<=target:px=target;reason="target_gap"
                elif a[j,2]>=stop:px=stop;reason="stop"
                elif a[j,3]<=target:px=target;reason="target"
                else:continue
            out.append({"entry_ms":ts,"exit_ms":int(a[j,0]),"net":float(side*(px/e-1)-COST),"reason":reason})
            last=j;done=True;break
        if not done:
            if i+hold>boundary:break
            j=i+hold-1;px=float(a[j,4])
            out.append({"entry_ms":ts,"exit_ms":int(a[j,0]),"net":float(side*(px/e-1)-COST),"reason":"time"})
            last=j
    return out

def select_exact(a,tf,screened):
    best=None
    for r in screened:
        s=r["s"]
        for tp,sl,hold in EXIT_CONFIGS:
            td=trade_records(a,s["idx"],s["side"],tp,sl,hold,tf,START,DEV_END)
            ts=trade_records(a,s["idx"],s["side"],tp,sl,hold,tf,DEV_END,SPLIT)
            md=m([x["net"] for x in td]);ms=m([x["net"] for x in ts])
            robust=(md["n"]>=MIN_DEV and ms["n"]>=MIN_SEL and
                    (md["avg_net_bps"] or -999)>0 and (ms["avg_net_bps"] or -999)>0 and
                    (md["pf"] or 0)>1.02 and (ms["pf"] or 0)>1.02)
            vd=annual_velocity(md,DEV_YEARS);vs=annual_velocity(ms,SEL_YEARS)
            score=min(vd,vs) if robust else -999
            rec={"signal":s["name"],"family":s["family"],"side":s["side"],
                 "tp":tp,"sl":sl,"hold":hold,"dev":md,"selection":ms,
                 "train_velocity_score":score,"idx":s["idx"]}
            if best is None or (score,ms["pf"] or -1)>(best["train_velocity_score"],best["selection"]["pf"] or -1):
                best=rec
    return best

def comp_stats(trades,start_balance=1000.0):
    bal=start_balance;peak=bal;maxdd=0;wins=0
    for t in trades:
        bal*=1+t["net"]
        if t["net"]>0:wins+=1
        peak=max(peak,bal);maxdd=max(maxdd,(peak-bal)/peak)
    return {
      "start_balance":start_balance,"final_balance":round(bal,2),
      "return_pct":round((bal/start_balance-1)*100,3),
      "trades":len(trades),"wins":wins,
      "win_rate_pct":round(100*wins/len(trades),3) if trades else None,
      "max_closed_equity_drawdown_pct":round(maxdd*100,3),
    }

def rotating_portfolio(candidates,start,end):
    # One active trade at a time, full equity. Candidate priority is frozen by train score.
    events=[]
    for rank,c in enumerate(candidates):
        for t in c["validation_trades"] if start==SPLIT else c["train_trades"]:
            if start<=t["entry_ms"]<end:
                events.append((t["entry_ms"],rank,c["symbol"],c["strategy_key"],t))
    events.sort(key=lambda x:(x[0],x[1]))
    chosen=[];busy_until=-1
    for _,rank,sym,key,t in events:
        if t["entry_ms"]<busy_until:continue
        chosen.append({"symbol":sym,"strategy_key":key,**t})
        busy_until=t["exit_ms"]
    return chosen

def run():
    with ThreadPoolExecutor(max_workers=8) as pool:
        loaded=list(pool.map(safe_load,SYMBOLS))
    usable={}
    skipped=[]
    for sym,a,info,err in loaded:
        if a is None:
            skipped.append({"symbol":sym,"reason":err});continue
        first=int(a[0,0]);last=int(a[-1,0])
        # Require meaningful dev history plus current validation coverage.
        if first>START+180*86400000 or last<END-2*86400000 or info["coverage_between_first_last"]<.97:
            skipped.append({"symbol":sym,"reason":"insufficient_history_or_coverage","first":first,"last":last,"coverage":info["coverage_between_first_last"]})
            continue
        usable[sym]={15:a,60:resample(a,60),240:resample(a,240)}
        print("USABLE",sym,len(a),flush=True)

    candidates=[]
    for sym,d in usable.items():
        best=None
        for tf in TFS:
            a=d[tf]
            if len(a)<500:continue
            sr=screen(a,tf)
            ex=select_exact(a,tf,sr)
            if ex is None or ex["train_velocity_score"]<=-999:continue
            ex["tf"]=tf
            if best is None or ex["train_velocity_score"]>best["train_velocity_score"]:
                best=ex
        if best is None:continue
        a=d[best["tf"]]
        tv=trade_records(a,best["idx"],best["side"],best["tp"],best["sl"],best["hold"],best["tf"],START,SPLIT)
        vv=trade_records(a,best["idx"],best["side"],best["tp"],best["sl"],best["hold"],best["tf"],SPLIT,END)
        mv=m([x["net"] for x in vv])
        # Quarter robustness, report only; not used to choose candidate.
        cuts=[SPLIT,
              int(datetime(2026,1,7,tzinfo=timezone.utc).timestamp()*1000),
              int(datetime(2026,4,7,tzinfo=timezone.utc).timestamp()*1000),
              int(datetime(2026,7,7,tzinfo=timezone.utc).timestamp()*1000),END]
        q=[]
        for x,y in zip(cuts[:-1],cuts[1:]):
            q.append(m([z["net"] for z in vv if x<=z["entry_ms"]<y]))
        posq=sum(1 for z in q if z["avg_net_bps"] is not None and z["avg_net_bps"]>0)
        candidates.append({
          "symbol":sym,
          "strategy_key":f'{best["tf"]}m:{best["signal"]}:{"L" if best["side"]==1 else "S"}:{best["tp"]}/{best["sl"]}/{best["hold"]}',
          "tf_min":best["tf"],"signal":best["signal"],"family":best["family"],
          "side":"LONG" if best["side"]==1 else "SHORT",
          "tp_pct":best["tp"]*100,"sl_pct":best["sl"]*100,"hold_hours":best["hold"],
          "dev":best["dev"],"selection":best["selection"],
          "train_velocity_score":best["train_velocity_score"],
          "validation":mv,"validation_quarters":q,"positive_validation_quarters":posq,
          "train_trades":tv,"validation_trades":vv,
        })
        print("COIN_CANDIDATE "+json.dumps({k:candidates[-1][k] for k in ("symbol","strategy_key","train_velocity_score","validation","positive_validation_quarters")}),flush=True)

    # Rank and choose subset size using *train-only* rotating portfolio performance.
    candidates.sort(key=lambda c:c["train_velocity_score"],reverse=True)
    k_options=[3,5,8,12,16,20]
    train_portfolios=[]
    for k in k_options:
        subset=candidates[:min(k,len(candidates))]
        tr=rotating_portfolio(subset,START,SPLIT)
        st=comp_stats(tr)
        score=(math.log(st["final_balance"]/1000)/((SPLIT-START)/(365.25*86400000))) if st["final_balance"]>0 else -999
        train_portfolios.append({"k":len(subset),"score_log_return_per_year":score,"stats":st})
    train_portfolios.sort(key=lambda x:x["score_log_return_per_year"],reverse=True)
    chosen_k=train_portfolios[0]["k"] if train_portfolios else 0
    chosen=candidates[:chosen_k]
    val_trades=rotating_portfolio(chosen,SPLIT,END)
    val_stats=comp_stats(val_trades)

    # Also report "robust survivors" after validation, but do not use them to form the portfolio.
    survivors=[c for c in candidates if c["validation"]["n"]>=MIN_VAL and (c["validation"]["pf"] or 0)>1.10 and
               (c["validation"]["avg_net_bps"] or -999)>0 and c["positive_validation_quarters"]>=3]

    slim=[]
    for c in candidates:
        slim.append({k:c[k] for k in ("symbol","strategy_key","tf_min","signal","family","side","tp_pct","sl_pct","hold_hours",
                                     "dev","selection","train_velocity_score","validation","validation_quarters","positive_validation_quarters")})
    report={
      "window":{"start":core.START_DT.isoformat(),"dev_end":"2025-04-07T00:00:00+00:00",
                "split":core.SPLIT_DT.isoformat(),"end_exclusive":core.END_DT.isoformat()},
      "roundtrip_cost_pct":COST*100,
      "requested_universe_count":len(SYMBOLS),"usable_count":len(usable),"skipped":skipped,
      "candidate_count":len(candidates),
      "method":[
        "Research only; no paper/live state changes.",
        "Crypto-only liquid Binance USDT perpetual universe; symbols without sufficient pre-validation history/coverage are skipped.",
        "15m/1h/4h; both LONG and SHORT; momentum/reversal, volatility expansion/fade, RSI trend/reversal, trend pullback, z-score, Donchian and streak signals.",
        "Signal and TP/SL/time-stop are chosen using only pre-validation data, scoring expected return velocity rather than win rate alone.",
        "Per coin only its single best train-selected strategy survives into the portfolio ranking.",
        "Portfolio subset size is also chosen on training only. Validation then rotates 100% of equity into one trade at a time; overlapping signals are skipped.",
        "No leverage. Returns include the inherited 0.16% round-trip cost. Closed-equity drawdown is reported.",
        "Final-year results have been seen in prior experiments for some symbols, so this is not a pristine untouched holdout."
      ],
      "train_subset_tests":train_portfolios,
      "chosen_k_train_only":chosen_k,
      "chosen_symbols_train_only":[c["symbol"] for c in chosen],
      "validation_portfolio_stats":val_stats,
      "validation_portfolio_trades":val_trades,
      "robust_validation_survivor_count":len(survivors),
      "robust_validation_survivors":[{k:c[k] for k in ("symbol","strategy_key","validation","positive_validation_quarters")} for c in survivors],
      "candidates":slim,
    }
    out=Path("research-output");out.mkdir(exist_ok=True)
    (out/"high-turnover-multicoin-3y.json").write_text(json.dumps(report,indent=2,allow_nan=False))
    print("HIGH_TURNOVER_SUMMARY "+json.dumps({
      "usable_count":len(usable),"candidate_count":len(candidates),"chosen_k":chosen_k,
      "chosen_symbols":[c["symbol"] for c in chosen],
      "validation_portfolio_stats":val_stats,
      "survivors":len(survivors),
      "top_survivors":[{"symbol":c["symbol"],"strategy":c["strategy_key"],"validation":c["validation"]} for c in survivors[:10]]
    }),flush=True)

if __name__=="__main__":
    run()
