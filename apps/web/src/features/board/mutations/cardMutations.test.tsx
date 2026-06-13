import { describe, it, expect, vi, beforeEach } from "vitest"
import React from "react"
import { renderHook, act } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

vi.mock("../../../api/cards", () => ({
  cardsApi: { create: vi.fn(), update: vi.fn(), deleteCard: vi.fn() },
}))

import { cardsApi, type CardSummary } from "../../../api/cards"
import { useCreateCard } from "./useCreateCard"
import { useUpdateCard } from "./useUpdateCard"
import { useDeleteCard } from "./useDeleteCard"
import { boardKeys } from "../queries/keys"
import type { CardsByList } from "../cache/cardCache"

const boardId = "b1"
const card = (id: string, listId: string, updatedAt = "t"): CardSummary =>
  ({ id, listId, updatedAt, labels: [] }) as unknown as CardSummary

function wrap(qc: QueryClient) {
  return ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}
const seed = (record: CardsByList) => {
  const qc = new QueryClient()
  qc.setQueryData<CardsByList>(boardKeys.cards(boardId), record)
  return qc
}
const ids = (qc: QueryClient, listId: string) =>
  qc.getQueryData<CardsByList>(boardKeys.cards(boardId))![listId].map((c) => c.id)

describe("useCreateCard (pessimistic, idempotent)", () => {
  beforeEach(() => vi.clearAllMocks())
  it("success: inserts the card into its list", async () => {
    const qc = seed({ l1: [card("a", "l1")] })
    ;(cardsApi.create as ReturnType<typeof vi.fn>).mockResolvedValue(card("b", "l1"))
    const { result } = renderHook(() => useCreateCard(boardId), { wrapper: wrap(qc) })
    await act(async () => { await result.current.mutateAsync({ listId: "l1", title: "B" }) })
    expect(ids(qc, "l1")).toEqual(["a", "b"])
  })
  it("idempotent: a card already present (socket echo) is not duplicated", async () => {
    const qc = seed({ l1: [card("a", "l1")] })
    ;(cardsApi.create as ReturnType<typeof vi.fn>).mockResolvedValue(card("a", "l1"))
    const { result } = renderHook(() => useCreateCard(boardId), { wrapper: wrap(qc) })
    await act(async () => { await result.current.mutateAsync({ listId: "l1", title: "A" }) })
    expect(ids(qc, "l1")).toEqual(["a"])
  })
  it("failure: cache unchanged", async () => {
    const qc = seed({ l1: [card("a", "l1")] })
    ;(cardsApi.create as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("nope"))
    const { result } = renderHook(() => useCreateCard(boardId), { wrapper: wrap(qc) })
    await act(async () => { await result.current.mutateAsync({ listId: "l1", title: "B" }).catch(() => {}) })
    expect(ids(qc, "l1")).toEqual(["a"])
  })
})

describe("useUpdateCard (pessimistic)", () => {
  beforeEach(() => vi.clearAllMocks())
  it("success: upserts the updated card", async () => {
    const qc = seed({ l1: [card("a", "l1", "2026-01-01")] })
    ;(cardsApi.update as ReturnType<typeof vi.fn>).mockResolvedValue(card("a", "l1", "2026-02-01"))
    const { result } = renderHook(() => useUpdateCard(boardId), { wrapper: wrap(qc) })
    await act(async () => { await result.current.mutateAsync({ cardId: "a", fields: {} }) })
    expect(qc.getQueryData<CardsByList>(boardKeys.cards(boardId))!.l1[0].updatedAt).toBe("2026-02-01")
  })
  it("failure: cache unchanged", async () => {
    const qc = seed({ l1: [card("a", "l1", "2026-01-01")] })
    ;(cardsApi.update as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("nope"))
    const { result } = renderHook(() => useUpdateCard(boardId), { wrapper: wrap(qc) })
    await act(async () => { await result.current.mutateAsync({ cardId: "a", fields: {} }).catch(() => {}) })
    expect(qc.getQueryData<CardsByList>(boardKeys.cards(boardId))!.l1[0].updatedAt).toBe("2026-01-01")
  })
})

describe("useDeleteCard (pessimistic)", () => {
  beforeEach(() => vi.clearAllMocks())
  it("success: removes the card from its list", async () => {
    const qc = seed({ l1: [card("a", "l1"), card("b", "l1")] })
    ;(cardsApi.deleteCard as ReturnType<typeof vi.fn>).mockResolvedValue(undefined)
    const { result } = renderHook(() => useDeleteCard(boardId), { wrapper: wrap(qc) })
    await act(async () => { await result.current.mutateAsync({ cardId: "a" }) })
    expect(ids(qc, "l1")).toEqual(["b"])
  })
  it("failure: cache unchanged", async () => {
    const qc = seed({ l1: [card("a", "l1"), card("b", "l1")] })
    ;(cardsApi.deleteCard as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("nope"))
    const { result } = renderHook(() => useDeleteCard(boardId), { wrapper: wrap(qc) })
    await act(async () => { await result.current.mutateAsync({ cardId: "a" }).catch(() => {}) })
    expect(ids(qc, "l1")).toEqual(["a", "b"])
  })
})
