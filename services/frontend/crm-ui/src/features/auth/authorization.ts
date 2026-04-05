/**
 * Prefer the backend-owned `isRootAdmin` claim when available.
 * Fallback logic is kept narrow for compatibility during mixed deployments.
 */
export function isRootAdminUser(
  user: { id?: unknown; role?: unknown; isRootAdmin?: unknown } | null | undefined
): boolean {
  if (!user) return false

  if (typeof user.isRootAdmin === 'boolean') {
    return user.isRootAdmin
  }

  const role = String(user.role ?? '')
    .trim()
    .toLowerCase()
  const id = String(user.id ?? '')
    .trim()
    .toLowerCase()
  const email = String((user as { email?: unknown }).email ?? '')
    .trim()
    .toLowerCase()

  const hasRootId = id === 'usr_1'
  const hasRootRole = role === 'admin' || role === 'super_admin' || role === 'superadmin'
  const hasCanonicalRootEmail = email === 'admin@crm.com'
  return hasRootRole && (hasRootId || hasCanonicalRootEmail)
}
