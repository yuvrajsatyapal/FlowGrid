import { describe, it, expect, vi, beforeEach } from "vitest"
import React from "react"
import { renderHook, act } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

vi.mock("../../../api/lists", () => ({ listsApi: { deleteList: vi.fn() } }))

import { listsApi, type ListSummary } from "../../../api/lists"
import type { CardSummary } from "../../../api/cards"
import { useDeleteList } from "./useDeleteList"
import { boardKeys } from "../queries/keys"

const boardId = "b1"
const list = (id: string): ListSummary => ({ id, boardId, name: id, position: "1", updatedAt: "t" }) as unknown as ListSummary
const card = (id: string, listId: string): CardSummary => ({ id, listId, updatedAt: "t" }) as unknown as CardSummary

function wrap(qc: QueryClient) {
  return ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}
const lists = (qc: QueryClient) => qc.getQueryData<ListSummary[]>(boardKeys.lists(boardId))!
const cards = (qc: QueryClient) => qc.getQueryData<Record<string, CardSummary[]>>(boardKeys.cards(boardId))!

function seed() {
  const qc = new QueryClient()
  qc.setQueryData<ListSummary[]>(boardKeys.lists(boardId), [list("l1"), list("l2")])
  qc.setQueryData<Record<string, CardSummary[]>>(boardKeys.cards(boardId), {
    l1: [card("c1", "l1")],
    l2: [card("c2", "l2")],
  })
  return qc
}

describe("useDeleteList (pessimistic, two-cache cleanup)", () => {
  beforeEach(() => vi.clearAllMocks())

  it("success: removes the list AND drops its cards entry", async () => {
    const qc = seed()
    ;(listsApi.deleteList as ReturnType<typeof vi.fn>).mockResolvedValue(undefined)
    const { result } = renderHook(() => useDeleteList(boardId), { wrapper: wrap(qc) })

    await act(async () => { await result.current.mutateAsync({ id: "l1" }) })

    expect(lists(qc).map((l) => l.id)).toEqual(["l2"])
    expect(cards(qc).l1).toBeUndefined()
    expect(cards(qc).l2).toHaveLength(1) // other lists untouched
  })

  it("failure: both caches unchanged", async () => {
    const qc = seed()
    ;(listsApi.deleteList as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("nope"))
    const { result } = renderHook(() => useDeleteList(boardId), { wrapper: wrap(qc) })

    await act(async () => { await result.current.mutateAsync({ id: "l1" }).catch(() => {}) })

    expect(lists(qc).map((l) => l.id)).toEqual(["l1", "l2"])
    expect(cards(qc).l1).toHaveLength(1)
  })
})
