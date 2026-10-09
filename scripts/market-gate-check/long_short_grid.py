"""Preregistered broad LONG/SHORT signal and filter grid (research only)."""
import json
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np
from numba import njit

import market_gate_check as core
from flow_reversal import load_minutes, atr14, weekly_ci
from strategy_specs import TOP10

FAMILIES = ("donchian_breakout", "ema_pullback", "bollinger_reversal")
SIDES = ("LONG", "SHORT")
EXITS = {
    "atr_1p5_1_60": {"tp_atr": 1.5, "sl_atr": 1.0, "timeout_min": 60},
    "atr_2_1p25_120": {"tp_atr": 2.0, "sl_atr": 1.25, "timeout_min": 120},
}
FILTERS = (
    "none", "adx", "volume", "flow", "volatility", "btc_align",
    "adx_volume", "btc_flow", "all",
)
PERIODS = {"train": (core.START, core.SPLIT), "validation": (core.SPLIT, core.END)}
GATE = {"min_n_each": 300, "min_pf_each": 1.15, "positive_avg_each": True}


def five_minutes(a):
    t = a[:, 0].astype(np.int64)
    idx = np.flatnonzero(t % 300000 == 0)
    idx = idx[idx + 4 < len(a)]
    idx = idx[t[idx + 4] - t[idx] == 240000]
    blocks = a[idx[:, None] + np.arange(5)]
    b = np.column_stack((
        a[idx, 0], a[idx, 1], blocks[:, :, 2].max(axis=1),
        blocks[:, :, 3].min(axis=1), a[idx + 4, 4],
        blocks[:, :, 5].sum(axis=1), blocks[:, :, 6].sum(axis=1),
    ))
    return b, idx


@njit
def features(b):
    n = len(b)
    ema20 = np.full(n, np.nan); ema50 = np.full(n, np.nan)
    rsi = np.full(n, np.nan); adx = np.full(n, np.nan)
    plus = np.full(n, np.nan); minus = np.full(n, np.nan)
    volmean = np.full(n, np.nan); mid = np.full(n, np.nan); std = np.full(n, np.nan)
    gain = loss = travg = pmavg = mmavg = dxsum = 0.0
    for i in range(n):
        if i == 19:
            ema20[i] = np.mean(b[:20, 4]); volmean[i] = np.mean(b[:20, 5])
        elif i > 19:
            ema20[i] = ema20[i-1] + 2/21 * (b[i,4]-ema20[i-1])
            volmean[i] = np.mean(b[i-19:i+1, 5])
        if i >= 19:
            mid[i] = np.mean(b[i-19:i+1, 4]); std[i] = np.std(b[i-19:i+1, 4])
        if i == 49: ema50[i] = np.mean(b[:50, 4])
        elif i > 49: ema50[i] = ema50[i-1] + 2/51 * (b[i,4]-ema50[i-1])
        if i == 0: continue
        d = b[i,4]-b[i-1,4]; g=max(d,0.0); l=max(-d,0.0)
        tr=max(b[i,2]-b[i,3],abs(b[i,2]-b[i-1,4]),abs(b[i,3]-b[i-1,4]))
        up=b[i,2]-b[i-1,2]; dn=b[i-1,3]-b[i,3]
        pd=up if up>dn and up>0 else 0.0; md=dn if dn>up and dn>0 else 0.0
        if i <= 14:
            gain += g/14; loss += l/14; travg += tr/14; pmavg += pd/14; mmavg += md/14
        else:
            gain=(gain*13+g)/14; loss=(loss*13+l)/14
            travg=(travg*13+tr)/14; pmavg=(pmavg*13+pd)/14; mmavg=(mmavg*13+md)/14
        if i >= 14:
            rsi[i]=100*gain/(gain+loss) if gain+loss else 50
            plus[i]=100*pmavg/travg if travg else 0; minus[i]=100*mmavg/travg if travg else 0
            den=plus[i]+minus[i]; dx=100*abs(plus[i]-minus[i])/den if den else 0
            if i <= 27: dxsum += dx/14
            if i == 27: adx[i]=dxsum
            elif i > 27: adx[i]=(adx[i-1]*13+dx)/14
    return ema20,ema50,rsi,adx,plus,minus,volmean,mid,std


def raw_signals(b, ft, family, side):
    ema20,ema50,rsi,_,_,_,_,mid,std=ft
    ii=np.arange(50,len(b)-1); ok=np.ones(len(ii),bool)
    ok &= b[ii+1,0]-b[ii,0] == 300000
    if family == "donchian_breakout":
        high=np.array([np.max(b[i-20:i,2]) for i in ii])
        low=np.array([np.min(b[i-20:i,3]) for i in ii])
        ok &= (b[ii,4]>high)&(b[ii,4]>b[ii,1]) if side=="LONG" else (b[ii,4]<low)&(b[ii,4]<b[ii,1])
    elif family == "ema_pullback":
        if side=="LONG": ok &= (ema20[ii]>ema50[ii])&(b[ii,3]<=ema20[ii])&(b[ii,4]>ema20[ii])&(b[ii,4]>b[ii,1])
        else: ok &= (ema20[ii]<ema50[ii])&(b[ii,2]>=ema20[ii])&(b[ii,4]<ema20[ii])&(b[ii,4]<b[ii,1])
    else:
        lower=mid[ii]-2*std[ii]; upper=mid[ii]+2*std[ii]
        if side=="LONG": ok &= (rsi[ii]<=25)&(b[ii,3]<lower)&(b[ii,4]>lower)&(b[ii,4]>b[ii,1])
        else: ok &= (rsi[ii]>=75)&(b[ii,2]>upper)&(b[ii,4]<upper)&(b[ii,4]<b[ii,1])
    return ii[ok]


def masks(b, ft, idx, side, btc, btc_ft):
    _,_,_,adx,plus,minus,volmean,_,_=ft
    atr=atr14(b); flow=np.divide(b[:,6],b[:,5],out=np.full(len(b),np.nan),where=b[:,5]>0)
    directional=(plus[idx]>minus[idx]) if side=="LONG" else (minus[idx]>plus[idx])
    f_adx=(adx[idx]>=20)&directional
    f_volume=b[idx,5]>=1.5*volmean[idx]
    f_flow=(flow[idx]>=.55) if side=="LONG" else (flow[idx]<=.45)
    atrpct=atr[idx]/b[idx,4]; f_vol=np.isfinite(atrpct)&(atrpct>=.0015)&(atrpct<=.015)
    bt=btc[:,0].astype(np.int64); entry=b[idx+1,0].astype(np.int64)
    bj=np.searchsorted(bt+300000,entry,side="right")-1; valid=bj>=0; bj=np.maximum(bj,0)
    be20,be50,_,_,_,_,_,_,_=btc_ft
    f_btc=valid&((be20[bj]>be50[bj]) if side=="LONG" else (be20[bj]<be50[bj]))
    return {
      "none":np.ones(len(idx),bool),"adx":f_adx,"volume":f_volume,"flow":f_flow,
      "volatility":f_vol,"btc_align":f_btc,"adx_volume":f_adx&f_volume,
      "btc_flow":f_btc&f_flow,"all":f_adx&f_volume&f_flow&f_vol&f_btc,
    }


@njit
def simulate(a, entries, atr_values, side, tp_atr, sl_atr, timeout, start, end):
    out=np.empty((len(entries),4),np.float64); count=0; last=-1
    boundary=np.searchsorted(a[:,0],end)
    for k in range(len(entries)):
        eidx=entries[k]; ts=a[eidx,0]
        if ts<start or ts>=end or eidx<=last: continue
        e=a[eidx,1]; dist=max(sl_atr*atr_values[k],.003*e); tp=tp_atr*atr_values[k]
        stop=e-dist if side==1 else e+dist; target=e+tp if side==1 else e-tp
        limit=min(boundary,eidx+timeout); found=False
        for j in range(eidx,limit):
            o,h,l=a[j,1],a[j,2],a[j,3]
            if side==1:
                if o<=stop: px=o; reason=1
                elif o>=target: px=target; reason=2
                elif l<=stop: px=stop; reason=1
                elif h>=target: px=target; reason=2
                else: continue
                net=px/e-1-core.COST
            else:
                if o>=stop: px=o; reason=1
                elif o<=target: px=target; reason=2
                elif h>=stop: px=stop; reason=1
                elif l<=target: px=target; reason=2
                else: continue
                net=1-px/e-core.COST
            out[count,0]=ts; out[count,1]=a[j,0]; out[count,2]=net; out[count,3]=reason
            count+=1;last=j;found=True;break
        if not found and eidx+timeout<=boundary:
            j=eidx+timeout-1; px=a[j,4]
            net=(px/e-1 if side==1 else 1-px/e)-core.COST
            out[count,0]=ts; out[count,1]=a[j,0]; out[count,2]=net; out[count,3]=3
            count+=1;last=j
    return out[:count]


def metrics(rows,start,end):
    m=core.metrics(rows); m["weekly_block_avg_bps_ci95"]=weekly_ci(rows,start,end)
    return m


def run_symbol(sym, btc, btc_ft):
    a,cov=load_minutes(sym); b,minute_idx=five_minutes(a); ft=features(b); atr=atr14(b)
    results={}; raw={}
    for family in FAMILIES:
      for side in SIDES:
        sig=raw_signals(b,ft,family,side); base_entry=minute_idx[sig]+5
        valid=(base_entry<len(a))&np.isfinite(atr[sig]); sig=sig[valid]; base_entry=base_entry[valid]
        mm=masks(b,ft,sig,side,btc,btc_ft)
        for exit_name,ex in EXITS.items():
          for filter_name in FILTERS:
            take=mm[filter_name]; entries=base_entry[take]; av=atr[sig][take]
            key="|".join((family,side,exit_name,filter_name)); results[key]={}
            raw[key]={}
            for period,(start,end) in PERIODS.items():
                tr=simulate(a,entries,av,1 if side=="LONG" else -1,ex["tp_atr"],ex["sl_atr"],ex["timeout_min"],start,end)
                results[key][period]=metrics(tr,start,end)
                raw[key][period]=tr
    print("GRID_SYMBOL "+json.dumps({"symbol":sym,"variants":len(results)}),flush=True)
    return sym,cov,results,raw


def run():
    btc_a,btc_cov=load_minutes("BTCUSDT"); btc,_=five_minutes(btc_a); btc_ft=features(btc)
    aggregate={}; coverage=[btc_cov]; by_symbol={}; allrows={}
    with ThreadPoolExecutor(max_workers=4) as pool:
      for sym,cov,res,raw in pool.map(lambda s:run_symbol(s,btc,btc_ft),TOP10):
        coverage.append(cov); by_symbol[sym]=res
        for key,periods in raw.items():
            target=allrows.setdefault(key,{p:[] for p in PERIODS})
            for period,rows in periods.items(): target[period].append(rows)
    for family in FAMILIES:
      for side in SIDES:
       for exit_name in EXITS:
        for filter_name in FILTERS:
          key="|".join((family,side,exit_name,filter_name)); aggregate[key]={}
          for period,(start,end) in PERIODS.items():
            chunks=allrows[key][period]
            rows=np.concatenate(chunks) if chunks else np.empty((0,4))
            aggregate[key][period]=metrics(rows,start,end)
    eligible=[]
    for k,v in aggregate.items():
        if all(v[p]["n"]>=GATE["min_n_each"] and v[p]["pf"] is not None and v[p]["pf"]>GATE["min_pf_each"] and v[p]["avg_net_bps"]>0 for p in PERIODS): eligible.append(k)
    report={"window":{"start":core.START_DT.isoformat(),"split":core.SPLIT_DT.isoformat(),"end_exclusive":core.END_DT.isoformat()},
      "symbols":TOP10,"families":FAMILIES,"sides":SIDES,"exits":EXITS,"filters":FILTERS,"variant_count":len(aggregate),
      "cost_roundtrip_pct":.16,"gate":GATE,"eligible":eligible,
      "warnings":["Validation year has already been researched and is not a pristine holdout.","Fixed prior 10-symbol universe has selection/survivorship bias.","Funding is a 2 bps reserve inside total cost, not realized historical funding.","Independent symbol backtests; no overlapping-position portfolio or liquidation model."],
      "method":["Signals use completed 5m bars; entry is the next 1m open.","All 108 variants were frozen before the run; no post-result parameter changes.","Filter values use the completed signal bar; BTC alignment uses the latest completed BTC 5m bar.","Stop is evaluated before target on same-bar ambiguity; adverse stop gaps fill at open.","Same-symbol overlap is suppressed separately per variant and period."],
      "coverage":coverage,"aggregate":aggregate,"by_symbol":by_symbol}
    out=Path("research-output");out.mkdir(exist_ok=True)
    (out/"long-short-grid-3y.json").write_text(json.dumps(report,indent=2,allow_nan=False))
    print("GRID_RESULT "+json.dumps({"variants":len(aggregate),"eligible":eligible,"top_train":sorted(aggregate,key=lambda k:aggregate[k]["train"]["avg_net_bps"] or -1e9,reverse=True)[:10]}),flush=True)


if __name__=="__main__": run()
