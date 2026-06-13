import { useQuery } from "@tanstack/react-query"
import { boardsApi } from "../../../api/boards"
import { boardKeys } from "./keys"

export function useBoardMembers(boardId: string | undefined) {
  return useQuery({
    queryKey: boardKeys.members(boardId ?? ""),
    queryFn: () => boardsApi.listMembers(boardId as string),
    enabled: !!boardId,
  })
}
