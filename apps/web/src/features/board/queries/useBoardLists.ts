import { useQuery } from "@tanstack/react-query"
import { listsApi } from "../../../api/lists"
import { boardKeys } from "./keys"

export function useBoardLists(boardId: string | undefined) {
  return useQuery({
    queryKey: boardKeys.lists(boardId ?? ""),
    queryFn: () => listsApi.list(boardId as string),
    enabled: !!boardId,
    staleTime: Infinity, // socket-driven; reconciled by the board realtime sync (Phase 3d)
  })
}
