import { useEffect, useRef, useState } from "react"
import type { Socket } from "socket.io-client"
import { useAuth } from "../contexts/AuthContext"
import { createBoardSocket } from "../lib/socket"
import type { CardSummary } from "../api/cards"
import type { ListSummary } from "../api/lists"
import type { CommentResponse, PresenceUser } from "@flowgrid/types"

interface BoardSocketHandlers {
  onCardCreated?: (card: CardSummary) => void
  onCardUpdated?: (card: CardSummary) => void
  onCardMoved?: (card: CardSummary) => void
  onCardDeleted?: (payload: { id: string }) => void
  onListCreated?: (list: ListSummary) => void
  onListUpdated?: (list: ListSummary) => void
  onListReordered?: (payload: { lists: ListSummary[] }) => void
  onListDeleted?: (payload: { id: string }) => void
}

export function useBoardSocket(
  boardId: string | undefined,
  handlers: BoardSocketHandlers,
): { onlineUsers: PresenceUser[]; socket: Socket | null } {
  const { accessToken } = useAuth()
  const socketRef = useRef<Socket | null>(null)
  const [onlineUsers, setOnlineUsers] = useState<PresenceUser[]>([])

  // Keep a stable ref to handlers so the effect doesn't re-run when callbacks change identity
  const handlersRef = useRef(handlers)
  handlersRef.current = handlers

  useEffect(() => {
    if (!boardId || !accessToken) return

    const socket = createBoardSocket(accessToken)
    socketRef.current = socket

    const handleConnect = () => {
      socket.emit("board:join", { boardId })
    }

    const handlePresence = ({ users }: { boardId: string; users: PresenceUser[] }) => {
      setOnlineUsers(users)
    }

    // Reconnect after network drop — re-join the board room
    socket.on("connect", handleConnect)
    socket.on("board:presence", handlePresence)

    socket.on("card:created", (card: CardSummary) => handlersRef.current.onCardCreated?.(card))
    socket.on("card:updated", (card: CardSummary) => handlersRef.current.onCardUpdated?.(card))
    socket.on("card:moved", (card: CardSummary) => handlersRef.current.onCardMoved?.(card))
    socket.on("card:deleted", (payload: { id: string }) => handlersRef.current.onCardDeleted?.(payload))
    socket.on("list:created", (list: ListSummary) => handlersRef.current.onListCreated?.(list))
    socket.on("list:updated", (list: ListSummary) => handlersRef.current.onListUpdated?.(list))
    socket.on("list:reordered", (payload: { lists: ListSummary[] }) => handlersRef.current.onListReordered?.(payload))
    socket.on("list:deleted", (payload: { id: string }) => handlersRef.current.onListDeleted?.(payload))

    return () => {
      socket.emit("board:leave", { boardId })
      socket.off()
      socket.disconnect()
      socketRef.current = null
      setOnlineUsers([])
    }
  }, [boardId, accessToken])

  return { onlineUsers, socket: socketRef.current }
}

// Re-export CommentResponse so CardDetailModal can use it without importing from @flowgrid/types directly
export type { CommentResponse }
