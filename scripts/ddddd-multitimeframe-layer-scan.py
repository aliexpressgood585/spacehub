import csv, io, json, urllib.request, zipfile, concurrent.futures, math
from datetime import datetime, timezone

SYMS=["ANKRUSDT","ARKUSDT","1000000MOGUSDT","AGTUSDT","SUSHIUSDT","LQTYUSDT","HYPERUSDT","KAVAUSDT","LUMIAUSDT","ALPINEUSDT"]
TFS={"3m":180000}
START=int(datetime(2026,7,8,tzinfo=timezone.utc).timestamp()*1000)
END=int(datetime(2026,10,6,tzinfo=timezone.utc).timestamp()*1000)
SPLIT=int(datetime(2026,9,6,tzinfo=timezone.utc).timestamp()*1000)
BASE="https://data.binance.vision/data/futures/um"
UA={"User-Agent":"spacehub-mtf-layer/1.0"}
COST=.001
TP=.01
SL=.01

def load_zip(url):
    try:
        req=urllib.request.Request(url,headers=UA)
        with urllib.request.urlopen(req,timeout=30) as r: raw=r.read()
        with zipfile.ZipFile(io.BytesIO(raw)) as z: txt=z.read(z.namelist()[0]).decode()
        out=[]
        for row in csv.reader(io.StringIO(txt)):
            if not row or not row[0].isdigit(): continue
            t=int(row[0])
            if START<=t<END:
                out.append((t,float(row[1]),float(row[2]),float(row[3]),float(row[4])))
        return out
    except Exception:
        return []

def load(sym,tf):
    urls=[f"{BASE}/monthly/klines/{sym}/{tf}/{sym}-{tf}-2026-{m:02d}.zip" for m in (7,8,9)]
    urls += [f"{BASE}/daily/klines/{sym}/{tf}/{sym}-{tf}-2026-10-{d:02d}.zip" for d in range(1,6)]
    a=[]
    for u in urls: a.extend(load_zip(u))
    a.sort(key=lambda x:x[0])
    z=[]; seen=set()
    for x in a:
        if x[0] not in seen:
            seen.add(x[0]); z.append(x)
    return z

class Seg:
    def __init__(self,arr,mode):
        n=1
        while n<len(arr): n*=2
        self.n=n; self.mode=mode
        neutral=-float("inf") if mode=="max" else float("inf")
        self.t=[neutral]*(2*n)
        for i,v in enumerate(arr): self.t[n+i]=v
        fn=max if mode=="max" else min
        for i in range(n-1,0,-1): self.t[i]=fn(self.t[2*i],self.t[2*i+1])
    def first(self,l,threshold):
        # first idx >= l where value >= threshold (max) or <= threshold (min)
        def ok(v): return v>=threshold if self.mode=="max" else v<=threshold
        def rec(node,a,b):
            if b<=l or not ok(self.t[node]): return None
            if b-a==1: return a
            m=(a+b)//2
            x=rec(node*2,a,m)
            return x if x is not None else rec(node*2+1,m,b)
        x=rec(1,0,self.n)
        return x

def sig_at(b,i,n,kind):
    p=b[i-n:i]
    if len(p)<n:return False
    if kind=="red": return all(x[4]<x[1] for x in p)
    if kind=="green": return all(x[4]>x[1] for x in p)
    if kind=="fall": return all(p[k][4]>p[k+1][4] for k in range(n-1))
    if kind=="rise": return all(p[k][4]<p[k+1][4] for k in range(n-1))
    return False

PATTERNS=[]
for n in range(2,9):
    PATTERNS += [
      (f"{n}R_LONG","red",n,1),(f"{n}G_SHORT","green",n,-1),
      (f"{n}R_SHORT","red",n,-1),(f"{n}G_LONG","green",n,1),
      (f"{n}FALL_LONG","fall",n,1),(f"{n}RISE_SHORT","rise",n,-1),
      (f"{n}FALL_SHORT","fall",n,-1),(f"{n}RISE_LONG","rise",n,1),
    ]

def one(sym,tf):
    b=load(sym,tf); step=TFS[tf]
    if not b:return {"sym":sym,"tf":tf,"bars":0,"rows":[]}
    hi=[x[2] for x in b]; lo=[x[3] for x in b]
    mx=Seg(hi,"max"); mn=Seg(lo,"min")
    rows=[]
    for name,kind,n,side in PATTERNS:
        trades=[]; i=n
        while i<len(b):
            # require contiguous trigger bars and next evaluation bar
            p=b[i-n:i]
            if len(p)<n or any(p[k][0]!=p[0][0]+k*step for k in range(n)) or b[i][0]!=p[-1][0]+step:
                i+=1; continue
            if not sig_at(b,i,n,kind):
                i+=1; continue
            e=p[-1][4]
            if side==1:
                jt=mx.first(i,e*(1+TP)); js=mn.first(i,e*(1-SL))
            else:
                jt=mn.first(i,e*(1-TP)); js=mx.first(i,e*(1+SL))
            if jt is None and js is None: break
            if js is not None and (jt is None or js<=jt):
                out=-SL-COST; exit_i=js; win=False
            else:
                out=TP-COST; exit_i=jt; win=True
            trades.append((p[-1][0]+step,win,out))
            i=max(i+1,exit_i+1)
        def met(sel):
            z=[x for x in trades if sel(x[0])]
            if not z:return {"n":0,"wr":0,"pf":0,"net_pct":0}
            w=sum(x[1] for x in z); l=len(z)-w
            pos=w*(TP-COST); neg=l*(SL+COST)
            return {"n":len(z),"wr":round(100*w/len(z),2),
                    "pf":round(pos/neg,3) if neg else 999,
                    "net_pct":round(100*sum(x[2] for x in z),2)}
        rows.append({"pattern":name,"all90":met(lambda t:True),
                     "first60":met(lambda t:t<SPLIT),"last30":met(lambda t:t>=SPLIT)})
    return {"sym":sym,"tf":tf,"bars":len(b),"rows":rows}

tasks=[(s,t) for t in TFS for s in SYMS]
res=[]
with concurrent.futures.ThreadPoolExecutor(max_workers=8) as ex:
    futs={ex.submit(one,s,t):(s,t) for s,t in tasks}
    for k,f in enumerate(concurrent.futures.as_completed(futs),1):
        res.append(f.result())
        print("progress",k,"/",len(tasks),flush=True)

report={"generated_at":datetime.now(timezone.utc).isoformat(),
        "window":"2026-07-08 through 2026-10-05 UTC",
        "symbols":SYMS,"timeframes":list(TFS),
        "method":"non-overlapping per-symbol trades; entry after pattern close; TP/SL 1%/1%; 10bp round-trip cost; stop-first on same bar",
        "results":{}}

for tf in TFS:
    rr=[x for x in res if x["tf"]==tf]
    by={}
    for p,_,_,_ in PATTERNS:
        a90=[]; a60=[]; a30=[]; per=[]
        for x in rr:
            row=next(z for z in x["rows"] if z["pattern"]==p)
            per.append({"sym":x["sym"],**row})
            a90.append(row["all90"]); a60.append(row["first60"]); a30.append(row["last30"])
        def agg(xs):
            n=sum(x["n"] for x in xs)
            if not n:return {"n":0,"wr":0,"pf":0,"net_pct":0}
            # fixed outcome sizes allow reconstructing wins from wr*n with rounding risk; use weighted approx
            wins=sum(round(x["n"]*x["wr"]/100) for x in xs); losses=n-wins
            pos=wins*(TP-COST); neg=losses*(SL+COST)
            return {"n":n,"wins":wins,"wr":round(100*wins/n,2),
                    "pf":round(pos/neg,3) if neg else 999,
                    "net_pct":round(100*(pos-neg),2)}
        by[p]={"all90":agg(a90),"first60":agg(a60),"last30":agg(a30),"per_symbol":per}
    ranked=sorted(by.items(),key=lambda kv:(kv[1]["all90"]["wr"],kv[1]["all90"]["n"]),reverse=True)
    robust=[{"pattern":p,**v} for p,v in ranked if v["all90"]["n"]>=150 and v["all90"]["wr"]>=58 and v["all90"]["pf"]>1 and v["first60"]["wr"]>=55 and v["last30"]["wr"]>=55]
    subsets=[]
    for p,v in ranked:
        selected=[x for x in v["per_symbol"] if x["all90"]["n"]>=20 and x["first60"]["n"]>=10 and x["last30"]["n"]>=5 and x["all90"]["wr"]>=58 and x["first60"]["wr"]>=58 and x["last30"]["wr"]>=58]
        if not selected: continue
        def ag(rows,key):
            n=sum(x[key]["n"] for x in rows); wins=sum(round(x[key]["n"]*x[key]["wr"]/100) for x in rows); losses=n-wins
            pos=wins*(TP-COST); neg=losses*(SL+COST)
            return {"n":n,"wins":wins,"wr":round(100*wins/n,2) if n else 0,"pf":round(pos/neg,3) if neg else 999,"net_pct":round(100*(pos-neg),2)}
        subsets.append({"pattern":p,"symbols":[x["sym"] for x in selected],"all90":ag(selected,"all90"),"first60":ag(selected,"first60"),"last30":ag(selected,"last30")})
    subsets.sort(key=lambda x:(x["all90"]["n"]>=100,x["all90"]["wr"],x["all90"]["n"]),reverse=True)
    report["results"][tf]={"robust58":robust[:20],"subsets58":subsets[:30],
                           "top20":[{"pattern":p,**v} for p,v in ranked[:20]]}

print("MTF_RESULT_START")
print(json.dumps(report,indent=2))
print("MTF_RESULT_END")
