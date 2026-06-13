import { describe, it, expect, vi, beforeEach } from "vitest"
import React from "react"
import { renderHook, act } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

vi.mock("../../../api/lists", () => ({ listsApi: { create: vi.fn() } }))

import { listsApi, type ListSummary } from "../../../api/lists"
import type { CardSummary } from "../../../api/cards"
import { useCreateList } from "./useCreateList"
import { boardKeys } from "../queries/keys"

const boardId = "b1"
const list = (id: string, name: string): ListSummary =>
  ({ id, boardId, name, position: "1", updatedAt: "t" }) as unknown as ListSummary

function wrap(qc: QueryClient) {
  return ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}
const lists = (qc: QueryClient) => qc.getQueryData<ListSummary[]>(boardKeys.lists(boardId))!
const cards = (qc: QueryClient) => qc.getQueryData<Record<string, CardSummary[]>>(boardKeys.cards(boardId))!

function seed() {
  const qc = new QueryClient()
  qc.setQueryData<ListSummary[]>(boardKeys.lists(boardId), [list("l1", "To Do")])
  qc.setQueryData<Record<string, CardSummary[]>>(boardKeys.cards(boardId), { l1: [] })
  return qc
}

describe("useCreateList (pessimistic)", () => {
  beforeEach(() => vi.clearAllMocks())

  it("success: inserts the list and seeds an empty cards entry", async () => {
    const qc = seed()
    ;(listsApi.create as ReturnType<typeof vi.fn>).mockResolvedValue(list("l2", "Doing"))
    const { result } = renderHook(() => useCreateList(boardId), { wrapper: wrap(qc) })

    await act(async () => { await result.current.mutateAsync({ name: "Doing" }) })

    expect(lists(qc).map((l) => l.id)).toEqual(["l1", "l2"])
    expect(cards(qc).l2).toEqual([])
  })

  it("idempotent: a list already present (socket echo) is not duplicated", async () => {
    const qc = seed()
    ;(listsApi.create as ReturnType<typeof vi.fn>).mockResolvedValue(list("l1", "To Do"))
    const { result } = renderHook(() => useCreateList(boardId), { wrapper: wrap(qc) })

    await act(async () => { await result.current.mutateAsync({ name: "To Do" }) })

    expect(lists(qc).map((l) => l.id)).toEqual(["l1"])
  })

  it("failure: cache is unchanged", async () => {
    const qc = seed()
    ;(listsApi.create as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("nope"))
    const { result } = renderHook(() => useCreateList(boardId), { wrapper: wrap(qc) })

    await act(async () => { await result.current.mutateAsync({ name: "Doing" }).catch(() => {}) })

    expect(lists(qc).map((l) => l.id)).toEqual(["l1"])
    expect(Object.keys(cards(qc))).toEqual(["l1"])
  })
})
