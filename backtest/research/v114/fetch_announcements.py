import json, urllib.request, time, os
D=os.path.dirname(os.path.abspath(__file__)); out={}
for cat in (48,161):
    arts=[]
    for p in range(1,60):
        u=f"https://www.binance.com/bapi/composite/v1/public/cms/article/list/query?type=1&catalogId={cat}&pageNo={p}&pageSize=50"
        d=json.loads(urllib.request.urlopen(urllib.request.Request(u,headers={'User-Agent':'research'}),timeout=20).read())
        a=[x for c in d['data']['catalogs'] for x in c['articles']]
        if not a: break
        arts+= [(x['releaseDate'],x['title']) for x in a]
        if a[-1]['releaseDate'] < 1725148800000: break   # older than 2024-09-01
        time.sleep(0.3)
    out[cat]=arts; print(cat,len(arts),time.strftime('%Y-%m-%d',time.gmtime(arts[-1][0]/1000)))
json.dump(out,open(f"{D}/ann.json",'w'))
