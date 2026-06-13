import config from "@flowgrid/eslint-config"

/**
 * React Query guardrail.
 *
 * Server state must flow through React Query — useQuery / useInfiniteQuery for
 * reads, useMutation for writes — never a raw API-client call inside a
 * useEffect. This catches regressions to the pre-migration pattern, e.g.:
 *
 *   useEffect(() => { notificationsApi.list() }, [])   // ← flagged
 *
 * queryFn/mutationFn are NOT flagged: they live inside useQuery/useMutation,
 * not useEffect, so the selector never matches them.
 *
 * Scope: pages / components / hooks. Tests and the api/ client modules are
 * exempt. Detection is lexical — an API call inside a function *defined* in the
 * effect is caught; one in a function defined elsewhere and merely *called*
 * from the effect is not (see review notes).
 */
const reactQueryGuardrail = {
  files: [
    "src/pages/**/*.{ts,tsx}",
    "src/components/**/*.{ts,tsx}",
    "src/hooks/**/*.{ts,tsx}",
  ],
  ignores: ["**/*.test.{ts,tsx}", "**/*.spec.{ts,tsx}"],
  rules: {
    "no-restricted-syntax": [
      "error",
      {
        // any `<name>Api.method(...)` call lexically inside a useEffect
        selector: "CallExpression[callee.name='useEffect'] CallExpression[callee.object.name=/Api$/]",
        message:
          "Server state must not be fetched/mutated from useEffect. Use useQuery/useInfiniteQuery for reads or useMutation for writes (React Query owns server state).",
      },
      {
        // the raw axios `api` client inside a useEffect
        selector: "CallExpression[callee.name='useEffect'] CallExpression[callee.object.name='api']",
        message:
          "Do not call the axios `api` client inside useEffect. Use useQuery/useInfiniteQuery/useMutation instead.",
      },
    ],
  },
}

export default [...config, reactQueryGuardrail]
