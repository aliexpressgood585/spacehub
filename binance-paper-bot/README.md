# בוט פיוצ'רס דמו — Binance USDT-M (נייר בלבד)

חשבון דמו של **10,000 USDT** שמדמה חוזה USDT-M של Binance: עמלות VIP0 (מייקר 0.02% / טייקר 0.05%), החלקה, מימון אמיתי בזמני המימון, מדרגות מינוף, מרג'ין מבודד, חיסול לפי מחיר מארק, וסטופ/יעד. **אין מפתחות API ואין פקודות אמיתיות.**

הדשבורד הוא לשונית בבית הבוט: `house.html?tab=futures` («בוט פיוצ'רס · Binance דמו»). אין שרת שרץ כל הזמן — מחזור אחד של GitHub Actions כל 15 דקות.

## איך זה רץ

`.github/workflows/binance-paper-desk.yml`

- תזמון `3,18,33,48 * * * *` (כ־3 דקות אחרי סגירת נר 15 דקות) וגם `workflow_dispatch`.
- טוען את `binance-paper/state.json` מענף `pm-desk-data` (אותו ענף של שאר הדסקים).
- משלים את הזמן מאז המחזור הקודם: נרות 1m סגורים לבדיקת סטופ / יעד / חיסול, היסטוריית מימון אמיתית, ואז האסטרטגיה על כל נר 15m שנסגר.
- כותב את אותו קובץ JSON (הון, יתרה, פוזיציות, עסקאות, עמלות, מימון, אחוז הצלחה, ירידה, עקומת הון, אותות, מחירים, **ומקור המחיר**) ודוחף עם `[skip ci]`.
- מחזור ראשון לא מריץ היסטוריה כעסקאות. הוא מעריך רק את נר ה־15m הסגור האחרון, ואחר כך שומר את הסטופ על הדקות שאחריו. השבתה אחר כך כן מושלמת, כולל כניסות שהוחמצו.

מקור מחיר, לפי הסדר:

1. `https://fapi.binance.com`
2. `https://www.binance.com/fapi` (אותם נתוני production; `fapi.binance.com` מחזיר HTTP 451 מהרבה רצים)
3. נרות ומימון של OKX USDT-SWAP, אם שניהם חסומים — אותו מקור ששאר הדסקים כבר משתמשים בו

עמלות, `tickSize` / `stepSize` / `minNotional` ומדרגות המינוף נשארים של Binance. אם הבורסה חסומה, נטען `data/market_meta.json` שנשמר בריפו. הלשונית כותבת במפורש איזה מקור שימש באותו מחזור.

## אסטרטגיה

ברירת המחדל `trend_ema` (`config.yaml`): חציית EMA20/50 על 15m, רק בכיוון EMA200 של שעה, RSI(14) לא בקיצון, סטופ 2×ATR, יעד 3×ATR, סיכון 1%, עד 3 פוזיציות, מינוף 3, מרג'ין לעסקה עד 30% מההון, הפסד יומי 5% עוצר כניסות. `bollinger_mr` נשאר בקוד ולא פעיל.

בקטסט 90 יום של הכללים האלה (לפני החיבור לכאן) הפסיד: 343 עסקאות, הצלחה 34.4%, נטו −4,838 USDT, PF 0.52. זה דמו, לא טענה לרווח.

## מבנה

```
binance-paper-bot/
├── config.yaml                 # סימבולים, עמלות, סיכון, אסטרטגיה
├── data/market_meta.json       # exchangeInfo + מדרגות מינוף (מטמון Binance)
├── bot/
│   ├── execution/paper.py      # הסימולציה (לא שונתה)
│   ├── engine.py, risk.py, margin.py, strategies/
│   ├── feed.py                 # Binance ואז OKX
│   ├── replay.py               # השלמה על נרות סגורים
│   └── desk.py                 # מחזור אחד: טען מצב, השלם, שמור JSON
└── tests/                      # עמלות, מימון, חיסול, PnL, מקור מחיר, השלמה
```

`tunnel.py`, `manage.sh`, `status.py`, דשבורד ה-FastAPI המקומי ולולאת ה-websocket (`live.py`) לא הועתקו — אין מכונה שרצה ברצף. מודל המילוי זהה.

## בדיקות

```bash
cd binance-paper-bot && python -m pytest -q tests
```

הסוויטה גם רצה מתוך `scripts/run-tests.sh`.

## אחרי מיזוג

1. ה-workflow נכנס ל-main ורץ לבד. אם GitHub לא מפעיל workflow חדש עד הרצה ידנית: Actions → binance-paper-desk → Run workflow.
2. דף הבית נבנה מחדש אוטומטית כי `trading-app/**` השתנה (`deploy-trading-app.yml`). הלשונית: `https://aliexpressgood585.github.io/spacehub/house.html?tab=futures`
3. אין סודות להגדיר. הענף `pm-desk-data` כבר קיים.
