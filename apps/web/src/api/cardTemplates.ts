import { api } from "../lib/axiosInstance"
import type { Priority } from "@flowgrid/types"

export interface CardTemplate {
  id: string
  name: string
  description: string | null
  priority: Priority
  checklistsData: unknown
  createdAt: string
  createdBy: { id: string; name: string | null; avatarUrl: string | null }
}

export const cardTemplatesApi = {
  async list(workspaceId: string): Promise<CardTemplate[]> {
    const res = await api.get<{ templates: CardTemplate[] }>("/card-templates", { params: { workspaceId } })
    return res.data.templates
  },

  async create(data: {
    workspaceId: string
    name: string
    description?: string | null
    priority?: Priority
    checklistsData?: unknown
  }): Promise<CardTemplate> {
    const res = await api.post<{ template: CardTemplate }>("/card-templates", data)
    return res.data.template
  },

  async deleteTemplate(id: string): Promise<void> {
    await api.post("/card-templates/delete", {}, { params: { id } })
  },
}
