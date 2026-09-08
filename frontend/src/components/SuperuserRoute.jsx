import { Navigate, Outlet } from 'react-router-dom'

import { useAuth } from '@/lib/auth'

export default function SuperuserRoute() {
  const { user, isLoading } = useAuth()

  if (isLoading) {
    return (
      <div className="min-h-svh flex items-center justify-center text-muted-foreground">
        Chargement...
      </div>
    )
  }

  if (!user?.is_superuser) {
    return <Navigate to="/" replace />
  }

  return <Outlet />
}
