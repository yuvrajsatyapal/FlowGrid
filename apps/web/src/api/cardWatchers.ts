import { api } from "../lib/axiosInstance"

export interface Watcher {
  id: string
  name: string | null
  avatarUrl: string | null
}

export const cardWatchersApi = {
  async get(cardId: string): Promise<{ watchers: Watcher[]; isWatching: boolean }> {
    const res = await api.get<{ watchers: Watcher[]; isWatching: boolean }>("/card-watchers", { params: { cardId } })
    return res.data
  },

  async watch(cardId: string): Promise<void> {
    await api.post("/card-watchers/watch", { cardId })
  },

  async unwatch(cardId: string): Promise<void> {
    await api.post("/card-watchers/unwatch", { cardId })
  },
}
