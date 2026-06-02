import { api } from "../lib/axiosInstance"

export interface ChecklistItem {
  id: string
  checklistId: string
  text: string
  checked: boolean
  position: string
  createdAt: string
  updatedAt: string
}

export interface Checklist {
  id: string
  cardId: string
  title: string
  position: string
  items: ChecklistItem[]
  createdAt: string
  updatedAt: string
}

export const checklistsApi = {
  async list(cardId: string): Promise<Checklist[]> {
    const res = await api.get<{ checklists: Checklist[] }>("/checklists", { params: { cardId } })
    return res.data.checklists
  },

  async create(cardId: string, title: string): Promise<Checklist> {
    const res = await api.post<{ checklist: Checklist }>("/checklists", { cardId, title })
    return res.data.checklist
  },

  async rename(id: string, title: string): Promise<Checklist> {
    const res = await api.post<{ checklist: Checklist }>("/checklists/update", { title }, { params: { id } })
    return res.data.checklist
  },

  async deleteChecklist(id: string): Promise<void> {
    await api.post("/checklists/delete", {}, { params: { id } })
  },

  async addItem(checklistId: string, text: string): Promise<ChecklistItem> {
    const res = await api.post<{ item: ChecklistItem }>("/checklists/items", { checklistId, text })
    return res.data.item
  },

  async updateItem(id: string, data: { text?: string; checked?: boolean }): Promise<ChecklistItem> {
    const res = await api.post<{ item: ChecklistItem }>("/checklists/items/update", data, { params: { id } })
    return res.data.item
  },

  async deleteItem(id: string): Promise<void> {
    await api.post("/checklists/items/delete", {}, { params: { id } })
  },
}
