import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '@/features/auth/AuthContext'
import type { UserRole } from '@/api/types'

interface ProtectedRouteProps {
  allowedRoles?: UserRole[]
}

export function ProtectedRoute({ allowedRoles }: ProtectedRouteProps) {
  const { user, isAuthenticated, isLoading } = useAuth()

  if (isLoading) {
    return (
      <div className="container-centered">
        <div className="card max-w-md p-8 text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
          <p className="mt-4 text-text-muted">Loading...</p>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  if (allowedRoles && user && !allowedRoles.includes(user.role)) {
    return (
      <div className="container-centered">
        <div className="card max-w-md p-8">
          <h1 className="text-2xl font-bold text-danger mb-4">Access Denied</h1>
          <p className="text-text-muted">You don't have permission to access this page.</p>
          <button onClick={() => window.history.back()} className="btn btn-secondary mt-4">
            Go Back
          </button>
        </div>
      </div>
    )
  }

  return <Outlet />
}
