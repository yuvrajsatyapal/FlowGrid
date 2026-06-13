import { describe, it, expect, vi, beforeEach } from "vitest"
import React from "react"
import { renderHook, act } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { makeFakeSocket, type FakeSocket } from "../../../test/fakeSocket"

vi.mock("../../../lib/socket", () => ({ createBoardSocket: vi.fn() }))
vi.mock("../../../contexts/AuthContext", () => ({ useAuth: () => ({ accessToken: "tok" }) }))

import { createBoardSocket } from "../../../lib/socket"
import { useWorkspacePresenceSync } from "./useWorkspacePresenceSync"
import { workspaceKeys } from "../queries/keys"
import type { WorkspaceMember } from "../../../api/workspaces"

const wsId = "ws1"
const member = (userId: string, online: boolean): WorkspaceMember => ({
  id: `${userId}-m`,
  userId,
  name: null,
  email: `${userId}@x.com`,
  avatarUrl: null,
  role: "MEMBER",
  online,
  createdAt: "t",
})

function wrap(qc: QueryClient) {
  return ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

const onlineOf = (qc: QueryClient, userId: string) =>
  qc.getQueryData<WorkspaceMember[]>(workspaceKeys.members(wsId))!.find((m) => m.userId === userId)!.online

describe("useWorkspacePresenceSync (presence → cache)", () => {
  let socket: FakeSocket
  beforeEach(() => {
    vi.clearAllMocks()
    socket = makeFakeSocket()
    ;(createBoardSocket as ReturnType<typeof vi.fn>).mockReturnValue(socket)
  })

  it("flips a member's online flag in the cache on presence events", () => {
    const qc = new QueryClient()
    qc.setQueryData<WorkspaceMember[]>(workspaceKeys.members(wsId), [member("u1", false), member("u2", false)])
    renderHook(() => useWorkspacePresenceSync(wsId), { wrapper: wrap(qc) })

    act(() => socket.__trigger("workspace:member:online", { userId: "u1" }))
    expect(onlineOf(qc, "u1")).toBe(true)
    expect(onlineOf(qc, "u2")).toBe(false)

    act(() => socket.__trigger("workspace:member:offline", { userId: "u1" }))
    expect(onlineOf(qc, "u1")).toBe(false)
  })
})
