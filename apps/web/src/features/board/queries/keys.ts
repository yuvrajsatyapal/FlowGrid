export const boardKeys = {
  all: ["board"] as const,
  detail: (boardId: string) => ["board", boardId] as const,
  lists: (boardId: string) => ["board", boardId, "lists"] as const,
  cards: (boardId: string) => ["board", boardId, "cards"] as const,
  members: (boardId: string) => ["board", boardId, "members"] as const,
  depGraph: (boardId: string) => ["board", boardId, "dependency-graph"] as const,
}
