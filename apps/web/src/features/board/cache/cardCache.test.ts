import { describe, it, expect } from "vitest"
import {
  upsertCardInBoard,
  moveCardInBoard,
  removeCardFromBoard,
  applyLabelUpdateToBoard,
  applyLabelDeleteFromBoard,
  type CardsByList,
} from "./cardCache"
import type { CardSummary } from "../../../api/cards"

const card = (id: string, listId: string, updatedAt = "t", labels: { id: string; name: string; color: string }[] = []): CardSummary =>
  ({ id, listId, updatedAt, labels }) as unknown as CardSummary

describe("upsertCardInBoard", () => {
  it("inserts a new card into its list", () => {
    const r = upsertCardInBoard({ l1: [card("a", "l1")] }, card("b", "l1"))
    expect(r.l1.map((c) => c.id)).toEqual(["a", "b"])
  })
  it("updates an existing card (idempotent, no duplicate)", () => {
    const r = upsertCardInBoard({ l1: [card("a", "l1", "2026-01-01")] }, card("a", "l1", "2026-02-01"))
    expect(r.l1).toHaveLength(1)
    expect(r.l1[0].updatedAt).toBe("2026-02-01")
  })
})

describe("moveCardInBoard (cross-list, version-guarded)", () => {
  it("moves the card from its source list to the destination list", () => {
    const r = moveCardInBoard({ l1: [card("a", "l1", "t1")], l2: [] }, card("a", "l2", "t2"))
    expect(r.l1.map((c) => c.id)).toEqual([])
    expect(r.l2.map((c) => c.id)).toEqual(["a"])
  })
  it("is idempotent: a duplicate move event converges to the same state", () => {
    const once = moveCardInBoard({ l1: [card("a", "l1", "t1")], l2: [] }, card("a", "l2", "t2"))
    const twice = moveCardInBoard(once, card("a", "l2", "t2"))
    expect(twice.l1).toEqual([])
    expect(twice.l2.map((c) => c.id)).toEqual(["a"])
  })
  it("no-op when the optimistic state already matches (card already in dest)", () => {
    const r = moveCardInBoard({ l1: [], l2: [card("a", "l2", "t2")] }, card("a", "l2", "t2"))
    expect(r.l2.map((c) => c.id)).toEqual(["a"])
    expect(r.l1).toEqual([])
  })
  it("ignores a stale move (older updatedAt) — does not move the card back", () => {
    // card already moved to l2 at t2; a stale echo says it's in l1 at t1
    const r = moveCardInBoard({ l1: [], l2: [card("a", "l2", "2026-02-01")] }, card("a", "l1", "2026-01-01"))
    expect(r.l2.map((c) => c.id)).toEqual(["a"])
    expect(r.l1).toEqual([])
  })
})

describe("removeCardFromBoard", () => {
  it("removes the card from whichever list holds it", () => {
    const r = removeCardFromBoard({ l1: [card("a", "l1")], l2: [card("b", "l2")] }, "a")
    expect(r.l1.map((c) => c.id)).toEqual([])
    expect(r.l2.map((c) => c.id)).toEqual(["b"])
  })
})

describe("applyLabelUpdateToBoard (across multiple lists)", () => {
  it("patches the label name/color on every card in every list", () => {
    const record: CardsByList = {
      l1: [card("a", "l1", "t", [{ id: "L1", name: "old", color: "red" }])],
      l2: [
        card("b", "l2", "t", [{ id: "L1", name: "old", color: "red" }]),
        card("c", "l2", "t", [{ id: "L2", name: "keep", color: "blue" }]),
      ],
    }
    const r = applyLabelUpdateToBoard(record, { id: "L1", name: "NEW", color: "green" })
    expect(r.l1[0].labels[0]).toEqual({ id: "L1", name: "NEW", color: "green" })
    expect(r.l2[0].labels[0]).toEqual({ id: "L1", name: "NEW", color: "green" })
    expect(r.l2[1].labels[0]).toEqual({ id: "L2", name: "keep", color: "blue" }) // untouched
  })
})

describe("applyLabelDeleteFromBoard (across multiple lists)", () => {
  it("strips the label from every card in every list", () => {
    const record: CardsByList = {
      l1: [card("a", "l1", "t", [{ id: "L1", name: "x", color: "red" }, { id: "L2", name: "y", color: "blue" }])],
      l2: [card("b", "l2", "t", [{ id: "L1", name: "x", color: "red" }])],
    }
    const r = applyLabelDeleteFromBoard(record, "L1")
    expect(r.l1[0].labels.map((l) => l.id)).toEqual(["L2"])
    expect(r.l2[0].labels).toEqual([])
  })
})
