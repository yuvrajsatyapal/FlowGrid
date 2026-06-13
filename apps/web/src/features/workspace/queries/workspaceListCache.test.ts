import { describe, it, expect } from "vitest"
import { QueryClient } from "@tanstack/react-query"
import {
  addToList,
  patchInList,
  removeFromList,
  addWorkspaceToCache,
  updateWorkspaceInCache,
  removeWorkspaceFromCache,
} from "./workspaceListCache"
import { workspaceKeys } from "./keys"
import type { WorkspaceSummary } from "../../../api/workspaces"

const ws = (id: string, name = id): WorkspaceSummary =>
  ({ id, name, slug: id, organizationId: "o" }) as unknown as WorkspaceSummary

describe("workspace list pure transforms", () => {
  it("addToList appends (idempotent by id)", () => {
    expect(addToList([ws("a")], ws("b")).map((w) => w.id)).toEqual(["a", "b"])
    expect(addToList([ws("a")], ws("a")).map((w) => w.id)).toEqual(["a"])
  })
  it("patchInList patches the matching workspace only", () => {
    const r = patchInList([ws("a", "A"), ws("b", "B")], "a", { name: "AA" })
    expect(r.find((w) => w.id === "a")!.name).toBe("AA")
    expect(r.find((w) => w.id === "b")!.name).toBe("B")
  })
  it("removeFromList removes by id", () => {
    expect(removeFromList([ws("a"), ws("b")], "a").map((w) => w.id)).toEqual(["b"])
  })
})

describe("workspace list cache writers", () => {
  const seed = () => {
    const qc = new QueryClient()
    qc.setQueryData<WorkspaceSummary[]>(workspaceKeys.list(), [ws("a"), ws("b")])
    return qc
  }
  const read = (qc: QueryClient) => qc.getQueryData<WorkspaceSummary[]>(workspaceKeys.list())!

  it("add / update / remove write the list cache", () => {
    const qc = seed()
    addWorkspaceToCache(qc, ws("c"))
    expect(read(qc).map((w) => w.id)).toEqual(["a", "b", "c"])

    updateWorkspaceInCache(qc, "a", { name: "Renamed" })
    expect(read(qc).find((w) => w.id === "a")!.name).toBe("Renamed")

    removeWorkspaceFromCache(qc, "b")
    expect(read(qc).map((w) => w.id)).toEqual(["a", "c"])
  })

  it("writers are no-ops on an unset cache (no crash)", () => {
    const qc = new QueryClient()
    expect(() => updateWorkspaceInCache(qc, "x", { name: "n" })).not.toThrow()
    expect(() => removeWorkspaceFromCache(qc, "x")).not.toThrow()
    addWorkspaceToCache(qc, ws("a"))
    expect(read(qc).map((w) => w.id)).toEqual(["a"])
  })
})
