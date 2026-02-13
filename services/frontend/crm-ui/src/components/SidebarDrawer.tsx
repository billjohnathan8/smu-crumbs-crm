import { useState } from 'react'
import { NavLink } from 'react-router-dom'

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

  const linkBase = 'flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors'
  const inactive = 'text-text hover:bg-background-lighter'
  const active = 'bg-background-lighter text-text font-medium'

  return (
    <div className="min-h-screen bg-background text-text">
      <div className="flex min-h-screen">
        {!collapsed && (
          <aside className="w-64 shrink-0 border-r border-border bg-card">
            <div className="px-4 py-4">
              <h1 className="text-xl font-bold text-text tracking-tight">ScroogeBank</h1>
            </div>
            <nav className="p-3 space-y-1">
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
          </aside>
        )}

        <main className="flex-1 min-w-0">
          <header className="flex items-center px-4 py-3 border-b border-border bg-card">
            <button
              onClick={() => setCollapsed(!collapsed)}
              className="rounded-md border border-border p-2"
            >
              {collapsed ? '☰' : '≪'}
            </button>
          </header>

          <div className="p-6">{children}</div>
        </main>
      </div>
    </div>
  )
}
