import { describe, it, expect, vi, beforeEach } from "vitest"
import React from "react"
import { renderHook, act, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

vi.mock("../../../api/cards", () => ({ cardsApi: { reorder: vi.fn() } }))

import { cardsApi, type CardSummary } from "../../../api/cards"
import { useReorderCards } from "./useReorderCards"
import { boardKeys } from "../queries/keys"

const boardId = "b1"
const listId = "l1"
const card = (id: string): CardSummary => ({ id, listId, updatedAt: "t" }) as unknown as CardSummary
type CardsByList = Record<string, CardSummary[]>

function wrap(qc: QueryClient) {
  return ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}
const order = (qc: QueryClient) =>
  qc.getQueryData<CardsByList>(boardKeys.cards(boardId))![listId].map((c) => c.id)

describe("useReorderCards (optimistic + rollback, no invalidate)", () => {
  beforeEach(() => vi.clearAllMocks())

  it("optimistically reorders, then rolls back when the server rejects", async () => {
    const qc = new QueryClient()
    qc.setQueryData<CardsByList>(boardKeys.cards(boardId), { [listId]: [card("1"), card("2"), card("3")] })
    let reject!: (e: unknown) => void
    ;(cardsApi.reorder as ReturnType<typeof vi.fn>).mockReturnValue(new Promise((_r, rej) => { reject = rej }))

    const { result } = renderHook(() => useReorderCards(boardId), { wrapper: wrap(qc) })

    act(() => result.current.mutate({ listId, orderedIds: ["3", "1", "2"] }))
    await waitFor(() => expect(order(qc)).toEqual(["3", "1", "2"]))

    act(() => reject(new Error("server rejected")))
    await waitFor(() => expect(order(qc)).toEqual(["1", "2", "3"]))
  })

  it("keeps the optimistic order on success", async () => {
    const qc = new QueryClient()
    qc.setQueryData<CardsByList>(boardKeys.cards(boardId), { [listId]: [card("1"), card("2"), card("3")] })
    ;(cardsApi.reorder as ReturnType<typeof vi.fn>).mockResolvedValue(undefined)

    const { result } = renderHook(() => useReorderCards(boardId), { wrapper: wrap(qc) })
    await act(async () => { await result.current.mutateAsync({ listId, orderedIds: ["2", "3", "1"] }) })

    expect(order(qc)).toEqual(["2", "3", "1"])
  })
})
