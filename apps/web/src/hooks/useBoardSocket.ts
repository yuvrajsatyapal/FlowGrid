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
  onCardReordered?: (payload: { listId: string; cardIds: string[] }) => void
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
  // useState so downstream consumers re-render when the socket becomes available
  const [socket, setSocket] = useState<Socket | null>(null)
  const [onlineUsers, setOnlineUsers] = useState<PresenceUser[]>([])

  // Stable ref to handlers — prevents re-running the effect when callback identities change
  const handlersRef = useRef(handlers)
  handlersRef.current = handlers

  useEffect(() => {
    if (!boardId || !accessToken) return

    const s = createBoardSocket(accessToken)
    setSocket(s)

    const handleConnect = () => {
      s.emit("board:join", { boardId })
    }

    const handlePresence = ({ users }: { boardId: string; users: PresenceUser[] }) => {
      setOnlineUsers(users)
    }

    // Reconnect after network drop — re-join the board room on every connect event
    s.on("connect", handleConnect)
    s.on("board:presence", handlePresence)

    s.on("card:created", (card: CardSummary) => handlersRef.current.onCardCreated?.(card))
    s.on("card:updated", (card: CardSummary) => handlersRef.current.onCardUpdated?.(card))
    s.on("card:moved", (card: CardSummary) => handlersRef.current.onCardMoved?.(card))
    s.on("card:deleted", (payload: { id: string }) => handlersRef.current.onCardDeleted?.(payload))
    s.on("card:reordered", (payload: { listId: string; cardIds: string[] }) => handlersRef.current.onCardReordered?.(payload))
    s.on("list:created", (list: ListSummary) => handlersRef.current.onListCreated?.(list))
    s.on("list:updated", (list: ListSummary) => handlersRef.current.onListUpdated?.(list))
    s.on("list:reordered", (payload: { lists: ListSummary[] }) => handlersRef.current.onListReordered?.(payload))
    s.on("list:deleted", (payload: { id: string }) => handlersRef.current.onListDeleted?.(payload))

    return () => {
      s.emit("board:leave", { boardId })
      s.off()
      s.disconnect()
      setSocket(null)
      setOnlineUsers([])
    }
  }, [boardId, accessToken])

  return { onlineUsers, socket }
}

// Re-export CommentResponse so CardDetailModal can use it without importing from @flowgrid/types directly
export type { CommentResponse }
