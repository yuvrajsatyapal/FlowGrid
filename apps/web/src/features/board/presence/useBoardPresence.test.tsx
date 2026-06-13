import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, act, waitFor } from "@testing-library/react"
import { makeFakeSocket, type FakeSocket } from "../../../test/fakeSocket"

vi.mock("../../../lib/socket", () => ({ createBoardSocket: vi.fn() }))
vi.mock("../../../contexts/AuthContext", () => ({ useAuth: () => ({ accessToken: "tok" }) }))
vi.mock("../../../api/workspaces", () => ({ workspacesApi: { listMembers: vi.fn() } }))

import { createBoardSocket } from "../../../lib/socket"
import { workspacesApi } from "../../../api/workspaces"
import { useBoardPresence } from "./useBoardPresence"

const member = (userId: string, online: boolean) => ({
  id: `${userId}-m`,
  userId,
  name: null,
  email: `${userId}@x.com`,
  avatarUrl: null,
  role: "MEMBER",
  online,
  createdAt: "t",
})

describe("useBoardPresence", () => {
  let socket: FakeSocket
  beforeEach(() => {
    vi.clearAllMocks()
    socket = makeFakeSocket()
    ;(createBoardSocket as ReturnType<typeof vi.fn>).mockReturnValue(socket)
    ;(workspacesApi.listMembers as ReturnType<typeof vi.fn>).mockResolvedValue([member("u1", true), member("u2", false)])
  })

  it("loads the roster and seeds online ids from .online", async () => {
    const { result } = renderHook(() => useBoardPresence("ws1"))
    await waitFor(() => expect(result.current.allWsMembers).toHaveLength(2))
    expect([...result.current.onlineMemberIds]).toEqual(["u1"])
  })

  it("flips online ids on socket presence events", async () => {
    const { result } = renderHook(() => useBoardPresence("ws1"))
    await waitFor(() => expect(result.current.allWsMembers).toHaveLength(2))

    act(() => socket.__trigger("workspace:member:online", { userId: "u2" }))
    expect(result.current.onlineMemberIds.has("u2")).toBe(true)

    act(() => socket.__trigger("workspace:member:offline", { userId: "u1" }))
    expect(result.current.onlineMemberIds.has("u1")).toBe(false)
  })
})
