import { Navigate, Outlet } from 'react-router-dom'

import { useAuth } from '@/lib/auth'

/**
 * Garde-fou inverse de SuperuserRoute : le compte AfriLab (is_superuser, sans école)
 * n'a rien à faire sur les pages opérationnelles d'une école (tableau de bord, élèves,
 * parents, messages, facturation...) — leur get_queryset() ne filtre pas par école pour
 * lui, donc il y verrait les données agrégées de toutes les écoles clientes mélangées.
 * Sa seule page est la gestion des écoles clientes.
 */
export default function TenantRoute() {
  const { user, isLoading } = useAuth()

  if (isLoading) {
    return (
      <div className="min-h-svh flex items-center justify-center text-muted-foreground">
        Chargement...
      </div>
    )
  }

  if (user?.is_superuser) {
    return <Navigate to="/admin/ecoles" replace />
  }

  return <Outlet />
}
