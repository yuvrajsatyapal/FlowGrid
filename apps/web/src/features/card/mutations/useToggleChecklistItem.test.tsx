import { describe, it, expect, vi, beforeEach } from "vitest"
import React from "react"
import { renderHook, act, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

vi.mock("../../../api/checklists", () => ({
  checklistsApi: { updateItem: vi.fn() },
}))

import { checklistsApi, type Checklist, type ChecklistItem } from "../../../api/checklists"
import { useToggleChecklistItem } from "./useToggleChecklistItem"
import { cardKeys } from "../queries/keys"

const cardId = "card1"
const baseItem: ChecklistItem = {
  id: "i1",
  checklistId: "cl1",
  text: "task",
  checked: false,
  position: "1",
  createdAt: "t",
  updatedAt: "t",
}
const checklist = (checked: boolean): Checklist => ({
  id: "cl1",
  cardId,
  title: "C",
  position: "1",
  items: [{ ...baseItem, checked }],
  createdAt: "t",
  updatedAt: "t",
})

function wrap(qc: QueryClient) {
  return ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

const checked = (qc: QueryClient) =>
  qc.getQueryData<Checklist[]>(cardKeys.checklists(cardId))![0].items[0].checked

describe("useToggleChecklistItem (optimistic + rollback)", () => {
  beforeEach(() => vi.clearAllMocks())

  it("optimistically flips immediately, then rolls back when the server rejects", async () => {
    const qc = new QueryClient()
    qc.setQueryData<Checklist[]>(cardKeys.checklists(cardId), [checklist(false)])
    let reject!: (e: unknown) => void
    ;(checklistsApi.updateItem as ReturnType<typeof vi.fn>).mockReturnValue(
      new Promise((_resolve, r) => {
        reject = r
      }),
    )

    const { result } = renderHook(() => useToggleChecklistItem(cardId), { wrapper: wrap(qc) })

    act(() => {
      result.current.mutate({ item: { ...baseItem, checked: false } })
    })

    // Optimistic write applied before the server responds
    await waitFor(() => expect(checked(qc)).toBe(true))

    // Server rejects → snapshot restored
    act(() => reject(new Error("server said no")))
    await waitFor(() => expect(checked(qc)).toBe(false))
  })

  it("keeps the optimistic value when the server succeeds", async () => {
    const qc = new QueryClient()
    qc.setQueryData<Checklist[]>(cardKeys.checklists(cardId), [checklist(false)])
    ;(checklistsApi.updateItem as ReturnType<typeof vi.fn>).mockResolvedValue({ ...baseItem, checked: true })

    const { result } = renderHook(() => useToggleChecklistItem(cardId), { wrapper: wrap(qc) })
    await act(async () => {
      await result.current.mutateAsync({ item: { ...baseItem, checked: false } })
    })

    expect(checked(qc)).toBe(true)
  })
})
