export const workspaceKeys = {
  all: ["workspace"] as const,
  list: () => ["workspace", "list"] as const,
  detail: (id: string) => ["workspace", id] as const,
  members: (id: string) => ["workspace", id, "members"] as const,
  invites: (id: string) => ["workspace", id, "invites"] as const,
  userSearch: (id: string, q: string) => ["workspace", id, "user-search", q] as const,
}
