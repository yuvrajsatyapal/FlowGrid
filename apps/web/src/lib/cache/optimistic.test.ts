import { describe, it, expect, vi } from "vitest"
import { QueryClient } from "@tanstack/react-query"
import { optimisticListUpdate } from "./optimistic"

describe("optimisticListUpdate", () => {
  it("cancels queries, snapshots, and applies the patch in onMutate", async () => {
    const qc = new QueryClient()
    const key = ["things"]
    qc.setQueryData(key, [{ id: "1", updatedAt: "t" }])
    const cancel = vi.spyOn(qc, "cancelQueries").mockResolvedValue()
    const opts = optimisticListUpdate(qc, key, (prev: any[] | undefined) => [
      ...(prev ?? []),
      { id: "2", updatedAt: "t" },
    ])
    const ctx = await opts.onMutate!({} as never)
    expect(cancel).toHaveBeenCalledWith({ queryKey: key })
    expect((ctx as { snapshot: unknown[] }).snapshot).toEqual([{ id: "1", updatedAt: "t" }])
    expect(qc.getQueryData(key)).toHaveLength(2)
  })

  it("restores the snapshot in onError (rollback)", async () => {
    const qc = new QueryClient()
    const key = ["things"]
    qc.setQueryData(key, [{ id: "1", updatedAt: "t" }])
    const opts = optimisticListUpdate(qc, key, () => [])
    const ctx = await opts.onMutate!({} as never)
    qc.setQueryData(key, [])
    opts.onError!(new Error("x"), {} as never, ctx as never)
    expect(qc.getQueryData(key)).toEqual([{ id: "1", updatedAt: "t" }])
  })
})
