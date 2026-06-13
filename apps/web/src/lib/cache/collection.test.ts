import { describe, it, expect } from "vitest"
import { upsertById, removeById, reorderByIds } from "./collection"

interface Item { id: string; updatedAt: string; name?: string }
const a = (id: string, t: string, name = ""): Item => ({ id, updatedAt: t, name })

describe("upsertById", () => {
  it("inserts when id is absent", () => {
    const r = upsertById([a("1", "2026-01-01")], a("2", "2026-01-02"))
    expect(r.map(i => i.id)).toEqual(["1", "2"])
  })
  it("replaces when id is present and incoming is newer", () => {
    const r = upsertById([a("1", "2026-01-01", "old")], a("1", "2026-01-02", "new"))
    expect(r).toHaveLength(1)
    expect(r[0].name).toBe("new")
  })
  it("ignores an incoming item older than the cached one (version guard)", () => {
    const r = upsertById([a("1", "2026-01-02", "new")], a("1", "2026-01-01", "stale"))
    expect(r[0].name).toBe("new")
  })
  it("replaces when updatedAt is missing (no guard possible)", () => {
    const r = upsertById([{ id: "1", name: "old" } as any], { id: "1", name: "new" } as any)
    expect((r[0] as any).name).toBe("new")
  })
  it("is idempotent: applying the same upsert twice yields one entry", () => {
    const once = upsertById([a("1", "2026-01-01")], a("1", "2026-01-01", "x"))
    const twice = upsertById(once, a("1", "2026-01-01", "x"))
    expect(twice).toHaveLength(1)
  })
})

describe("removeById", () => {
  it("removes the matching id", () => {
    expect(removeById([a("1", "t"), a("2", "t")], "1").map(i => i.id)).toEqual(["2"])
  })
  it("is a no-op when id is absent", () => {
    expect(removeById([a("1", "t")], "9").map(i => i.id)).toEqual(["1"])
  })
})

describe("reorderByIds", () => {
  it("reorders items to match the id order", () => {
    const r = reorderByIds([a("1", "t"), a("2", "t"), a("3", "t")], ["3", "1", "2"])
    expect(r.map(i => i.id)).toEqual(["3", "1", "2"])
  })
  it("keeps items missing from the order at the end, original order", () => {
    const r = reorderByIds([a("1", "t"), a("2", "t"), a("3", "t")], ["2"])
    expect(r.map(i => i.id)).toEqual(["2", "1", "3"])
  })
})
