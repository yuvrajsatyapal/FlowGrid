import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom"
import { AuthProvider } from "./contexts/AuthContext"
import { ThemeProvider } from "./contexts/ThemeContext"
import ProtectedRoute from "./components/auth/ProtectedRoute"
import PublicRoute from "./components/auth/PublicRoute"
import AppLayout from "./components/layout/AppLayout"
import LoginPage from "./pages/LoginPage"
import AuthCallbackPage from "./pages/AuthCallbackPage"
import DashboardPage from "./pages/DashboardPage"
import OnboardingPage from "./pages/OnboardingPage"
import WorkspacePage from "./pages/WorkspacePage"
import WorkspaceSettingsPage from "./pages/WorkspaceSettingsPage"
import WorkspaceMembersPage from "./pages/WorkspaceMembersPage"
import InviteAcceptPage from "./pages/InviteAcceptPage"
import BoardPage from "./pages/BoardPage"
import AnalyticsPage from "./pages/AnalyticsPage"
import InboxPage from "./pages/InboxPage"
import ProfilePage from "./pages/ProfilePage"
import LandingPage from "./pages/LandingPage"
import AllActivityPage from "./pages/AllActivityPage"
import AllDeadlinesPage from "./pages/AllDeadlinesPage"

export default function App() {
  return (
    <ThemeProvider>
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Public — redirect to /dashboard if already authenticated */}
          <Route element={<PublicRoute />}>
            <Route path="/" element={<LandingPage />} />
            <Route path="/login" element={<LoginPage />} />
          </Route>
          <Route path="/auth/callback" element={<AuthCallbackPage />} />
          {/* Invite accept — handles auth redirect internally */}
          <Route path="/invite/accept" element={<InviteAcceptPage />} />

          {/* Protected — no layout (full-screen flows) */}
          <Route element={<ProtectedRoute />}>
            <Route path="/onboarding" element={<OnboardingPage />} />
            <Route path="/dashboard" element={<DashboardPage />} />
          </Route>

          {/* Protected — with AppLayout (sidebar + nav) */}
          <Route element={<ProtectedRoute />}>
            <Route element={<AppLayout />}>
              <Route path="/:workspaceId" element={<WorkspacePage />} />
              <Route path="/:workspaceId/settings" element={<WorkspaceSettingsPage />} />
              <Route path="/:workspaceId/members" element={<WorkspaceMembersPage />} />
              <Route path="/:workspaceId/analytics" element={<AnalyticsPage />} />
              <Route path="/:workspaceId/activity" element={<AllActivityPage />} />
              <Route path="/:workspaceId/deadlines" element={<AllDeadlinesPage />} />
              <Route path="/:workspaceId/inbox" element={<InboxPage />} />
              <Route path="/:workspaceId/profile" element={<ProfilePage />} />
              <Route path="/:workspaceId/:boardId" element={<BoardPage />} />
            </Route>
          </Route>

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
    </ThemeProvider>
  )
}
