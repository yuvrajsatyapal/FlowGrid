import { describe, it, expect, vi, beforeEach } from "vitest"
import React from "react"
import { renderHook, act } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

vi.mock("../../../api/lists", () => ({ listsApi: { update: vi.fn() } }))

import { listsApi, type ListSummary } from "../../../api/lists"
import { useRenameList } from "./useRenameList"
import { boardKeys } from "../queries/keys"

const boardId = "b1"
const list = (id: string, name: string): ListSummary =>
  ({ id, boardId, name, position: "1", updatedAt: "t" }) as unknown as ListSummary

function wrap(qc: QueryClient) {
  return ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}
const nameOf = (qc: QueryClient, id: string) =>
  qc.getQueryData<ListSummary[]>(boardKeys.lists(boardId))!.find((l) => l.id === id)!.name

describe("useRenameList (pessimistic)", () => {
  beforeEach(() => vi.clearAllMocks())

  it("success: patches the list name", async () => {
    const qc = new QueryClient()
    qc.setQueryData<ListSummary[]>(boardKeys.lists(boardId), [list("l1", "Old")])
    ;(listsApi.update as ReturnType<typeof vi.fn>).mockResolvedValue(list("l1", "New"))
    const { result } = renderHook(() => useRenameList(boardId), { wrapper: wrap(qc) })

    await act(async () => { await result.current.mutateAsync({ id: "l1", name: "New" }) })

    expect(nameOf(qc, "l1")).toBe("New")
  })

  it("failure: name is unchanged in cache", async () => {
    const qc = new QueryClient()
    qc.setQueryData<ListSummary[]>(boardKeys.lists(boardId), [list("l1", "Old")])
    ;(listsApi.update as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("nope"))
    const { result } = renderHook(() => useRenameList(boardId), { wrapper: wrap(qc) })

    await act(async () => { await result.current.mutateAsync({ id: "l1", name: "New" }).catch(() => {}) })

    expect(nameOf(qc, "l1")).toBe("Old")
  })
})
