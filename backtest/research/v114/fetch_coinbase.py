import json, time, urllib.request, concurrent.futures as cf, datetime as dt, sys, os
D=os.path.dirname(os.path.abspath(__file__))
start=int(dt.datetime(2025,9,1,tzinfo=dt.timezone.utc).timestamp()); end=int(dt.datetime(2026,9,1,tzinfo=dt.timezone.utc).timestamp())
def get(prod,a):
    b=a+300*60
    u=f"https://api.exchange.coinbase.com/products/{prod}/candles?granularity=60&start={dt.datetime.utcfromtimestamp(a).isoformat()}Z&end={dt.datetime.utcfromtimestamp(b-60).isoformat()}Z"
    for k in range(6):
        try:
            r=urllib.request.Request(u,headers={'User-Agent':'research'})
            return json.loads(urllib.request.urlopen(r,timeout=20).read())
        except Exception as e:
            time.sleep(1+k*2)
    return []
for prod in ['BTC-USD','ETH-USD']:
    rows={}
    starts=list(range(start,end,300*60))
    with cf.ThreadPoolExecutor(6) as ex:
        for i,res in enumerate(ex.map(lambda a:(time.sleep(0.12),get(prod,a))[1],starts)):
            for c in res: rows[c[0]]=c
    with open(f"{D}/cb-{prod}.json",'w') as f: json.dump(sorted(rows.values()),f)
    print(prod,len(rows),flush=True)
