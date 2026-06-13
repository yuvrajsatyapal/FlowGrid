type Handler = (payload: any) => void

/** Minimal in-memory stand-in for a socket.io client used in hook tests.
 *  Code under test calls on/off/emit/disconnect; the TEST drives inbound
 *  events via __trigger (kept separate from emit, which is app→server). */
export interface FakeSocket {
  on(event: string, fn: Handler): void
  off(event?: string, fn?: Handler): void
  emit(event: string, payload?: unknown): void
  disconnect(): void
  __trigger(event: string, payload?: unknown): void
}

export function makeFakeSocket(): FakeSocket {
  const handlers: Record<string, Handler[]> = {}
  return {
    on(event, fn) {
      ;(handlers[event] ||= []).push(fn)
    },
    off(event, fn) {
      if (!event) {
        for (const k of Object.keys(handlers)) delete handlers[k]
        return
      }
      if (!fn) {
        delete handlers[event]
        return
      }
      handlers[event] = (handlers[event] || []).filter((h) => h !== fn)
    },
    emit() {
      /* outbound app→server — no-op in tests */
    },
    disconnect() {
      /* no-op */
    },
    __trigger(event, payload) {
      ;(handlers[event] || []).forEach((h) => h(payload))
    },
  }
}
