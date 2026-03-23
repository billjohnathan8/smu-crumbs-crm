import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '@/features/auth/AuthContext'
import { useTheme } from '@/features/theme/ThemeContext'

export type NavItem = {
  label: string
  to: string
  end?: boolean
}

type SidebarLayoutProps = {
  items: NavItem[]
  children: React.ReactNode
}

export function SidebarLayout({ items, children }: SidebarLayoutProps) {
  const [collapsed, setCollapsed] = useState(false)
  const { theme } = useTheme()
  const { logout } = useAuth()
  const navigate = useNavigate()

  const linkBase =
    'flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-all duration-300 ease-in-out'
  const inactive = 'text-text hover:font-medium ease-in-out hover:bg-background-light duration-100 ease-in-out'
  const active = 'gradient-dark-red text-white font-medium'

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <div className="min-h-screen bg-background text-text">
      <div className="flex">
        {!collapsed && (
          <aside className="w-64 shrink-0 -r bg-card flex flex-col h-screen sticky top-0">
            <div className="px-4 py-4 flex-shrink-0">
              <img
                src={theme === 'dark' ? '/DarkMode_SGB.svg' : '/LightMode_SGB.svg'}
                alt="ScroogeBank"
                className="h-14 object-contain"
              />
            </div>
            <nav className="p-3 space-y-1 flex-1 overflow-y-auto min-h-0">
              {items.map(item => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) => `${linkBase} ${isActive ? active : inactive}`}
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>
            <div className="p-3 flex-shrink-0">
              <button
                onClick={handleLogout}
                className="underline-hover flex items-center gap-2 font-medium rounded-md px-3 py-2 text-sm text-danger hover:bg-danger/10 transition-colors w-full text-left"
              >
                Logout
              </button>
            </div>
          </aside>
        )}

        <main className="flex-1 min-w-0 min-h-screen">
          <header className="flex items-center px-4 py-3 bg-card">
            <button onClick={() => setCollapsed(!collapsed)} className="rounded-md p-2 text-xl">
              {collapsed ? '☰' : '≪'}
            </button>
          </header>

          <div className="p-6">{children}</div>
        </main>
      </div>
    </div>
  )
}
