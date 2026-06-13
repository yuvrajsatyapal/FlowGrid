import { create } from "zustand"
import type { WorkspaceSummary } from "../api/workspaces"

/** Phase 4B: the workspace LIST now lives in React Query (useWorkspaceList).
 *  This store owns ONLY the active-workspace selection — cross-tree client
 *  state that isn't server data. */
interface WorkspaceStore {
  activeWorkspace: WorkspaceSummary | null
  setActiveWorkspace: (workspace: WorkspaceSummary | null) => void
  reset: () => void
}

export const useWorkspaceStore = create<WorkspaceStore>((set) => ({
  activeWorkspace: null,
  setActiveWorkspace: (workspace) => set({ activeWorkspace: workspace }),
  reset: () => set({ activeWorkspace: null }),
}))
