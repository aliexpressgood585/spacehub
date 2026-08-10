import { supabase } from './supabase'

// Cloud mirror for the observation log.
//
// localStorage stays the working copy so the log keeps working offline and for
// signed-out visitors. Signing in merges what's already on the device into the
// account (never discards it) and from then on every write goes to both.

export interface Observation {
  id: string
  date: string
  object: string
  telescope: string
  eyepiece: string
  magnification: number
  seeing: number
  transparency: number
  darkness: number
  notes: string
  createdAt: number
}

type Row = Observation & { user_id: string }

const toRow = (o: Observation, userId: string) => ({
  id: o.id,
  user_id: userId,
  date: o.date,
  object: o.object,
  telescope: o.telescope,
  eyepiece: o.eyepiece,
  magnification: o.magnification,
  seeing: o.seeing,
  transparency: o.transparency,
  darkness: o.darkness,
  notes: o.notes,
  created_at: o.createdAt,
})

const fromRow = (r: Row): Observation => ({
  id: r.id,
  date: r.date,
  object: r.object,
  telescope: r.telescope ?? '',
  eyepiece: r.eyepiece ?? '',
  magnification: r.magnification ?? 0,
  seeing: r.seeing ?? 3,
  transparency: r.transparency ?? 3,
  darkness: r.darkness ?? 3,
  notes: r.notes ?? '',
  createdAt: Number((r as unknown as { created_at: number }).created_at) || Date.now(),
})

export async function fetchRemote(userId: string): Promise<Observation[] | null> {
  if (!supabase) return null
  const { data, error } = await supabase
    .from('observations')
    .select('*')
    .eq('user_id', userId)
  if (error || !data) return null
  return (data as Row[]).map(fromRow)
}

export async function pushOne(o: Observation, userId: string): Promise<void> {
  if (!supabase) return
  await supabase.from('observations').upsert(toRow(o, userId), { onConflict: 'user_id,id' })
}

export async function deleteOne(id: string, userId: string): Promise<void> {
  if (!supabase) return
  await supabase.from('observations').delete().eq('user_id', userId).eq('id', id)
}

/**
 * Union of local and remote by id — the safe merge for a first sign-in, where
 * the device may hold months of entries the account has never seen.
 * Returns the merged list, or null if the cloud could not be reached.
 */
export async function mergeOnSignIn(
  local: Observation[],
  userId: string,
): Promise<Observation[] | null> {
  const remote = await fetchRemote(userId)
  if (remote === null) return null

  const byId = new Map<string, Observation>()
  for (const o of remote) byId.set(o.id, o)

  const toUpload: Observation[] = []
  for (const o of local) {
    if (!byId.has(o.id)) {
      byId.set(o.id, o)
      toUpload.push(o)
    }
  }

  if (toUpload.length && supabase) {
    await supabase
      .from('observations')
      .upsert(toUpload.map(o => toRow(o, userId)), { onConflict: 'user_id,id' })
  }

  return [...byId.values()].sort((a, b) => b.createdAt - a.createdAt)
}
