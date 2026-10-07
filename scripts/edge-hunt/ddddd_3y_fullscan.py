"""3-year Binance Futures DDDDD study: 5 red 5m candles -> long, TP1%, SL1%.
Paper/research only. Report both original overlapping signals and executable
non-overlap next-open trades, never confuse summed trades with portfolio return.
"""
import csv,io,json,hashlib,urllib.request,urllib.error,zipfile,time
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor,as_completed
from datetime import datetime,timezone
import numpy as np
from numba import njit

ROOT=Path(__file__).resolve().parents[2]
START=int(datetime(2023,10,8,tzinfo=timezone.utc).timestamp()*1000)
END=int(datetime(2026,10,7,tzinfo=timezone.utc).timestamp()*1000)
MONTHS=[(y,m) for y in (2023,2024,2025,2026) for m in range(1,13)
        if (y,m)>=(2023,10) and (y,m)<=(2026,9)]
SYMBOLS=[x["symbol"] for x in json.loads((ROOT/"status/ddddd-binance-fullscan.json").read_text())["all"]]
BASE="https://data.binance.vision/data/futures/um"
COST=.001 # original 90d model: 0.1% roundtrip
STRESS=.0016
UA={"User-Agent":"spacehub-ddddd-3y-research/1.0"}

def download(sym):
    rows=[];manifest=[];files=0
    urls=[f"{BASE}/monthly/klines/{sym}/5m/{sym}-5m-{y}-{m:02d}.zip" for y,m in MONTHS]
    urls += [f"{BASE}/daily/klines/{sym}/5m/{sym}-5m-2026-10-{d:02d}.zip" for d in range(1,7)]
    for url in urls:
        raw=None
        for k in range(2):
            try:
                req=urllib.request.Request(url,headers=UA)
                with urllib.request.urlopen(req,timeout=35) as r:raw=r.read()
                break
            except urllib.error.HTTPError as e:
                if e.code==404:break
                if k==0:time.sleep(0.5)
            except Exception:
                if k==0:time.sleep(0.5)
        if raw is None:
            manifest.append({"url":url,"missing":True});continue
        try:
            with zipfile.ZipFile(io.BytesIO(raw)) as z:txt=z.read(z.namelist()[0]).decode()
            n=0
            for r in csv.reader(io.StringIO(txt)):
                if not r or not r[0].isdigit():continue
                t=int(r[0]);t=t//1000 if t>10**14 else t
                if START<=t<END:
                    rows.append((t,float(r[1]),float(r[2]),float(r[3]),float(r[4])));n+=1
            manifest.append({"url":url,"sha256":hashlib.sha256(raw).hexdigest(),"rows":n})
            files+=1
        except Exception as e:manifest.append({"url":url,"error":type(e).__name__})
    rows=sorted({r[0]:r for r in rows}.values())
    return np.asarray(rows,float).reshape((-1,5)),manifest,files

@njit
def trade_engine(a,overlap,next_open,max_hold,fee):
    n=len(a);rec=np.empty((n,6),float);count=0;last_exit=-1
    amb=0;unresolved=0
    for i in range(5,n-1):
        ok=True
        for q in range(i-5,i):
            if not a[q,4]<a[q,1] or (q>i-5 and a[q,0]-a[q-1,0]!=300000):
                ok=False;break
        if not ok:continue
        if not overlap and i<=last_exit:continue
        entry=a[i,1] if next_open else a[i-1,4]
        tp=entry*1.01;sl=entry*.99
        exitidx=-1;win=0
        lim=min(n,i+max_hold) if max_hold>0 else n
        for j in range(i,lim):
            if j>i and a[j,0]-a[j-1,0]!=300000:break
            lo=a[j,3];hi=a[j,2]
            if lo<=sl and hi>=tp:amb+=1
            # SL-first, conservative. Opening gaps handled for executable mode.
            if next_open and a[j,1]<=sl:
                exitidx=j;win=-1;price=a[j,1];break
            if next_open and a[j,1]>=tp:
                exitidx=j;win=1;price=tp;break
            if lo<=sl:exitidx=j;win=-1;price=sl;break
            if hi>=tp:exitidx=j;win=1;price=tp;break
        if exitidx<0:
            unresolved+=1
            # For no barrier hit, time-exit only in finite-horizon mode.
            if max_hold<=0:continue
            exitidx=min(n-1,lim-1);win=0;price=a[exitidx,4]
        net=(price/entry-1)-fee
        rec[count,0]=a[i,0];rec[count,1]=a[exitidx,0]
        rec[count,2]=net;rec[count,3]=win;rec[count,4]=entry;rec[count,5]=price
        count+=1
        if not overlap:last_exit=exitidx
    return rec[:count],amb,unresolved

def metrics(rec,cost_delta=0):
    if not len(rec):return {"n":0,"wins":0,"win_rate_pct":None,"pf":None,"avg_net_pct":None,"sum_net_pct":0}
    a=rec[:,2]-cost_delta;w=int((a>0).sum());pos=float(a[a>0].sum());neg=float(-a[a<0].sum())
    return {"n":len(a),"wins":w,"win_rate_pct":round(100*w/len(a),3),
            "pf":round(pos/neg,4) if neg else None,
            "avg_net_pct":round(100*float(a.mean()),5),
            "sum_net_pct":round(100*float(a.sum()),4)}

def compound(rec):
    if not len(rec):return {"start_balance":1000,"final_balance":1000,"trades":0}
    b=1000.;pk=b;dd=0.
    for r in rec:
        b*=max(0,1+r[2]);pk=max(pk,b);dd=max(dd,(pk-b)/pk)
    return {"start_balance":1000,"final_balance":round(b,2),
            "return_pct":round(100*(b/1000-1),3),
            "max_closed_equity_drawdown_pct":round(100*dd,3),"trades":len(rec)}

def quarters(rec):
    out=[]
    for y in (2023,2024,2025,2026):
        for q in range(1,5):
            beg=int(datetime(y,3*(q-1)+1,1,tzinfo=timezone.utc).timestamp()*1000)
            if q==4:ey,em=y+1,1
            else:ey,em=y,3*q+1
            end=int(datetime(ey,em,1,tzinfo=timezone.utc).timestamp()*1000)
            if end<=START or beg>=END:continue
            rr=rec[(rec[:,0]>=beg)&(rec[:,0]<end)] if len(rec) else rec
            out.append({"period":f"{y}-Q{q}",**metrics(rr)})
    return out

def one(sym):
    a,manifest,files=download(sym)
    if len(a)<1000:return {"symbol":sym,"status":"SKIP","bars":len(a),"files":files}
    dif=np.diff(a[:,0]);gaps=int((dif!=300000).sum());span_days=(a[-1,0]-a[0,0])/86400000
    orig,amb,unresolved=trade_engine(a,True,False,0,COST)
    execs,amb2,unresolved2=trade_engine(a,False,True,288,COST) # 24h max hold
    byyear=[]
    for y in (2023,2024,2025,2026):
        st=int(datetime(y,1,1,tzinfo=timezone.utc).timestamp()*1000)
        en=int(datetime(y+1,1,1,tzinfo=timezone.utc).timestamp()*1000)
        o=orig[(orig[:,0]>=st)&(orig[:,0]<en)]
        e=execs[(execs[:,0]>=st)&(execs[:,0]<en)]
        byyear.append({"year":y,"original_overlap":metrics(o),"executable_nonoverlap":metrics(e)})
    return {
      "symbol":sym,"status":"OK","bars":len(a),"files":files,
      "first_ms":int(a[0,0]),"last_ms":int(a[-1,0]),"span_days":round(span_days,2),
      "coverage":round(len(a)/max(1,((a[-1,0]-a[0,0])//300000+1)),4),"gaps":gaps,
      "original_overlap":{"stats":metrics(orig),"ambiguous_bars":amb,"unresolved_signals":unresolved},
      "executable_nonoverlap":{"stats":metrics(execs),"stress_016":metrics(execs,STRESS-COST),
                                "compound_1000":compound(execs),"ambiguous_bars":amb2,
                                "time_exits_or_gap":unresolved2,
                                "positive_quarters":sum(1 for x in quarters(execs) if (x["avg_net_pct"] or -999)>0)},
      "years":byyear,"quarters":quarters(execs),
      "data_manifest":manifest
    }

def main():
    results=[]
    with ThreadPoolExecutor(max_workers=6) as ex:
        fs={ex.submit(one,s):s for s in SYMBOLS}
        for i,f in enumerate(as_completed(fs),1):
            s=fs[f]
            try:r=f.result()
            except Exception as e:r={"symbol":s,"status":"ERROR","message":repr(e)}
            results.append(r)
            print(f"DDDDD_PROGRESS {i}/{len(SYMBOLS)} {s} {r['status']} bars={r.get('bars')}",flush=True)
    ranked=sorted([x for x in results if x["status"]=="OK"],key=lambda z:(z["original_overlap"]["stats"]["win_rate_pct"] or -1,z["original_overlap"]["stats"]["n"]),reverse=True)
    full3y=[r for r in ranked if r["span_days"]>=900 and r["coverage"]>=.95]
    top3y=sorted(full3y,key=lambda z:(z["executable_nonoverlap"]["stats"]["pf"] or -1,z["executable_nonoverlap"]["stats"]["n"]),reverse=True)
    out={
      "schema":"ddddd-3y/1.0",
      "window":"2023-10-08 through 2026-10-06 UTC (as available after symbol listing)",
      "symbols_requested":SYMBOLS,"symbols_completed":len(ranked),
      "fully_covered_symbols":len(full3y),
      "method":[
        "5 consecutive red 5m candles (close<open) -> LONG, TP +1%, SL -1%; all comparisons use completed candles.",
        "Original replica: signal entry at fifth-red close, overlapping simulated signals allowed, stop-first same-bar, no maximum holding, 0.1% roundtrip fee; unresolved signals are separately counted and excluded.",
        "Executable diagnostic: next 5m open entry, only one position per symbol, TP1%/SL1%, stop-first including opening gaps, max holding 24h, 0.1% roundtrip. Fees stressed to 0.16%.",
        "Symbol-specific coverage is reported. Newly listed coins MUST NOT be described as tested for three full years.",
        "Compound account illustrations: one symbol, 100% of $1,000 per closed trade, no leverage or concurrent trades; no portfolio cross-coin combination.",
        "No active trading, merge or account changes."
      ],
      "ranked_original_top20":[{"symbol":x["symbol"],"span_days":x["span_days"],"original_overlap":x["original_overlap"],
                                "executable_nonoverlap":x["executable_nonoverlap"],"years":x["years"]} for x in ranked[:20]],
      "full3y_best_executable_top20":[{"symbol":x["symbol"],"original_overlap":x["original_overlap"],
        "executable_nonoverlap":x["executable_nonoverlap"],"years":x["years"]} for x in top3y[:20]],
      "results":results
    }
    dest=ROOT/"research-output";dest.mkdir(exist_ok=True)
    (dest/"ddddd-3y-fullscan.json").write_text(json.dumps(out,indent=2,allow_nan=False))
    print("DDDDD_3Y_SUMMARY "+json.dumps({"requested":len(SYMBOLS),"completed":len(ranked),"full3y":len(full3y),
       "top_original":[{"symbol":x["symbol"],"n":x["original_overlap"]["stats"]["n"],
           "wr":x["original_overlap"]["stats"]["win_rate_pct"],"span_days":x["span_days"]} for x in ranked[:12]],
       "top_executable_3y":[{"symbol":x["symbol"],"wr":x["executable_nonoverlap"]["stats"]["win_rate_pct"],
           "pf":x["executable_nonoverlap"]["stats"]["pf"],"n":x["executable_nonoverlap"]["stats"]["n"]} for x in top3y[:12]]}),flush=True)
if __name__=="__main__":main()
