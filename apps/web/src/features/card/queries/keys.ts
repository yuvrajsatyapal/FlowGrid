export const cardKeys = {
  detail: (cardId: string) => ["card", cardId] as const,
  comments: (cardId: string) => ["card", cardId, "comments"] as const,
  checklists: (cardId: string) => ["card", cardId, "checklists"] as const,
}
