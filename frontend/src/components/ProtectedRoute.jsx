import { Navigate, Outlet } from 'react-router-dom'

import { useAuth } from '@/lib/auth'

export default function ProtectedRoute() {
  const { user, isLoading } = useAuth()

  if (isLoading) {
    return (
      <div className="min-h-svh flex items-center justify-center text-muted-foreground">
        Chargement...
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/connexion" replace />
  }

  return <Outlet />
}
