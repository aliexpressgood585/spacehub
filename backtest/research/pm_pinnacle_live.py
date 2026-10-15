# S1: Polymarket game moneylines vs Pinnacle de-vigged (proportional) fair odds, live snapshot (no history via the guest API).
# Run: PINNACLE_GUEST_KEY=... python3 -I backtest/research/pm_pinnacle_live.py
import json, urllib.request, re, datetime as dt, sys
import os
K=os.environ['PINNACLE_GUEST_KEY']  # the public guest key Pinnacle's own website sends (X-API-Key); not committed
def get(u, h=None):
    return json.load(urllib.request.urlopen(urllib.request.Request(u, headers=h or {'User-Agent':'x'}), timeout=30))
def post(u, body):
    return json.load(urllib.request.urlopen(urllib.request.Request(u, data=json.dumps(body).encode(), headers={'Content-Type':'application/json','User-Agent':'x'}), timeout=30))
dec=lambda a: 1+a/100 if a>0 else 1+100/(-a)
pin=[]
for s in (3,12,15,4,19,29):
    H={'X-API-Key':K,'User-Agent':'x'}
    m={x['id']:x for x in get(f'https://guest.api.arcadia.pinnacle.com/0.1/sports/{s}/matchups?withSpecials=false',H) if x.get('participants') and not x.get('parentId')}
    for k in get(f'https://guest.api.arcadia.pinnacle.com/0.1/sports/{s}/markets/straight?primaryOnly=true',H):
        if k['type']!='moneyline' or k['period']!=0 or k['matchupId'] not in m: continue
        mu=m[k['matchupId']]; parts=mu['participants']
        pr=k['prices']
        if len(pr)!=len(parts) and not (s==29): continue
        names=[]; ps=[]
        for p in pr:
            if 'designation' in p: nm=next((q['name'] for q in parts if q.get('alignment')==p['designation']), p['designation'])
            else: nm=next((q['name'] for q in parts if q['id']==p['participantId']), None)
            names.append(nm); ps.append(1/dec(p['price']))
        tot=sum(ps); pin.append({'sport':s,'league':mu['league']['name'],'start':mu['startTime'],'names':names,'p':[x/tot for x in ps],'vig':tot-1,'limit':k['limits'][0]['amount']})
print('pinnacle lines',len(pin))
# Polymarket game markets ending within 10 days
now=dt.datetime.now(dt.timezone.utc); mk=[]
for off in range(0,2000,100):
    try: r=get(f'https://gamma-api.polymarket.com/markets?closed=false&active=true&limit=100&offset={off}&end_date_min={now.isoformat()[:19]}Z&end_date_max={(now+dt.timedelta(days=10)).isoformat()[:19]}Z&volume_num_min=1000&order=volumeNum&ascending=false')
    except Exception: break
    if not r: break
    mk+=r
print('polymarket markets',len(mk))
norm=lambda x: re.sub(r'[^a-z0-9 ]','',x.lower())
def toks(n): return {w for w in norm(n).split() if len(w)>=4 and w not in ('team','united','city','esports','gaming','club')}
pairs=[]
for m in mk:
    try: outs=json.loads(m['outcomes']); tk=json.loads(m['clobTokenIds'])
    except: continue
    if len(outs)!=2 or outs[0].lower() in ('yes','no','over','under'): continue
    smt=(m.get('sportsMarketType') or '').lower()
    if smt and smt!='moneyline': continue
    if re.search(r'spread|handicap|o/u|total|map \d|game \d|half|quarter|period|inning|set \d|1h|first|kills|rounds', m['question'], re.I): continue
    for L in pin:
        if L['sport']==29 and len(L['names'])!=2: continue  # soccer 3-way skipped
        hit=[]
        for o in outs:
            j=[i for i,nm in enumerate(L['names']) if nm and (toks(nm)&toks(o) or norm(nm)==norm(o))]
            hit.append(j[0] if len(j)==1 else None)
        if None in hit or hit[0]==hit[1]: continue
        st=abs((dt.datetime.fromisoformat(L['start'].replace('Z','+00:00'))-dt.datetime.fromisoformat((m.get('gameStartTime') or m['endDate']).replace(' ','T').replace('Z','+00:00') if (m.get('gameStartTime') or m['endDate']) else now)).total_seconds())
        if st>36*3600: continue
        pairs.append((m,outs,tk,L,hit)); break
print('matched',len(pairs))
toksall=[t for p in pairs for t in p[2]]
books={}
for i in range(0,len(toksall),100):
    for b in post('https://clob.polymarket.com/books',[{'token_id':t} for t in toksall[i:i+100]]):
        asks=sorted(float(a['price']) for a in b.get('asks',[])); bids=sorted((float(a['price']) for a in b.get('bids',[])),reverse=True)
        books[b['asset_id']]=(asks[0] if asks else None, bids[0] if bids else None)
rows=[]
for m,outs,tk,L,hit in pairs:
    for o,t,h in zip(outs,tk,hit):
        ask,bid=books.get(t,(None,None))
        if not ask: continue
        fair=L['p'][h]; fee=0.0
        ev=fair/(ask+0.0)-1
        rows.append((ev,fair,ask,bid,o,m['question'][:55],L['league'][:22],float(m.get('volumeNum') or 0)))
rows.sort(reverse=True)
print(f'{len(rows)} sides priced. gaps fair-ask: >=3c {sum(r[1]-r[2]>=0.03 for r in rows)}, >=1c {sum(r[1]-r[2]>=0.01 for r in rows)}')
med=sorted(abs(r[1]-(r[2]+(r[3] or r[2]))/2) for r in rows)
print('median |fair - mid| c', round(100*med[len(med)//2],2) if med else None)
for r in rows[:15]: print(f'EV {100*r[0]:+5.1f}%  fair {r[1]:.3f} ask {r[2]:.3f} bid {r[3]}  {r[4][:18]:18} | {r[5]} | {r[6]} vol {r[7]:.0f}')
