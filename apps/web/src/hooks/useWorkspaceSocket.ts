import { useEffect, useRef } from "react"
import { useAuth } from "../contexts/AuthContext"
import { createBoardSocket } from "../lib/socket"
import type { BoardSummary } from "../api/boards"

interface WorkspaceSocketHandlers {
  onBoardUpdated?: (data: { id: string; name: string; visibility: string; coverColor: string | null; updatedAt: string }) => void
  onBoardCreated?: (data: { board: BoardSummary }) => void
  onBoardDeleted?: (data: { id: string }) => void
  onMemberOnline?: (data: { userId: string }) => void
  onMemberOffline?: (data: { userId: string }) => void
}

export function useWorkspaceSocket(workspaceId: string | undefined, handlers: WorkspaceSocketHandlers): void {
  const { accessToken } = useAuth()
  const handlersRef = useRef(handlers)
  handlersRef.current = handlers

  useEffect(() => {
    if (!workspaceId || !accessToken) return

    const s = createBoardSocket(accessToken)

    s.on("connect", () => {
      s.emit("workspace:join", { workspaceId })
    })

    s.on("workspace:board:updated", (data) => handlersRef.current.onBoardUpdated?.(data))
    s.on("workspace:board:created", (data) => handlersRef.current.onBoardCreated?.(data))
    s.on("workspace:board:deleted", (data) => handlersRef.current.onBoardDeleted?.(data))
    s.on("workspace:member:online", (data) => handlersRef.current.onMemberOnline?.(data))
    s.on("workspace:member:offline", (data) => handlersRef.current.onMemberOffline?.(data))

    return () => {
      s.emit("workspace:leave", { workspaceId })
      s.off()
      s.disconnect()
    }
  }, [workspaceId, accessToken])
}
