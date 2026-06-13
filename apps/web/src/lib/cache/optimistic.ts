import type { QueryClient, QueryKey } from "@tanstack/react-query"

export interface OptimisticContext<T> {
  snapshot: T
}

/** Builds the onMutate/onError/onSettled trio for an optimistic update on a
 *  single list-shaped query key. `apply` is a pure (prev) => next reducer. */
export function optimisticListUpdate<TData, TVars>(
  queryClient: QueryClient,
  queryKey: QueryKey,
  apply: (prev: TData | undefined, vars: TVars) => TData,
) {
  return {
    onMutate: async (vars: TVars): Promise<OptimisticContext<TData | undefined>> => {
      await queryClient.cancelQueries({ queryKey })
      const snapshot = queryClient.getQueryData<TData>(queryKey)
      queryClient.setQueryData<TData>(queryKey, (prev) => apply(prev, vars))
      return { snapshot }
    },
    onError: (_err: unknown, _vars: TVars, ctx?: OptimisticContext<TData | undefined>) => {
      if (ctx) queryClient.setQueryData<TData>(queryKey, ctx.snapshot)
    },
    onSettled: () => {
      // Default: no invalidation — socket echo / pessimistic write reconciles.
      // Callers needing server-computed fields override onSettled at the call site.
    },
  }
}
