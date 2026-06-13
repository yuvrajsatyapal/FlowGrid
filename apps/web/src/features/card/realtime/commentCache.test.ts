import { describe, it, expect } from "vitest"
import { applyCommentUpsert, applyCommentRemove } from "./commentCache"
import type { CommentPage } from "../../../api/comments"
import type { CommentResponse } from "@flowgrid/types"

const comment = (id: string, updatedAt: string, content = ""): CommentResponse => ({
  id,
  cardId: "card1",
  author: null,
  content,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt,
  deletedAt: null,
})

const page = (items: CommentResponse[], total: number): CommentPage => ({
  items,
  total,
  offset: 0,
  limit: 50,
})

describe("applyCommentUpsert", () => {
  it("inserts a new comment and increments total", () => {
    const result = applyCommentUpsert(page([comment("1", "t1")], 1), comment("2", "t2"))
    expect(result.items.map((c) => c.id)).toEqual(["1", "2"])
    expect(result.total).toBe(2)
  })
  it("is idempotent: re-applying the same comment does not double-count total", () => {
    const start = page([comment("1", "t1")], 1)
    const result = applyCommentUpsert(start, comment("1", "t1"))
    expect(result.items).toHaveLength(1)
    expect(result.total).toBe(1)
  })
  it("updates an existing comment without changing total", () => {
    const result = applyCommentUpsert(page([comment("1", "2026-01-01T00:00:00Z", "old")], 1), comment("1", "2026-01-02T00:00:00Z", "new"))
    expect(result.items[0].content).toBe("new")
    expect(result.total).toBe(1)
  })
  it("ignores a stale update (older updatedAt) via the version guard", () => {
    const result = applyCommentUpsert(page([comment("1", "2026-01-02T00:00:00Z", "new")], 1), comment("1", "2026-01-01T00:00:00Z", "stale"))
    expect(result.items[0].content).toBe("new")
    expect(result.total).toBe(1)
  })
})

describe("applyCommentRemove", () => {
  it("removes a present comment and decrements total", () => {
    const result = applyCommentRemove(page([comment("1", "t1"), comment("2", "t2")], 2), "1")
    expect(result.items.map((c) => c.id)).toEqual(["2"])
    expect(result.total).toBe(1)
  })
  it("is a no-op when the comment is absent", () => {
    const start = page([comment("1", "t1")], 1)
    const result = applyCommentRemove(start, "9")
    expect(result).toBe(start)
  })
  it("never drives total below zero", () => {
    const result = applyCommentRemove(page([comment("1", "t1")], 0), "1")
    expect(result.total).toBe(0)
  })
})
