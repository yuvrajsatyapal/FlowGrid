import { describe, it, expect, vi, beforeEach } from "vitest"
import React from "react"
import { renderHook, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

vi.mock("../../../contexts/AuthContext", () => ({ useAuth: () => ({ accessToken: "tok" }) }))
vi.mock("../../../api/workspaces", () => ({ workspacesApi: { list: vi.fn() } }))

import { workspacesApi } from "../../../api/workspaces"
import { useWorkspaceList } from "./useWorkspaceList"
import { workspaceKeys } from "./keys"
import type { WorkspaceSummary } from "../../../api/workspaces"

const ws = (id: string): WorkspaceSummary => ({ id, name: id, slug: id, organizationId: "o" }) as unknown as WorkspaceSummary

function wrap(qc: QueryClient) {
  return ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

beforeEach(() => vi.clearAllMocks())

describe("useWorkspaceList", () => {
  it("loads the workspace list into the canonical cache key", async () => {
    ;(workspacesApi.list as ReturnType<typeof vi.fn>).mockResolvedValue([ws("a"), ws("b")])
    const qc = new QueryClient()
    const { result } = renderHook(() => useWorkspaceList(), { wrapper: wrap(qc) })

    await waitFor(() => expect(result.current.data).toHaveLength(2))
    expect(result.current.data!.map((w) => w.id)).toEqual(["a", "b"])
    // single source of truth: data lives under workspaceKeys.list()
    expect(qc.getQueryData<WorkspaceSummary[]>(workspaceKeys.list())!.map((w) => w.id)).toEqual(["a", "b"])
  })
})
