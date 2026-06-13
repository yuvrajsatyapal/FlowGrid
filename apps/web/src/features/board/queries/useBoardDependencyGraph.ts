import { useQuery } from "@tanstack/react-query"
import { cardDependenciesApi } from "../../../api/cardDependencies"
import { boardKeys } from "./keys"

export function useBoardDependencyGraph(boardId: string | undefined) {
  return useQuery({
    queryKey: boardKeys.depGraph(boardId ?? ""),
    queryFn: () => cardDependenciesApi.boardGraph(boardId as string),
    enabled: !!boardId,
  })
}
