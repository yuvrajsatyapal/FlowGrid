import { describe, it, expect } from "vitest"
import React from "react"
import { renderHook } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { useCommentRealtimeSync } from "./useCommentRealtimeSync"
import { cardKeys } from "../queries/keys"
import { makeFakeSocket } from "../../../test/fakeSocket"
import type { CommentPage } from "../../../api/comments"
import type { CommentResponse } from "@flowgrid/types"

const cardId = "card1"

const mk = (id: string, updatedAt: string, content = ""): CommentResponse => ({
  id,
  cardId,
  author: null,
  content,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt,
  deletedAt: null,
})

const page = (items: CommentResponse[], total: number): CommentPage => ({ items, total, offset: 0, limit: 50 })

function setup(initial: CommentPage) {
  const qc = new QueryClient()
  qc.setQueryData(cardKeys.comments(cardId), initial)
  const socket = makeFakeSocket()
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  )
  renderHook(() => useCommentRealtimeSync(cardId, socket as never), { wrapper })
  const read = () => qc.getQueryData<CommentPage>(cardKeys.comments(cardId))!
  return { read, socket }
}

describe("useCommentRealtimeSync (socket → cache integration)", () => {
  it("comment:created inserts and increments total", () => {
    const { read, socket } = setup(page([mk("1", "t1")], 1))
    socket.__trigger("comment:created", mk("2", "t2"))
    expect(read().items.map((c) => c.id)).toEqual(["1", "2"])
    expect(read().total).toBe(2)
  })

  it("self-echo of an already-present comment does not duplicate or double-count (dedup guard obsolete)", () => {
    const { read, socket } = setup(page([mk("1", "t1")], 1))
    socket.__trigger("comment:created", mk("1", "t1"))
    expect(read().items).toHaveLength(1)
    expect(read().total).toBe(1)
  })

  it("comment:updated with an older updatedAt is ignored (version guard)", () => {
    const { read, socket } = setup(page([mk("1", "2026-02-01T00:00:00Z", "new")], 1))
    socket.__trigger("comment:updated", mk("1", "2026-01-01T00:00:00Z", "stale"))
    expect(read().items[0].content).toBe("new")
  })

  it("comment:updated with a newer updatedAt replaces content", () => {
    const { read, socket } = setup(page([mk("1", "2026-01-01T00:00:00Z", "old")], 1))
    socket.__trigger("comment:updated", mk("1", "2026-02-01T00:00:00Z", "new"))
    expect(read().items[0].content).toBe("new")
    expect(read().total).toBe(1)
  })

  it("comment:deleted removes and decrements", () => {
    const { read, socket } = setup(page([mk("1", "t1"), mk("2", "t2")], 2))
    socket.__trigger("comment:deleted", { id: "1", cardId })
    expect(read().items.map((c) => c.id)).toEqual(["2"])
    expect(read().total).toBe(1)
  })

  it("ignores events targeting a different card", () => {
    const { read, socket } = setup(page([mk("1", "t1")], 1))
    socket.__trigger("comment:created", { ...mk("9", "t9"), cardId: "other-card" })
    expect(read().items).toHaveLength(1)
  })
})
