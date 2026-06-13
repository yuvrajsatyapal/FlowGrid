import type { QueryClient } from "@tanstack/react-query"
import type { WorkspaceSummary } from "../../../api/workspaces"
import { workspaceKeys } from "./keys"

/** Direct cache writes against the workspace-list query (Phase 4B) — the
 *  replacements for the former Zustand addWorkspace/updateWorkspace/
 *  removeWorkspace mutators. The pure list transforms are exported for testing. */

export function addToList(list: WorkspaceSummary[], ws: WorkspaceSummary): WorkspaceSummary[] {
  return list.some((w) => w.id === ws.id) ? list : [...list, ws]
}

export function patchInList(
  list: WorkspaceSummary[],
  id: string,
  patch: Partial<WorkspaceSummary>,
): WorkspaceSummary[] {
  return list.map((w) => (w.id === id ? { ...w, ...patch } : w))
}

export function removeFromList(list: WorkspaceSummary[], id: string): WorkspaceSummary[] {
  return list.filter((w) => w.id !== id)
}

export function addWorkspaceToCache(qc: QueryClient, ws: WorkspaceSummary): void {
  qc.setQueryData<WorkspaceSummary[]>(workspaceKeys.list(), (prev) => addToList(prev ?? [], ws))
}

export function updateWorkspaceInCache(qc: QueryClient, id: string, patch: Partial<WorkspaceSummary>): void {
  qc.setQueryData<WorkspaceSummary[]>(workspaceKeys.list(), (prev) => (prev ? patchInList(prev, id, patch) : prev))
}

export function removeWorkspaceFromCache(qc: QueryClient, id: string): void {
  qc.setQueryData<WorkspaceSummary[]>(workspaceKeys.list(), (prev) => (prev ? removeFromList(prev, id) : prev))
}
