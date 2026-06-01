import { io, type Socket } from "socket.io-client"

// VITE_SOCKET_URL — override when API is on a different origin (e.g. production)
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL as string | undefined

export function createBoardSocket(token: string): Socket {
  return io(SOCKET_URL ?? "", {
    auth: { token },
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
  })
}
