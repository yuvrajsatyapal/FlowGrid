import { describe, it, expect } from "vitest"
import { boardKeys } from "./keys"

describe("boardKeys", () => {
  it("nests lists/cards/members under the board detail prefix", () => {
    expect(boardKeys.detail("b1")).toEqual(["board", "b1"])
    expect(boardKeys.lists("b1")).toEqual(["board", "b1", "lists"])
    expect(boardKeys.cards("b1")).toEqual(["board", "b1", "cards"])
    expect(boardKeys.members("b1")).toEqual(["board", "b1", "members"])
  })
  it("detail is a prefix of its sub-keys (so invalidating detail invalidates all)", () => {
    const detail = boardKeys.detail("b1")
    const lists = boardKeys.lists("b1")
    expect(lists.slice(0, detail.length)).toEqual(detail)
  })
})
