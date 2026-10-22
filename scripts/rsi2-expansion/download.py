import concurrent.futures as cf, csv, hashlib, io, json, time, urllib.request, urllib.error, zipfile
from pathlib import Path
ROOT=Path(__file__).resolve().parent
SYMS='BTCUSDT ETHUSDT SOLUSDT BNBUSDT XRPUSDT DOGEUSDT ADAUSDT AVAXUSDT LINKUSDT SUIUSDT AAVEUSDT LTCUSDT TRADOORUSDT MYXUSDT'.split()
MONTHS=[f'2025-{m:02}' for m in range(10,13)]+[f'2026-{m:02}' for m in range(1,10)]
def fetch(task):
    sym,kind,month=task
    folder=f'{kind}/{sym}/5m' if kind!='fundingRate' else f'{kind}/{sym}'
    name=f'{sym}-5m-{month}.zip' if kind!='fundingRate' else f'{sym}-fundingRate-{month}.zip'
    url=f'https://data.binance.vision/data/futures/um/monthly/{folder}/{name}'
    cache=ROOT/'cache'/kind/name; cache.parent.mkdir(parents=True,exist_ok=True)
    for attempt in range(3):
        try:
            raw=cache.read_bytes() if cache.exists() else urllib.request.urlopen(url,timeout=45).read()
            cache.write_bytes(raw)
            with zipfile.ZipFile(io.BytesIO(raw)) as z: rows=list(csv.reader(io.StringIO(z.read(z.namelist()[0]).decode())))
            rows=[r for r in rows if r and r[0].isdigit()]
            return sym,kind,month,rows,{'url':url,'sha256':hashlib.sha256(raw).hexdigest(),'rows':len(rows)}
        except urllib.error.HTTPError as e:
            if e.code==404:return sym,kind,month,[],{'url':url,'error':'404 missing archive'}
            err=str(e)
        except Exception as e:err=str(e)
    return sym,kind,month,[],{'url':url,'error':err}
if __name__=='__main__':
    tasks=[(s,k,m) for s in SYMS for k in ['klines','markPriceKlines','fundingRate'] for m in MONTHS]
    data={s:{'klines':[],'markPriceKlines':[],'fundingRate':[],'manifest':[]} for s in SYMS}
    with cf.ThreadPoolExecutor(max_workers=20) as pool:
        for i,(s,k,m,rows,meta) in enumerate(pool.map(fetch,tasks)):
            data[s][k].extend(rows);data[s]['manifest'].append(meta)
            if i%36==35:print('downloaded',i+1,'/',len(tasks),s,flush=True)
    (ROOT/'data').mkdir(exist_ok=True)
    for s,d in data.items():(ROOT/'data'/f'{s}.json').write_text(json.dumps(d))
    print('DATA_READY',flush=True)
