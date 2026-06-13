import { Navigate, Outlet } from "react-router-dom"
import { useAuth } from "../../contexts/AuthContext"

export default function PublicRoute() {
  const { isAuthenticated, isLoading } = useAuth()

  if (isLoading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "oklch(var(--color-paper))",
        }}
      />
    )
  }

  return isAuthenticated ? <Navigate to="/dashboard" replace /> : <Outlet />
}
