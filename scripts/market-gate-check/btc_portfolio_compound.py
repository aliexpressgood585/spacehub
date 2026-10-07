"""BTC portfolio compounding test for the two frozen candidates from BTC exhaustive search.

Research only. Starts with $1,000, uses 100% of current equity per trade, no leverage,
skips overlapping signals while a trade is open, compounds after each closed trade.
Reports final equity, total return and closed-equity max drawdown.
"""
import json
from pathlib import Path
import numpy as np

import market_gate_check as core
import broad_alpha_search as broad
import btc_exhaustive_search as btc

START_BALANCE = 1000.0
SYMBOL = "BTCUSDT"
SPLIT, END = core.SPLIT, core.END
COST = core.COST

STRATEGIES = [
    {
        "name":"BTC_4H_vol_expansion_long",
        "tf":240,
        "signal":"expand_b1.0_v1.5_green",
        "side":1,
        "filter":"trend20_50_up",
        "tp":0.02,"sl":0.015,"hold_hours":24,
    },
    {
        "name":"BTC_4H_momentum_8h_long",
        "tf":240,
        "signal":"ret8h_ge_0.015",
        "side":1,
        "filter":"volume_high",
        "tp":0.03,"sl":0.05,"hold_hours":48,
    },
]

def trade_records(a, idx, side, tp, sl, hold_hours, tf, start, end):
    hold=max(1,int(round(hold_hours*60/tf)))
    boundary=np.searchsorted(a[:,0],end)
    out=[];last=-1
    for sig_i in idx:
        i=int(sig_i)+1
        if i<=last or i>=boundary: continue
        ts=int(a[i,0])
        if ts<start or ts>=end: continue
        e=float(a[i,1])
        target=e*(1+side*tp); stop=e*(1-side*sl)
        lim=min(boundary,i+hold)
        done=False
        for j in range(i,lim):
            reason=None
            if side>0:
                if a[j,1]<=stop: px=float(a[j,1]); reason="stop_gap"
                elif a[j,1]>=target: px=target; reason="target_gap"
                elif a[j,3]<=stop: px=stop; reason="stop"
                elif a[j,2]>=target: px=target; reason="target"
                else: continue
            else:
                if a[j,1]>=stop: px=float(a[j,1]); reason="stop_gap"
                elif a[j,1]<=target: px=target; reason="target_gap"
                elif a[j,2]>=stop: px=stop; reason="stop"
                elif a[j,3]<=target: px=target; reason="target"
                else: continue
            net=side*(px/e-1)-COST
            out.append({
                "entry_ms":ts,"exit_ms":int(a[j,0]),"entry":e,"exit":px,
                "net_return":float(net),"reason":reason,
            })
            last=j;done=True;break
        if not done:
            if i+hold>boundary: break
            j=i+hold-1;px=float(a[j,4]);net=side*(px/e-1)-COST
            out.append({
                "entry_ms":ts,"exit_ms":int(a[j,0]),"entry":e,"exit":px,
                "net_return":float(net),"reason":"time",
            })
            last=j
    return out

def portfolio_stats(trades):
    bal=START_BALANCE
    peak=bal
    max_dd=0.0
    eq=[bal]
    wins=0
    losses=0
    gross_win=0.0
    gross_loss=0.0
    for t in trades:
        pnl=bal*t["net_return"]
        bal += pnl
        t["balance_after"]=round(bal,6)
        t["pnl_usd"]=round(pnl,6)
        eq.append(bal)
        if t["net_return"]>0:
            wins+=1;gross_win+=t["net_return"]
        elif t["net_return"]<0:
            losses+=1;gross_loss+=-t["net_return"]
        if bal>peak: peak=bal
        dd=(peak-bal)/peak if peak>0 else 0
        max_dd=max(max_dd,dd)
    arr=np.array([t["net_return"] for t in trades],float)
    return {
        "start_balance":START_BALANCE,
        "final_balance":round(bal,2),
        "net_profit_usd":round(bal-START_BALANCE,2),
        "total_return_pct":round((bal/START_BALANCE-1)*100,3),
        "trades":len(trades),
        "wins":wins,
        "losses":losses,
        "win_rate_pct":round(100*wins/len(trades),3) if trades else None,
        "profit_factor_trade_returns":round(gross_win/gross_loss,4) if gross_loss else None,
        "avg_trade_pct":round(float(arr.mean())*100,4) if len(arr) else None,
        "max_closed_equity_drawdown_pct":round(max_dd*100,3),
        "best_trade_pct":round(float(arr.max())*100,4) if len(arr) else None,
        "worst_trade_pct":round(float(arr.min())*100,4) if len(arr) else None,
    }

def run():
    a5=core.load(SYMBOL,"5m")[0]
    a=btc.resample(a5,240)
    cands,f=btc.generate_signals(a,240)
    masks=btc.filter_masks(a,f)
    results=[]
    for sdef in STRATEGIES:
        sig=[x for x in cands if x["name"]==sdef["signal"] and x["side"]==sdef["side"]]
        if not sig: raise RuntimeError("missing signal "+sdef["signal"])
        idx=sig[0]["idx"]
        m=masks[sdef["filter"]]
        idx=idx[m[idx]]
        trades=trade_records(a,idx,sdef["side"],sdef["tp"],sdef["sl"],sdef["hold_hours"],240,SPLIT,END)
        stats=portfolio_stats(trades)
        results.append({"strategy":sdef,"stats":stats,"trades":trades})
        print("PORTFOLIO_RESULT "+json.dumps({"strategy":sdef,"stats":stats}),flush=True)

    report={
      "window":{"start":core.SPLIT_DT.isoformat(),"end_exclusive":core.END_DT.isoformat()},
      "starting_balance_usd":START_BALANCE,
      "position_sizing":"100% of current equity per trade, no leverage; overlapping signals skipped while a trade is open",
      "roundtrip_cost_pct":COST*100,
      "drawdown_definition":"Maximum peak-to-trough drawdown of closed-trade compounded equity. It is not intrabar mark-to-market drawdown.",
      "method":[
        "Research only; no account/runtime changes.",
        "The two strategy definitions and exits are frozen from the prior BTC-only search.",
        "Each trade uses the full current balance, so returns are compounded multiplicatively.",
        "No leverage is used. Fees/slippage reserve are represented by the inherited 0.16% round-trip cost.",
        "Same-bar ambiguity is stop-first, matching the prior backtest.",
      ],
      "results":results,
    }
    out=Path("research-output");out.mkdir(exist_ok=True)
    (out/"btc-portfolio-compound-1k.json").write_text(json.dumps(report,indent=2,allow_nan=False))
    print("PORTFOLIO_SUMMARY "+json.dumps([{"name":r["strategy"]["name"],**r["stats"]} for r in results]),flush=True)

if __name__=="__main__":
    run()
