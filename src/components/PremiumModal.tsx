import { useState } from 'react'

interface Props {
  open: boolean
  onClose: () => void
  lang: 'he' | 'en'
}

const FEATURES = {
  free: [
    'מיקום ISS בזמן אמת',
    'גלובוס 3D + לוויינים',
    'תמונת יום NASA',
    'חדשות חלל',
    'מזג אוויר חלל בסיסי',
  ],
  premium: [
    'התראות push כשISS מעליך',
    'תחזית 7 ימים לכל עיר בעולם',
    'ללא פרסומות לגמרי',
    'תמונות NASA ב-4K',
    'ניוזלטר שבועי אישי',
    'מפת לוויינים חיה (500+)',
    'גרף עוצמת קרינה שמשית',
    'תמיכה ישירה',
  ],
}

export default function PremiumModal({ open, onClose, lang }: Props) {
  const [plan, setPlan] = useState<'monthly' | 'yearly'>('yearly')
  const he = lang === 'he'

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-2xl glass rounded-2xl border border-indigo-500/30 overflow-hidden shadow-2xl shadow-indigo-900/40"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-900/80 to-purple-900/80 p-6 text-center relative">
          <button onClick={onClose} className="absolute top-4 left-4 text-gray-500 hover:text-white text-xl">✕</button>
          <div className="text-4xl mb-2">⭐</div>
          <h3 className="text-2xl font-bold text-white">{he ? 'SpaceHub פרמיום' : 'SpaceHub Premium'}</h3>
          <p className="text-gray-400 text-sm mt-1">{he ? 'חוויית חלל מלאה ללא מגבלות' : 'Full space experience, no limits'}</p>
        </div>

        <div className="p-6">
          {/* Plan toggle */}
          <div className="flex justify-center mb-6">
            <div className="flex bg-space-900 rounded-xl p-1 border border-space-700">
              <button
                onClick={() => setPlan('monthly')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition ${plan === 'monthly' ? 'bg-indigo-600 text-white' : 'text-gray-400'}`}
              >
                {he ? 'חודשי' : 'Monthly'} — $4.99
              </button>
              <button
                onClick={() => setPlan('yearly')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition relative ${plan === 'yearly' ? 'bg-indigo-600 text-white' : 'text-gray-400'}`}
              >
                {he ? 'שנתי' : 'Yearly'} — $39.99
                <span className="absolute -top-2 -right-2 bg-green-500 text-white text-xs px-1.5 py-0.5 rounded-full">-33%</span>
              </button>
            </div>
          </div>

          {/* Features comparison */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="glass rounded-xl p-4 border border-space-700">
              <p className="text-gray-400 font-semibold text-sm mb-3">✓ {he ? 'חינם' : 'Free'}</p>
              <ul className="space-y-2">
                {FEATURES.free.map(f => (
                  <li key={f} className="text-gray-400 text-xs flex gap-2"><span className="text-green-500">✓</span>{f}</li>
                ))}
              </ul>
            </div>
            <div className="rounded-xl p-4 border border-yellow-500/40 bg-gradient-to-b from-yellow-900/10 to-orange-900/10">
              <p className="text-yellow-400 font-semibold text-sm mb-3">⭐ {he ? 'פרמיום' : 'Premium'}</p>
              <ul className="space-y-2">
                {FEATURES.premium.map(f => (
                  <li key={f} className="text-yellow-300 text-xs flex gap-2"><span className="text-yellow-500">★</span>{f}</li>
                ))}
              </ul>
            </div>
          </div>

          <div className="text-center">
            <p className="text-3xl font-bold text-white mb-1">
              {plan === 'monthly' ? '$4.99' : '$3.33'}<span className="text-gray-500 text-base font-normal">/{he ? 'חודש' : 'mo'}</span>
            </p>
            {plan === 'yearly' && <p className="text-green-400 text-xs mb-4">חיסכון של $20 לשנה!</p>}

            <button className="w-full py-3.5 bg-gradient-to-r from-yellow-600 to-orange-600 hover:from-yellow-500 hover:to-orange-500 rounded-xl text-white font-bold text-lg transition shadow-lg shadow-orange-900/30">
              {he ? '🚀 שדרג עכשיו' : '🚀 Upgrade Now'}
            </button>
            <p className="text-gray-600 text-xs mt-3">{he ? 'ביטול בכל עת • ללא התחייבות' : 'Cancel anytime • No commitment'}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
