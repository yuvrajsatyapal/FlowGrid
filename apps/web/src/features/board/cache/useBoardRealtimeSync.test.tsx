import { describe, it, expect, vi, beforeEach } from "vitest"
import React from "react"
import { renderHook } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { makeFakeSocket } from "../../../test/fakeSocket"

vi.mock("../../../lib/socket", () => ({ createBoardSocket: vi.fn() }))
vi.mock("../../../contexts/AuthContext", () => ({ useAuth: () => ({ accessToken: "tok" }) }))

import { createBoardSocket } from "../../../lib/socket"
import { useBoardRealtimeSync } from "./useBoardRealtimeSync"
import { boardKeys } from "../queries/keys"
import type { CardsByList } from "./cardCache"
import type { CardSummary } from "../../../api/cards"
import type { ListSummary } from "../../../api/lists"

const boardId = "b1"
const card = (id: string, listId: string, updatedAt = "t"): CardSummary =>
  ({ id, listId, updatedAt, labels: [] }) as unknown as CardSummary
const list = (id: string, updatedAt = "t"): ListSummary =>
  ({ id, boardId, name: id, position: "1", updatedAt }) as unknown as ListSummary

function setup(cards: CardsByList, lists: ListSummary[] = []) {
  const qc = new QueryClient()
  qc.setQueryData<CardsByList>(boardKeys.cards(boardId), cards)
  qc.setQueryData<ListSummary[]>(boardKeys.lists(boardId), lists)
  const socket = makeFakeSocket()
  ;(createBoardSocket as ReturnType<typeof vi.fn>).mockReturnValue(socket)
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  )
  renderHook(() => useBoardRealtimeSync(boardId), { wrapper })
  return {
    socket,
    cardIds: (listId: string) => qc.getQueryData<CardsByList>(boardKeys.cards(boardId))![listId].map((c) => c.id),
    cardsAt: (listId: string) => qc.getQueryData<CardsByList>(boardKeys.cards(boardId))![listId],
    listIds: () => qc.getQueryData<ListSummary[]>(boardKeys.lists(boardId))!.map((l) => l.id),
    listName: (id: string) => qc.getQueryData<ListSummary[]>(boardKeys.lists(boardId))!.find((l) => l.id === id)?.name,
    cardsRecord: () => qc.getQueryData<CardsByList>(boardKeys.cards(boardId))!,
  }
}

beforeEach(() => vi.clearAllMocks())

describe("card:created", () => {
  it("inserts", () => {
    const t = setup({ l1: [card("a", "l1")] })
    t.socket.__trigger("card:created", card("b", "l1"))
    expect(t.cardIds("l1")).toEqual(["a", "b"])
  })
  it("duplicate insert does not duplicate", () => {
    const t = setup({ l1: [card("a", "l1")] })
    t.socket.__trigger("card:created", card("a", "l1"))
    t.socket.__trigger("card:created", card("a", "l1"))
    expect(t.cardIds("l1")).toEqual(["a"])
  })
})

describe("card:updated (version guard)", () => {
  it("newer update applied", () => {
    const t = setup({ l1: [card("a", "l1", "2026-01-01")] })
    t.socket.__trigger("card:updated", { ...card("a", "l1", "2026-02-01"), title: "new" })
    expect((t.cardsAt("l1")[0] as { title?: string }).title).toBe("new")
  })
  it("stale update ignored", () => {
    const t = setup({ l1: [{ ...card("a", "l1", "2026-02-01"), title: "new" } as unknown as CardSummary] })
    t.socket.__trigger("card:updated", { ...card("a", "l1", "2026-01-01"), title: "stale" })
    expect((t.cardsAt("l1")[0] as { title?: string }).title).toBe("new")
  })
})

describe("card:moved", () => {
  it("moves into destination list", () => {
    const t = setup({ l1: [card("a", "l1", "t1")], l2: [] })
    t.socket.__trigger("card:moved", card("a", "l2", "t2"))
    expect(t.cardIds("l1")).toEqual([])
    expect(t.cardIds("l2")).toEqual(["a"])
  })
  it("duplicate move event converges", () => {
    const t = setup({ l1: [card("a", "l1", "t1")], l2: [] })
    t.socket.__trigger("card:moved", card("a", "l2", "t2"))
    t.socket.__trigger("card:moved", card("a", "l2", "t2"))
    expect(t.cardIds("l1")).toEqual([])
    expect(t.cardIds("l2")).toEqual(["a"])
  })
  it("move when optimistic state already matches is a no-op", () => {
    const t = setup({ l1: [], l2: [card("a", "l2", "t2")] })
    t.socket.__trigger("card:moved", card("a", "l2", "t2"))
    expect(t.cardIds("l2")).toEqual(["a"])
  })
  it("stale move echo does not move the card back", () => {
    const t = setup({ l1: [], l2: [card("a", "l2", "2026-02-01")] })
    t.socket.__trigger("card:moved", card("a", "l1", "2026-01-01"))
    expect(t.cardIds("l2")).toEqual(["a"])
    expect(t.cardIds("l1")).toEqual([])
  })
})

describe("card:deleted", () => {
  it("removes", () => {
    const t = setup({ l1: [card("a", "l1"), card("b", "l1")] })
    t.socket.__trigger("card:deleted", { id: "a" })
    expect(t.cardIds("l1")).toEqual(["b"])
  })
  it("duplicate delete is a no-op", () => {
    const t = setup({ l1: [card("a", "l1"), card("b", "l1")] })
    t.socket.__trigger("card:deleted", { id: "a" })
    t.socket.__trigger("card:deleted", { id: "a" })
    expect(t.cardIds("l1")).toEqual(["b"])
  })
})

describe("card:reordered", () => {
  it("applies the new order", () => {
    const t = setup({ l1: [card("a", "l1"), card("b", "l1"), card("c", "l1")] })
    t.socket.__trigger("card:reordered", { listId: "l1", cardIds: ["c", "a", "b"] })
    expect(t.cardIds("l1")).toEqual(["c", "a", "b"])
  })
  it("duplicate reorder is idempotent", () => {
    const t = setup({ l1: [card("a", "l1"), card("b", "l1"), card("c", "l1")] })
    t.socket.__trigger("card:reordered", { listId: "l1", cardIds: ["c", "a", "b"] })
    t.socket.__trigger("card:reordered", { listId: "l1", cardIds: ["c", "a", "b"] })
    expect(t.cardIds("l1")).toEqual(["c", "a", "b"])
  })
})

describe("list events", () => {
  it("list:created inserts the list + empty cards entry", () => {
    const t = setup({}, [list("l1")])
    t.socket.__trigger("list:created", list("l2"))
    expect(t.listIds()).toEqual(["l1", "l2"])
    expect(t.cardsRecord().l2).toEqual([])
  })
  it("list:created duplicate does not duplicate", () => {
    const t = setup({ l1: [] }, [list("l1")])
    t.socket.__trigger("list:created", list("l1"))
    expect(t.listIds()).toEqual(["l1"])
  })
  it("list:updated patches the list", () => {
    const t = setup({}, [{ ...list("l1", "2026-01-01"), name: "Old" } as ListSummary])
    t.socket.__trigger("list:updated", { ...list("l1", "2026-02-01"), name: "New" })
    expect(t.listName("l1")).toBe("New")
  })
  it("list:updated stale is ignored (version guard)", () => {
    const t = setup({}, [{ ...list("l1", "2026-02-01"), name: "New" } as ListSummary])
    t.socket.__trigger("list:updated", { ...list("l1", "2026-01-01"), name: "Stale" })
    expect(t.listName("l1")).toBe("New")
  })
  it("list:reordered replaces with the ordered snapshot", () => {
    const t = setup({}, [list("l1"), list("l2"), list("l3")])
    t.socket.__trigger("list:reordered", { lists: [list("l3"), list("l1"), list("l2")] })
    expect(t.listIds()).toEqual(["l3", "l1", "l2"])
  })
  it("list:deleted removes the list and its cards entry", () => {
    const t = setup({ l1: [card("a", "l1")], l2: [] }, [list("l1"), list("l2")])
    t.socket.__trigger("list:deleted", { id: "l1" })
    expect(t.listIds()).toEqual(["l2"])
    expect(t.cardsRecord().l1).toBeUndefined()
  })
})

describe("cross-list convergence (optimistic move + echo)", () => {
  it("optimistic move already applied, then socket echo → converges (no duplicate)", () => {
    // optimistic move already put card a in l2 (with old updatedAt)
    const t = setup({ l1: [], l2: [card("a", "l2", "2026-01-01")] })
    // server echo carries newer updatedAt
    t.socket.__trigger("card:moved", card("a", "l2", "2026-02-01"))
    expect(t.cardIds("l1")).toEqual([])
    expect(t.cardIds("l2")).toEqual(["a"])
  })
  it("optimistic move + duplicate echo → still single card in dest", () => {
    const t = setup({ l1: [], l2: [card("a", "l2", "2026-01-01")] })
    t.socket.__trigger("card:moved", card("a", "l2", "2026-02-01"))
    t.socket.__trigger("card:moved", card("a", "l2", "2026-02-01"))
    expect(t.cardIds("l2")).toEqual(["a"])
  })
  it("optimistic move + stale echo → stale echo ignored, card stays in dest", () => {
    const t = setup({ l1: [], l2: [card("a", "l2", "2026-02-01")] })
    t.socket.__trigger("card:moved", card("a", "l1", "2026-01-01"))
    expect(t.cardIds("l2")).toEqual(["a"])
    expect(t.cardIds("l1")).toEqual([])
  })
})
