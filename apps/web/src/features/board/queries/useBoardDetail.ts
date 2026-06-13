import { useQuery } from "@tanstack/react-query"
import { boardsApi } from "../../../api/boards"
import { boardKeys } from "./keys"

export function useBoardDetail(boardId: string | undefined) {
  return useQuery({
    queryKey: boardKeys.detail(boardId ?? ""),
    queryFn: () => boardsApi.getOne(boardId as string),
    enabled: !!boardId,
  })
}
