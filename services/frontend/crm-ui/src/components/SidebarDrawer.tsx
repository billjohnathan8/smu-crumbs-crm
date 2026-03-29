import { useEffect, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '@/features/auth/AuthContext'
import { useTheme } from '@/features/theme/useTheme'

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
  const [showHeader, setShowHeader] = useState(true)
  const { theme } = useTheme()
  const { logout } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    let lastScrollY = window.scrollY

    const handleScroll = () => {
      const currentScrollY = window.scrollY

      if (currentScrollY <= 8) {
        setShowHeader(true)
      } else if (currentScrollY < lastScrollY) {
        setShowHeader(true)
      } else if (currentScrollY > lastScrollY) {
        setShowHeader(false)
      }

      lastScrollY = currentScrollY
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const linkBase =
    'flex items-center gap-2 rounded-md px-3 py-2 text-md transition-all duration-200 ease-out'
  const inactive = 'text-text hover:bg-background-light hover:scale-[1.01]'
  const active = 'gradient-dark-red text-white font-medium'

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <div className="min-h-screen bg-background text-text">
      <div className="flex">
        <aside
          className={`shrink-0 bg-card flex flex-col h-screen sticky top-0 overflow-hidden
            transition-all duration-300 ease-in-out
            ${collapsed ? 'w-0 -translate-x-2 opacity-0' : 'w-64 translate-x-0 opacity-100'}`}
        >
          {!collapsed && (
            <div className="px-4 py-4 flex-shrink-0">
              <img
                src={theme === 'dark' ? '/DarkMode_SGB.svg' : '/LightMode_SGB.svg'}
                alt="ScroogeBank"
                className="h-14 object-contain"
              />
            </div>
          )}

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

          {!collapsed && (
            <div className="p-3 flex-shrink-0">
              <button
                onClick={handleLogout}
                className="underline-hover flex items-center gap-2 font-medium rounded-md px-3 py-2 text-md text-danger hover:bg-danger/10 transition-colors w-full text-left"
              >
                Logout
              </button>
            </div>
          )}
        </aside>

        <main className="flex-1 min-w-0 min-h-screen transition-all duration-300 ease-in-out">
          <header
            className={`sticky top-0 z-30 flex items-center px-4 py-3 bg-card/95 backdrop-blur border-b border-border
              transition-transform duration-300 ease-in-out
              ${showHeader ? 'translate-y-0' : '-translate-y-full'}`}
          >
            <button
              onClick={() => setCollapsed(!collapsed)}
              className="rounded-md p-2 text-xl transition-transform duration-200 hover:scale-105"
            >
              {collapsed ? '☰' : '←'}
            </button>
          </header>

          <div className="p-6">{children}</div>
        </main>
      </div>
    </div>
  )
}
