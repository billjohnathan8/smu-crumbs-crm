import type { User } from '@/api/types'
import type { NavItem } from '@/components/SidebarDrawer'
import { isRootAdminUser } from '@/features/auth/authorization'

export const agentSidebarNav: NavItem[] = [
  { label: 'Home', to: '/user', end: true },
  { label: 'My Clients', to: '/user/clients', end: true },
  { label: 'Create Client', to: '/user/clients/new' },
  { label: 'Transactions', to: '/user/transactions' },
  { label: 'AML Alerts', to: '/user/aml-alerts' },
  { label: 'Activity Logs', to: '/user/logs' },
  { label: 'Settings', to: '/user/settings' },
]

export const adminSidebarNav: NavItem[] = [
  { label: 'User Management', to: '/admin/users', end: true },
  { label: 'Create User', to: '/admin/users/new' },
  { label: 'Activity Logs', to: '/admin/logs' },
  { label: 'Settings', to: '/admin/settings' },
]

export const rootAdminSidebarNav: NavItem[] = [
  { label: 'Home', to: '/admin', end: true },
  { label: 'All Clients', to: '/admin/clients', end: true },
  { label: 'Archived Clients', to: '/admin/archives/clients', end: true },
  { label: 'Create Client', to: '/admin/clients/new' },
  { label: 'Communications', to: '/admin/communications' },
  { label: 'Transactions', to: '/admin/transactions' },
  { label: 'AML Alerts', to: '/admin/aml-alerts' },
  { label: 'Activity Logs', to: '/admin/logs' },
  { label: 'User Management', to: '/admin/users', end: true },
  { label: 'Create User', to: '/admin/users/new' },
  { label: 'Archived Admins', to: '/admin/users/archives/admins' },
  { label: 'Archived Agents', to: '/admin/users/archives/agents' },
  { label: 'Settings', to: '/admin/settings' },
]

export function getSidebarNavForUser(user: User | null | undefined): NavItem[] {
  if (!user) return agentSidebarNav
  if (user.role === 'user') return agentSidebarNav
  if (isRootAdminUser(user)) return rootAdminSidebarNav
  return adminSidebarNav
}
