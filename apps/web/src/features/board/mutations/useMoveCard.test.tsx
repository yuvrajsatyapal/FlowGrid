import { describe, it, expect, vi, beforeEach } from "vitest"
import React from "react"
import { renderHook, act, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

vi.mock("../../../api/cards", () => ({ cardsApi: { move: vi.fn() } }))

import { cardsApi, type CardSummary } from "../../../api/cards"
import { useMoveCard } from "./useMoveCard"
import { boardKeys } from "../queries/keys"

const boardId = "b1"
const SRC = "src"
const DST = "dst"
const card = (id: string, listId: string): CardSummary => ({ id, listId, updatedAt: "t" }) as unknown as CardSummary
type CardsByList = Record<string, CardSummary[]>

function wrap(qc: QueryClient) {
  return ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

function seed() {
  const qc = new QueryClient()
  qc.setQueryData<CardsByList>(boardKeys.cards(boardId), {
    [SRC]: [card("a", SRC), card("b", SRC)],
    [DST]: [card("x", DST)],
  })
  return qc
}
const ids = (qc: QueryClient, listId: string) =>
  qc.getQueryData<CardsByList>(boardKeys.cards(boardId))![listId].map((c) => c.id)

// Move card "b" from SRC to DST, inserted before "x"
const moveVars = {
  cardId: "b",
  sourceListId: SRC,
  destListId: DST,
  newSourceCards: [card("a", SRC)],
  newDestCards: [{ ...card("b", DST) }, card("x", DST)],
}

describe("useMoveCard (cross-list, optimistic + rollback, no invalidate)", () => {
  beforeEach(() => vi.clearAllMocks())

  it("1. cross-list move success: card leaves source, enters dest in order", async () => {
    const qc = seed()
    ;(cardsApi.move as ReturnType<typeof vi.fn>).mockResolvedValue(undefined)
    const { result } = renderHook(() => useMoveCard(boardId), { wrapper: wrap(qc) })

    await act(async () => {
      await result.current.mutateAsync(moveVars)
    })

    expect(ids(qc, SRC)).toEqual(["a"])
    expect(ids(qc, DST)).toEqual(["b", "x"])
  })

  it("2+4+5. rollback on server failure restores BOTH source and dest lists", async () => {
    const qc = seed()
    let reject!: (e: unknown) => void
    ;(cardsApi.move as ReturnType<typeof vi.fn>).mockReturnValue(new Promise((_r, rej) => { reject = rej }))
    const { result } = renderHook(() => useMoveCard(boardId), { wrapper: wrap(qc) })

    act(() => result.current.mutate(moveVars))
    // optimistic applied
    await waitFor(() => expect(ids(qc, DST)).toEqual(["b", "x"]))
    expect(ids(qc, SRC)).toEqual(["a"])

    act(() => reject(new Error("server error")))
    // both lists restored to the pre-move snapshot
    await waitFor(() => expect(ids(qc, SRC)).toEqual(["a", "b"]))
    expect(ids(qc, DST)).toEqual(["x"])
  })

  it("3. server cap rejection rolls back to the original layout", async () => {
    const qc = seed()
    ;(cardsApi.move as ReturnType<typeof vi.fn>).mockRejectedValue({
      response: { status: 400, data: { error: { message: "A list can hold at most N cards." } } },
    })
    const { result } = renderHook(() => useMoveCard(boardId), { wrapper: wrap(qc) })

    await act(async () => {
      await result.current.mutateAsync(moveVars).catch(() => {})
    })

    expect(ids(qc, SRC)).toEqual(["a", "b"])
    expect(ids(qc, DST)).toEqual(["x"])
  })
})
