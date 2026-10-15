"""Telegram history for the "Poly News" study (owner 2026-10-15). Public channels only, read from the open web preview
(https://t.me/s/<channel>?before=<id>, 20 posts a page, no account, no key). One row per post: channel, id, UTC time, text.
Run: python3 -I backtest/research/pmn_tg_fetch.py <out.jsonl> <days> <ch,ch,...>
"""
import sys, re, json, time, html, datetime as dt, urllib.request, concurrent.futures as cf

OUT, DAYS, CHS = sys.argv[1], int(sys.argv[2]), sys.argv[3].split(',')
since = time.time() - DAYS * 86400

def get(u):
    for k in range(6):
        try: return urllib.request.urlopen(urllib.request.Request(u, headers={'User-Agent': 'Mozilla/5.0'}), timeout=30).read().decode('utf8', 'replace')
        except Exception: time.sleep(2 + 3 * k)
    return ''

def page(ch, before=None):
    h = get(f'https://t.me/s/{ch}' + (f'?before={before}' if before else ''))
    out = []
    for m in re.split(r'<div class="tgme_widget_message_wrap', h)[1:]:
        pid = re.search(r'data-post="[^"/]+/(\d+)"', m); t = re.search(r'<time datetime="([^"]+)"', m)
        x = re.search(r'tgme_widget_message_text[^>]*>(.*?)</div>', m, re.S)
        if not pid or not t: continue
        txt = html.unescape(re.sub(r'<br\s*/?>', ' ', x.group(1)) if x else '')
        txt = re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', ' ', txt)).strip()
        out.append({'ch': ch, 'id': int(pid.group(1)), 'ts': int(dt.datetime.fromisoformat(t.group(1)).timestamp()), 'text': txt})
    return out

def chan(ch):
    rows, before = [], None
    for _ in range(3000):
        p = page(ch, before)
        if not p: break
        rows += [r for r in p if r['text']]
        lo = min(r['id'] for r in p)
        if min(r['ts'] for r in p) < since or lo <= 1 or lo == before: break
        before = lo; time.sleep(0.4)
    rows = [r for r in rows if r['ts'] >= since]
    print(ch, len(rows), file=sys.stderr, flush=True)
    return rows

with open(OUT, 'w') as f, cf.ThreadPoolExecutor(4) as ex:
    for rows in ex.map(chan, CHS):
        for r in sorted(rows, key=lambda r: r['ts']): f.write(json.dumps(r, ensure_ascii=False) + '\n')
