import { useState, useCallback } from 'react'

interface Eyepiece {
  id: number
  fl: number
  afov: number
}

let nextId = 4

export default function TelescopeAdvisor() {
  const [aperture, setAperture] = useState(150)
  const [focalLength, setFocalLength] = useState(750)
  const [eyepieces, setEyepieces] = useState<Eyepiece[]>([
    { id: 1, fl: 25, afov: 52 },
    { id: 2, fl: 10, afov: 52 },
    { id: 3, fl: 5, afov: 52 },
  ])
  const [barlow, setBarlow] = useState(1)

  // Derived optical values
  const focalRatio = focalLength / aperture
  const limitingMag = 2.1 + 5 * Math.log10(aperture)
  const dawesLimit = 116 / aperture
  const resolvingPower = 138 / aperture
  const minMag = Math.round(0.7 * aperture)
  const maxMag = Math.round(2 * aperture)
  const sweetSpot = Math.round(aperture)

  const calcMag = (ep: Eyepiece) => Math.round((focalLength / ep.fl) * barlow)
  const calcExitPupil = (ep: Eyepiece) => (ep.fl / focalRatio / barlow).toFixed(1)
  const calcTFOV = (ep: Eyepiece) => (ep.afov / calcMag(ep)).toFixed(2)

  const getRecommendations = () => {
    if (aperture < 80)
      return 'Moon, planets, Pleiades, Orion Nebula (M42), double stars'
    if (aperture < 150)
      return 'All above + M31 (Andromeda), M45, globular clusters (M13, M92)'
    if (aperture < 250)
      return 'All above + Virgo cluster, faint nebulae, galaxy detail'
    return 'Deep sky objects, galaxy structure, faint nebulae, quasars'
  }

  const addEyepiece = useCallback(() => {
    setEyepieces(prev => [...prev, { id: nextId++, fl: 20, afov: 52 }])
  }, [])

  const removeEyepiece = useCallback((id: number) => {
    setEyepieces(prev => prev.filter(e => e.id !== id))
  }, [])

  const updateEyepiece = useCallback((id: number, fl: number) => {
    setEyepieces(prev => prev.map(e => e.id === id ? { ...e, fl: Math.max(1, fl) } : e))
  }, [])

  const updateAfov = useCallback((id: number, afov: number) => {
    setEyepieces(prev => prev.map(e => e.id === id ? { ...e, afov: Math.max(20, Math.min(120, afov)) } : e))
  }, [])

  return (
    <div className="rounded-2xl border border-violet-500/20 bg-white/5 backdrop-blur-md p-5 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-violet-500/20 flex items-center justify-center text-xl shrink-0">
          🔭
        </div>
        <div>
          <h2 className="text-lg font-bold text-white">Telescope Advisor</h2>
          <p className="text-xs text-slate-400">Equipment calculator &amp; observation planner</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ── LEFT: Equipment Input ─────────────────────────── */}
        <div className="space-y-5">
          <h3 className="text-sm font-semibold text-violet-300 uppercase tracking-wider">Equipment</h3>

          {/* Aperture */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <label className="text-sm text-slate-300">Aperture</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={50}
                  max={500}
                  value={aperture}
                  onChange={e => setAperture(Math.min(500, Math.max(50, Number(e.target.value))))}
                  className="w-20 bg-white/10 border border-white/20 rounded-lg px-2 py-1 text-sm text-white text-right focus:outline-none focus:border-violet-500"
                />
                <span className="text-xs text-slate-400">mm</span>
              </div>
            </div>
            <input
              type="range"
              min={50}
              max={500}
              value={aperture}
              onChange={e => setAperture(Number(e.target.value))}
              className="w-full h-2 rounded-full appearance-none accent-violet-500 bg-white/10 cursor-pointer"
            />
            <div className="flex justify-between text-xs text-slate-500">
              <span>50mm</span><span>500mm</span>
            </div>
          </div>

          {/* Focal Length */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <label className="text-sm text-slate-300">Focal Length</label>
              <div className="flex items-center gap-2">
                <span className="text-sm font-mono text-violet-300">{focalLength}</span>
                <span className="text-xs text-slate-400">mm</span>
              </div>
            </div>
            <input
              type="range"
              min={400}
              max={3000}
              step={50}
              value={focalLength}
              onChange={e => setFocalLength(Number(e.target.value))}
              className="w-full h-2 rounded-full appearance-none accent-violet-500 bg-white/10 cursor-pointer"
            />
            <div className="flex justify-between text-xs text-slate-500">
              <span>400mm</span><span>3000mm</span>
            </div>
          </div>

          {/* Barlow */}
          <div className="space-y-2">
            <label className="text-sm text-slate-300">Barlow Multiplier</label>
            <div className="flex gap-2">
              {[1, 2, 3].map(b => (
                <button
                  key={b}
                  onClick={() => setBarlow(b)}
                  className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-all ${
                    barlow === b
                      ? 'bg-violet-600 text-white shadow-lg shadow-violet-500/30'
                      : 'bg-white/10 text-slate-300 hover:bg-white/15'
                  }`}
                >
                  {b}x
                </button>
              ))}
            </div>
          </div>

          {/* Eyepieces */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm text-slate-300">Eyepieces</label>
              <button
                onClick={addEyepiece}
                className="text-xs text-violet-400 hover:text-violet-300 border border-violet-500/30 hover:border-violet-400 rounded-lg px-3 py-1 transition-colors"
              >
                + Add
              </button>
            </div>
            <div className="space-y-2">
              {eyepieces.map(ep => (
                <div key={ep.id} className="flex items-center gap-2 bg-white/5 rounded-xl p-2.5 border border-white/10">
                  <div className="flex flex-col gap-1 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-500 w-16 shrink-0">EP FL</span>
                      <input
                        type="number"
                        min={1}
                        max={50}
                        value={ep.fl}
                        onChange={e => updateEyepiece(ep.id, Number(e.target.value))}
                        className="w-full bg-white/10 border border-white/20 rounded-lg px-2 py-1 text-sm text-white focus:outline-none focus:border-violet-500"
                      />
                      <span className="text-xs text-slate-500 shrink-0">mm</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-500 w-16 shrink-0">aFOV</span>
                      <input
                        type="number"
                        min={20}
                        max={120}
                        value={ep.afov}
                        onChange={e => updateAfov(ep.id, Number(e.target.value))}
                        className="w-full bg-white/10 border border-white/20 rounded-lg px-2 py-1 text-sm text-white focus:outline-none focus:border-violet-500"
                      />
                      <span className="text-xs text-slate-500 shrink-0">°</span>
                    </div>
                  </div>
                  <div className="text-right shrink-0 px-2">
                    <div className="text-sm font-bold text-violet-300">{calcMag(ep)}x</div>
                    <div className="text-xs text-slate-400">{calcTFOV(ep)}°</div>
                  </div>
                  {eyepieces.length > 1 && (
                    <button
                      onClick={() => removeEyepiece(ep.id)}
                      className="text-slate-600 hover:text-red-400 transition-colors text-lg leading-none ml-1"
                      aria-label="Remove eyepiece"
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── RIGHT: Calculated Values ──────────────────────── */}
        <div className="space-y-5">
          <h3 className="text-sm font-semibold text-violet-300 uppercase tracking-wider">Optical Properties</h3>

          {/* Stat boxes */}
          <div className="grid grid-cols-2 gap-3">
            <StatBox label="Focal Ratio" value={`f/${focalRatio.toFixed(1)}`} />
            <StatBox label="Limiting Mag" value={limitingMag.toFixed(1)} sub="magnitude" />
            <StatBox label="Dawes Limit" value={`${dawesLimit.toFixed(2)}"`} sub="arcsec" />
            <StatBox label="Resolving Power" value={`${resolvingPower.toFixed(2)}"`} sub="arcsec" />
          </div>

          {/* Magnification guide */}
          <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-4 space-y-3">
            <h4 className="text-xs font-semibold text-indigo-300 uppercase tracking-wider">Magnification Guide</h4>
            <div className="space-y-2">
              <MagRow label="Min useful (wide-field)" value={`${minMag}x`} color="text-sky-400" />
              <MagRow label="Sweet spot" value={`${sweetSpot}x`} color="text-violet-300" />
              <MagRow label="Max useful (seeing-limited)" value={`${maxMag}x`} color="text-amber-400" />
            </div>
            {/* Visual bar */}
            <div className="relative h-3 rounded-full bg-white/10 overflow-hidden">
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-sky-500 via-violet-500 to-amber-500"
                style={{ width: '100%' }}
              />
              <div
                className="absolute inset-y-0 w-0.5 bg-white shadow shadow-white/50"
                style={{ left: `${((sweetSpot - minMag) / (maxMag - minMag)) * 100}%` }}
              />
            </div>
          </div>

          {/* Eyepiece table */}
          <div className="rounded-xl border border-white/10 bg-white/5 overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="text-left px-3 py-2 text-slate-400 font-medium">EP</th>
                  <th className="text-right px-3 py-2 text-slate-400 font-medium">Mag</th>
                  <th className="text-right px-3 py-2 text-slate-400 font-medium">Exit Pupil</th>
                  <th className="text-right px-3 py-2 text-slate-400 font-medium">tFOV</th>
                </tr>
              </thead>
              <tbody>
                {eyepieces.map((ep, i) => {
                  const mag = calcMag(ep)
                  const overMax = mag > maxMag
                  const underMin = mag < minMag
                  return (
                    <tr key={ep.id} className={`border-b border-white/5 last:border-0 ${i % 2 === 0 ? 'bg-white/3' : ''}`}>
                      <td className="px-3 py-2 text-slate-300">{ep.fl}mm</td>
                      <td className={`px-3 py-2 text-right font-mono font-semibold ${overMax ? 'text-amber-400' : underMin ? 'text-sky-400' : 'text-violet-300'}`}>
                        {mag}x
                      </td>
                      <td className="px-3 py-2 text-right text-slate-300 font-mono">{calcExitPupil(ep)}mm</td>
                      <td className="px-3 py-2 text-right text-slate-300 font-mono">{calcTFOV(ep)}°</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Object recommendations */}
          <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-4 space-y-2">
            <h4 className="text-xs font-semibold text-violet-300 uppercase tracking-wider flex items-center gap-2">
              <span>Recommended Objects</span>
              <span className="text-[10px] bg-violet-500/20 text-violet-300 px-2 py-0.5 rounded-full normal-case">
                {aperture}mm aperture
              </span>
            </h4>
            <p className="text-sm text-slate-300 leading-relaxed">{getRecommendations()}</p>
          </div>
        </div>
      </div>

      {/* Footer note */}
      <p className="text-xs text-slate-500 border-t border-white/5 pt-4">
        Calculations assume standard atmosphere and average seeing conditions. Exit pupil &gt; 7mm may vignette with the human eye. Barlow multiplier applied to all eyepieces.
      </p>
    </div>
  )
}

function StatBox({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl bg-white/5 border border-white/10 p-3 text-center">
      <div className="text-xs text-slate-400 mb-1">{label}</div>
      <div className="text-xl font-bold text-white font-mono">{value}</div>
      {sub && <div className="text-xs text-slate-500 mt-0.5">{sub}</div>}
    </div>
  )
}

function MagRow({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-slate-400">{label}</span>
      <span className={`text-sm font-bold font-mono ${color}`}>{value}</span>
    </div>
  )
}
