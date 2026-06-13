import { useCallback, useEffect, useState } from "react"
import { useWorkspaceSocket } from "../../../hooks/useWorkspaceSocket"
import { workspacesApi } from "../../../api/workspaces"

export interface WsMemberLite {
  userId: string
  name: string | null
  email: string
  avatarUrl: string | null
}

/** Owns the board header's presence concern: the workspace member roster (for
 *  the add-candidates list) and the live online-id set (green dots). Seeds from
 *  workspacesApi.listMembers().online and keeps it live via the workspace
 *  socket. `reload` re-fetches the roster (used when the access panel opens).
 *  Socket lifecycle is unchanged — this just relocates the logic out of BoardPage. */
export function useBoardPresence(workspaceId: string | undefined) {
  const [allWsMembers, setAllWsMembers] = useState<WsMemberLite[]>([])
  const [onlineMemberIds, setOnlineMemberIds] = useState<Set<string>>(new Set())

  const reload = useCallback(async () => {
    if (!workspaceId) return
    try {
      const wsMembers = await workspacesApi.listMembers(workspaceId)
      setAllWsMembers(wsMembers.map((m) => ({ userId: m.userId, name: m.name, email: m.email, avatarUrl: m.avatarUrl })))
      setOnlineMemberIds(new Set(wsMembers.filter((m) => m.online).map((m) => m.userId)))
    } catch {
      /* non-critical — keep last known roster */
    }
  }, [workspaceId])

  useEffect(() => {
    void reload()
  }, [reload])

  useWorkspaceSocket(workspaceId, {
    onMemberOnline: ({ userId: id }) =>
      setOnlineMemberIds((prev) => {
        if (prev.has(id)) return prev
        const next = new Set(prev)
        next.add(id)
        return next
      }),
    onMemberOffline: ({ userId: id }) =>
      setOnlineMemberIds((prev) => {
        if (!prev.has(id)) return prev
        const next = new Set(prev)
        next.delete(id)
        return next
      }),
  })

  return { allWsMembers, onlineMemberIds, reload }
}
