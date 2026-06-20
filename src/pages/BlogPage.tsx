import { useState } from 'react'

const ARTICLES = [
  {
    slug: 'how-to-see-iss',
    title: 'איך לראות את תחנת החלל ISS בעין ערומה?',
    date: '15 יוני 2026',
    readTime: '4 דקות',
    icon: '🛸',
    preview: 'תחנת החלל הבינלאומית היא אחד הדברים היפים ביותר שניתן לראות בשמיים בלילה — אבל איך יודעים מתי ואיפה להסתכל?',
    content: `תחנת החלל הבינלאומית (ISS) מקיפה את כדור הארץ בגובה של כ-400 ק"מ, במהירות של 28,000 ק"מ לשעה. היא ממשיכה לסבוב 16 פעמים ביום!

**מתי לראות את ISS?**

ISS נראית לעין ערומה בשמיים כנקודת אור לבנה נעה — בדומה לכוכב, רק שהיא נעה מהר יותר. היא נראית בתנאים הבאים:
- **30-45 דקות לפני שקיעה** — השמש כבר שקעה אבל עדיין מאירה את תחנת החלל
- **30-45 דקות אחרי שקיעה** — באותו עיקרון
- **מזג אוויר בהיר** — ללא עננים

**כמה זמן נמשכת העברה?**

עברה טיפוסית נמשכת 3-6 דקות. ISS נעה ממערב למזרח.

**איך לדעת מתי?**

השתמש ב-SpaceHub! הזן את העיר שלך ותקבל התראה מדויקת.

**עובדות מדהימות על ISS:**
- גודלה כגודל מגרש כדורגל
- עלות הבנייה: $150 מיליארד דולר
- 15 מדינות שותפות בניהולה
- תמיד יש בה אסטרונאוטים מאז שנת 2000`
  },
  {
    slug: 'perseid-meteor-shower-2026',
    title: 'גשם המטאורים הפרסאי 2026 — כל מה שצריך לדעת',
    date: '20 יוני 2026',
    readTime: '3 דקות',
    icon: '☄️',
    preview: 'גשם המטאורים הפרסאי הוא אחד האירועים האסטרונומיים המרהיבים ביותר בשנה — עד 100 מטאורים בשעה!',
    content: `גשם המטאורים הפרסאי מגיע מדי שנה באוגוסט, כאשר כדור הארץ עובר דרך שובל הפסולת שהשאיר השביט 109P/Swift-Tuttle.

**מתי לצפות?**

**2026:** שיא הגשם צפוי בלילות 11-13 באוגוסט.
המקסימום: לילה של 12-13 באוגוסט, בין חצות לשחר.

**כמה מטאורים?**

בשנה רגילה: 50-100 מטאורים בשעה. בשנה מוצלחת (כמו 2026): עד 150!

**איך לצפות?**

1. לך למקום חשוך מחוץ לעיר
2. שכב על גב ותסתכל לכיוון צפון-מזרח
3. המתן 20 דקות עד שהעיניים יסתגלו לחושך
4. אל תשתמש בטלפון — הוא מקלקל את ראיית הלילה

**מיקומים מומלצים בישראל:**
- מדבר יהודה (ליד ים המלח)
- רמת הנגב
- הר מירון`
  },
  {
    slug: 'space-weather-explained',
    title: 'מה זה מזג אוויר חלל ולמה זה חשוב?',
    date: '10 יוני 2026',
    readTime: '5 דקות',
    icon: '⛈️',
    preview: 'סערות שמש יכולות להשפיע על לוויינים, GPS, ואפילו על רשת החשמל. הנה כל מה שצריך לדעת.',
    content: `מזג אוויר חלל הוא תופעות שמקורן בשמש שיכולות להשפיע על כדור הארץ ועל הטכנולוגיה שלנו.

**מה גורם למזג אוויר חלל?**

השמש פולטת כל הזמן חלקיקים ואנרגיה — "רוח שמש". לפעמים יש פליטות חזקות יותר הנקראות:
- **CME** (פליטת מסה קורונלית) — ענן של חלקיקים שיכול לפגוע בכדור הארץ
- **Solar Flare** — פליטת קרינה עוצמתית

**מה הן יכולות לעשות?**

- לגרום לזוהרים (Aurora) גם בקווי רוחב נמוכים
- לשבש תקשורת GPS ורדיו
- לגרום נזק ללוויינים
- במקרים קיצוניים — לפגוע ברשת החשמל

**סולם Kp**

עוצמת הסערה המגנטית נמדדת בסולם Kp מ-0 עד 9:
- Kp 0-2: שקט
- Kp 3-5: סערה קלה
- Kp 6-7: סערה בינונית — זוהרים בישראל אפשריים!
- Kp 8-9: סערה חזקה — תופעות קיצוניות`
  },
]

export default function BlogPage() {
  const [active, setActive] = useState<string | null>(null)
  const article = ARTICLES.find(a => a.slug === active)

  if (article) return (
    <div className="max-w-2xl mx-auto px-4 py-12">
      <button onClick={() => setActive(null)} className="text-indigo-400 text-sm mb-6 hover:text-indigo-300 flex items-center gap-1">
        → חזרה לבלוג
      </button>
      <div className="space-card p-8">
        <div className="flex items-center gap-3 mb-2">
          <span className="text-3xl">{article.icon}</span>
          <div>
            <p className="text-xs text-gray-600">{article.date} • {article.readTime} קריאה</p>
          </div>
        </div>
        <h1 className="text-2xl font-black text-white mb-6 leading-snug">{article.title}</h1>
        <div className="prose prose-invert max-w-none">
          {article.content.split('\n\n').map((para, i) => {
            if (para.startsWith('**') && para.endsWith('**')) {
              return <h3 key={i} className="text-indigo-300 font-bold text-base mt-6 mb-2">{para.replace(/\*\*/g, '')}</h3>
            }
            if (para.includes('**')) {
              return <p key={i} className="text-gray-300 text-sm leading-relaxed mb-3" dangerouslySetInnerHTML={{ __html: para.replace(/\*\*(.*?)\*\*/g, '<strong class="text-white">$1</strong>') }} />
            }
            if (para.startsWith('-')) {
              const items = para.split('\n').filter(l => l.startsWith('-'))
              return <ul key={i} className="space-y-1 mb-4">{items.map((item, j) => <li key={j} className="text-gray-400 text-sm flex gap-2"><span className="text-indigo-500">•</span>{item.slice(2)}</li>)}</ul>
            }
            return <p key={i} className="text-gray-300 text-sm leading-relaxed mb-3">{para}</p>
          })}
        </div>
      </div>
    </div>
  )

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <div className="text-center mb-10">
        <span className="section-label mb-4 inline-flex">📝 בלוג חלל</span>
        <h2 className="text-3xl font-black text-white mt-3">מאמרים על חלל ואסטרונומיה</h2>
        <p className="text-gray-500 text-sm mt-2">מדריכים, עובדות ואירועים — בעברית</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {ARTICLES.map(a => (
          <button key={a.slug} onClick={() => setActive(a.slug)} className="space-card p-5 text-right hover:border-indigo-500/40 transition">
            <div className="text-3xl mb-3">{a.icon}</div>
            <h3 className="text-white font-bold text-sm mb-2 leading-snug">{a.title}</h3>
            <p className="text-gray-500 text-xs mb-3 line-clamp-2">{a.preview}</p>
            <div className="flex items-center gap-2 text-xs text-gray-700">
              <span>{a.date}</span>
              <span>•</span>
              <span>{a.readTime}</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
