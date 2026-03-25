import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/features/auth/AuthContext'
import { useTheme } from '@/features/theme/ThemeContext'
import { SidebarLayout, type NavItem } from '@/components/SidebarDrawer'

const adminNav: NavItem[] = [
  { label: 'Home', to: '/admin', end: true },
  { label: 'All Clients', to: '/admin/clients', end: true },
  { label: 'Create Client', to: '/admin/clients/new' },
  { label: 'Communications', to: '/admin/communications' },
  { label: 'Transactions', to: '/admin/transactions' },
  { label: 'AML Alerts', to: '/admin/aml-alerts' },
  { label: 'User Management', to: '/admin/users' },
  { label: 'Settings', to: '/admin/settings' },
]

const userNav: NavItem[] = [
  { label: 'Home', to: '/user', end: true },
  { label: 'All Clients', to: '/user/clients', end: true },
  { label: 'Create Client', to: '/user/clients/new' },
  { label: 'Transactions', to: '/user/transactions' },
  { label: 'AML Alerts', to: '/user/aml-alerts' },
  { label: 'Settings', to: '/user/settings' },
]

export function SettingsPage() {
  const { user } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const navigate = useNavigate()

  const [isResettingPassword, setIsResettingPassword] = useState(false)

  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin'
  const navItems = isAdmin ? adminNav : userNav

  const handleResetPassword = () => {
    setIsResettingPassword(true)
    navigate('/reset-password', { state: { email: user?.email } })
  }

  return (
    <SidebarLayout items={navItems}>
      <div className="p-6 max-w-2xl mx-auto">
        <h1 className="text-2xl font-medium text-text mb-6">Settings</h1>

        <div className="space-y-6">
          <div className="bg-card  rounded-lg p-6">
            <h2 className="text-lg font-normal text-[var(--red)] mb-4">Appearance</h2>
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-normal text-text">Theme</h3>
                <p className="text-sm text-text-subtle">Choose your preferred theme</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-text-muted">
                  {theme === 'light' ? 'Light' : 'Dark'}
                </span>
                <button
                  onClick={toggleTheme}
                  className="relative inline-flex h-6 w-11 items-center rounded-full bg-border transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      theme === 'dark' ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>

          <div className="bg-card  rounded-lg p-6">
            <h2 className="text-lg font-normal text-[var(--red)] mb-4">Account</h2>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-normal text-text">Password</h3>
                  <p className="text-sm text-text-subtle">Change your account password</p>
                </div>
                <button
                  onClick={handleResetPassword}
                  disabled={isResettingPassword}
                  className="px-4 py-2 font-medium text-sm gradient-dark-red text-white rounded-md hover:brightness-[0.8] disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
                >
                  {isResettingPassword ? 'Redirecting...' : 'Reset Password'}
                </button>
              </div>
            </div>
          </div>

          <div className="bg-card  rounded-lg p-6">
            <h2 className="text-lg font-normal text-[var(--red)] mb-4">Account Information</h2>
            <div className="space-y-3">
              <div>
                <label className="text-sm font-normal text-text-subtle">Name</label>
                <p className="text-text">
                  {user?.firstName} {user?.lastName}
                </p>
              </div>
              <div>
                <label className="text-sm font-normal text-text-subtle">Email</label>
                <p className="text-text">{user?.email}</p>
              </div>
              <div>
                <label className="text-sm font-normal text-text-subtle">Role</label>
                <p className="text-text capitalize">{user?.role?.replace('_', ' ')}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </SidebarLayout>
  )
}
