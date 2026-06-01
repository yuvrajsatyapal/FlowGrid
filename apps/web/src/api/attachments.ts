import { api } from "../lib/axiosInstance"
import type { AttachmentResponse } from "@flowgrid/types"

export const attachmentsApi = {
  async list(cardId: string): Promise<AttachmentResponse[]> {
    const res = await api.get<AttachmentResponse[]>("/attachments", { params: { cardId } })
    return res.data
  },

  async upload(
    cardId: string,
    file: File,
    onProgress?: (pct: number) => void,
  ): Promise<AttachmentResponse> {
    const form = new FormData()
    form.append("file", file)
    form.append("cardId", cardId)
    const res = await api.post<AttachmentResponse>("/attachments", form, {
      headers: { "Content-Type": "multipart/form-data" },
      onUploadProgress: onProgress
        ? (e) => {
            const pct = e.total ? Math.round((e.loaded / e.total) * 100) : 0
            onProgress(pct)
          }
        : undefined,
    })
    return res.data
  },

  async remove(id: string): Promise<void> {
    await api.post("/attachments/delete", {}, { params: { id } })
  },
}
