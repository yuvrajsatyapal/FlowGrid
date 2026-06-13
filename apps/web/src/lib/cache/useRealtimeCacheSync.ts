import { useEffect, useRef } from "react"
import type { Socket } from "socket.io-client"

type Handlers = Record<string, (payload: any) => void>

/** Subscribes the given handlers to socket events for the lifetime of the
 *  component, translating each event into a cache write (the handler body).
 *  Handlers are held in a ref so identity churn never re-subscribes — the
 *  effect only re-runs when the socket instance itself changes. */
export function useRealtimeCacheSync(socket: Socket | null, handlers: Handlers): void {
  const handlersRef = useRef(handlers)
  handlersRef.current = handlers

  useEffect(() => {
    if (!socket) return
    const events = Object.keys(handlersRef.current)
    const listeners = events.map((event) => {
      const listener = (payload: unknown) => handlersRef.current[event]?.(payload)
      socket.on(event, listener)
      return [event, listener] as const
    })
    return () => {
      for (const [event, listener] of listeners) socket.off(event, listener)
    }
  }, [socket])
}
