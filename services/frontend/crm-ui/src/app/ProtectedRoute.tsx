import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '@/features/auth/AuthContext'
import type { UserRole } from '@/api/types'
import { isRootAdminUser } from '@/features/auth/authorization'

interface ProtectedRouteProps {
  allowedRoles?: UserRole[]
  requireRootAdmin?: boolean
}

export function ProtectedRoute({ allowedRoles, requireRootAdmin = false }: ProtectedRouteProps) {
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
    return <Navigate to="/unauthorized" replace />
  }

  if (requireRootAdmin && !isRootAdminUser(user)) {
    return <Navigate to="/unauthorized" replace />
  }

  return <Outlet />
}
