import { create } from "zustand"
import type { WorkspaceSummary } from "../api/workspaces"

interface WorkspaceStore {
  workspaces: WorkspaceSummary[]
  activeWorkspace: WorkspaceSummary | null
  isLoading: boolean

  setWorkspaces: (workspaces: WorkspaceSummary[]) => void
  setActiveWorkspace: (workspace: WorkspaceSummary | null) => void
  addWorkspace: (workspace: WorkspaceSummary) => void
  removeWorkspace: (id: string) => void
  updateWorkspace: (id: string, patch: Partial<WorkspaceSummary>) => void
  setLoading: (loading: boolean) => void
  reset: () => void
}

export const useWorkspaceStore = create<WorkspaceStore>((set) => ({
  workspaces: [],
  activeWorkspace: null,
  isLoading: false,

  setWorkspaces: (workspaces) =>
    set((state) => ({
      workspaces,
      // Keep activeWorkspace in sync — clear if it was deleted
      activeWorkspace: state.activeWorkspace
        ? (workspaces.find((w) => w.id === state.activeWorkspace!.id) ?? workspaces[0] ?? null)
        : (workspaces[0] ?? null),
    })),

  setActiveWorkspace: (workspace) => set({ activeWorkspace: workspace }),

  addWorkspace: (workspace) =>
    set((state) => ({
      workspaces: [...state.workspaces, workspace],
    })),

  removeWorkspace: (id) =>
    set((state) => {
      const remaining = state.workspaces.filter((w) => w.id !== id)
      return {
        workspaces: remaining,
        activeWorkspace:
          state.activeWorkspace?.id === id ? (remaining[0] ?? null) : state.activeWorkspace,
      }
    }),

  updateWorkspace: (id, patch) =>
    set((state) => ({
      workspaces: state.workspaces.map((w) => (w.id === id ? { ...w, ...patch } : w)),
      activeWorkspace:
        state.activeWorkspace?.id === id
          ? { ...state.activeWorkspace, ...patch }
          : state.activeWorkspace,
    })),

  setLoading: (isLoading) => set({ isLoading }),

  reset: () => set({ workspaces: [], activeWorkspace: null, isLoading: false }),
}))
