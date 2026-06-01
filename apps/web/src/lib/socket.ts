import { io, type Socket } from "socket.io-client"

export function createBoardSocket(token: string): Socket {
  return io({
    auth: { token },
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
  })
}
