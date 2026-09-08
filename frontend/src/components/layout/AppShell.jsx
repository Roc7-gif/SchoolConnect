import {
  Bell,
  Building2,
  CalendarDays,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  Receipt,
  Upload,
  UserCog,
  Users,
} from 'lucide-react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'

import AnneeSelector from '@/components/AnneeSelector'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/lib/auth'
import { cn } from '@/lib/utils'

const navItems = [
  { to: '/', label: 'Tableau de bord', icon: LayoutDashboard, end: true },
  { to: '/eleves-classes', label: 'Élèves & classes', icon: GraduationCap },
  { to: '/annees', label: 'Années scolaires', icon: CalendarDays },
  { to: '/parents', label: 'Parents', icon: Users },
  { to: '/import', label: 'Import', icon: Upload },
  { to: '/messages', label: 'Messages', icon: MessageSquare },
  { to: '/facturation', label: 'Facturation', icon: Receipt },
]

export default function AppShell() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  // Le compte AfriLab (superuser, sans école) ne gère aucune école en particulier :
  // il n'a accès qu'à la liste des écoles clientes, jamais aux pages opérationnelles.
  const items = user?.is_superuser
    ? [{ to: '/admin/ecoles', label: 'Écoles clientes', icon: Building2 }]
    : navItems

  async function handleLogout() {
    await logout()
    navigate('/connexion', { replace: true })
  }

  return (
    <div className="flex min-h-svh bg-background">
      <aside className="w-64 shrink-0 bg-primary-900 text-neutral-0 flex flex-col">
        <div className="px-6 py-5">
          <span className="text-xl font-display font-semibold">
            School<span className="text-accent-500">Connect</span>
          </span>
        </div>
        <nav className="flex-1 px-3 space-y-1">
          {items.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                  isActive
                    ? 'bg-primary-700 text-neutral-0'
                    : 'text-neutral-0/70 hover:bg-primary-800 hover:text-neutral-0'
                )
              }
            >
              <Icon className="size-4" />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="px-3 pb-5 space-y-1">
          <NavLink
            to="/profil"
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                isActive
                  ? 'bg-primary-700 text-neutral-0'
                  : 'text-neutral-0/70 hover:bg-primary-800 hover:text-neutral-0'
              )
            }
          >
            <UserCog className="size-4" />
            Mon profil
          </NavLink>
          <button
            type="button"
            onClick={handleLogout}
            className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-neutral-0/70 hover:bg-primary-800 hover:text-neutral-0 transition-colors"
          >
            <LogOut className="size-4" />
            Déconnexion
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="flex items-center justify-between border-b border-border px-8 py-4">
          <div>
            <h1 className="text-xl font-semibold">
              Bonjour, {user?.first_name || user?.username}
            </h1>
            {user?.school?.name && (
              <p className="text-sm text-muted-foreground">{user.school.name}</p>
            )}
          </div>
          <div className="flex items-center gap-3">
            <AnneeSelector />
            <Button variant="ghost" size="icon">
              <Bell className="size-4" />
            </Button>
          </div>
        </header>
        <main className="flex-1 p-8 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
