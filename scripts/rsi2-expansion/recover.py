import concurrent.futures as cf, csv, hashlib, io, json, urllib.request, zipfile
from pathlib import Path
from datetime import datetime, timezone
ROOT=Path(__file__).resolve().parent
def repair(p):
 d=json.loads(p.read_text());s=p.stem
 # Retry corrupt monthly archives without reusing their cache bytes.
 for m in list(d['manifest']):
  if 'error' not in m:continue
  try:
   raw=urllib.request.urlopen(m['url'],timeout=40).read()
   z=zipfile.ZipFile(io.BytesIO(raw));rows=[r for r in csv.reader(io.StringIO(z.read(z.namelist()[0]).decode())) if r and r[0].isdigit()]
   kind=m['url'].split('/monthly/')[1].split('/')[0]
   d[kind].extend(rows);m.pop('error');m.update(sha256=hashlib.sha256(raw).hexdigest(),rows=len(rows))
  except Exception as e:print(s,'retry failed',str(e),flush=True)
 marks={int(r[0]) for r in d['markPriceKlines']}
 dates=sorted({datetime.fromtimestamp((int(r[0])//300000*300000-300000)/1000,timezone.utc).strftime('%Y-%m-%d') for r in d['fundingRate'] if int(r[0])>=1759276800000+900000000 and int(r[0])//300000*300000-300000 not in marks})
 for day in dates:
  url=f'https://data.binance.vision/data/futures/um/daily/markPriceKlines/{s}/5m/{s}-5m-{day}.zip'
  try:
   raw=urllib.request.urlopen(url,timeout=40).read();z=zipfile.ZipFile(io.BytesIO(raw));rows=[r for r in csv.reader(io.StringIO(z.read(z.namelist()[0]).decode())) if r and r[0].isdigit()]
   added=[r for r in rows if int(r[0]) not in marks];d['markPriceKlines'].extend(added);marks.update(int(r[0]) for r in added)
   d['manifest'].append({'url':url,'sha256':hashlib.sha256(raw).hexdigest(),'rows':len(rows),'recovered_missing_rows':len(added)})
  except Exception as e:d['manifest'].append({'url':url,'error':str(e)})
 p.write_text(json.dumps(d));print(s,'recovery checked',dates,flush=True)
with cf.ThreadPoolExecutor(max_workers=14) as pool:list(pool.map(repair,(ROOT/'data').glob('*.json')))
