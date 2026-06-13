export interface Identifiable {
  id: string
  updatedAt?: string | Date
}

const time = (v: string | Date | undefined): number =>
  v == null ? NaN : typeof v === "string" ? Date.parse(v) : v.getTime()

/** Insert or replace by id. If both have updatedAt, ignore an incoming item
 *  strictly older than the cached one (out-of-order / stale event guard). */
export function upsertById<T extends Identifiable>(list: T[], incoming: T): T[] {
  const idx = list.findIndex((i) => i.id === incoming.id)
  if (idx === -1) return [...list, incoming]
  const prev = list[idx]
  const tPrev = time(prev.updatedAt)
  const tNew = time(incoming.updatedAt)
  if (!Number.isNaN(tPrev) && !Number.isNaN(tNew) && tNew < tPrev) return list
  const next = list.slice()
  next[idx] = incoming
  return next
}

export function removeById<T extends Identifiable>(list: T[], id: string): T[] {
  return list.filter((i) => i.id !== id)
}

/** Reorder to match `orderedIds`; ids not present in the order are appended
 *  in their original relative order. */
export function reorderByIds<T extends Identifiable>(list: T[], orderedIds: string[]): T[] {
  const byId = new Map(list.map((i) => [i.id, i]))
  const ordered: T[] = []
  for (const id of orderedIds) {
    const item = byId.get(id)
    if (item) {
      ordered.push(item)
      byId.delete(id)
    }
  }
  for (const item of list) if (byId.has(item.id)) ordered.push(item)
  return ordered
}
