/**
 * Root admin is the seeded identity `usr_1`.
 * Legacy `super_admin` role claims are accepted only when paired with root id.
 * In prod, some historical records may carry a non-seeded id for the same
 * root identity, so we also accept the canonical root email.
 */
export function isRootAdminUser(
  user: { id?: unknown; role?: unknown; email?: unknown } | null | undefined
): boolean {
  if (!user) return false

  const role = String(user.role ?? '')
    .trim()
    .toLowerCase()
  const id = String(user.id ?? '')
    .trim()
    .toLowerCase()
  const email = String(user.email ?? '')
    .trim()
    .toLowerCase()

  const hasRootId = id === 'usr_1' || id === '1'
  const hasRootEmail = email === 'admin@crm.com'
  const hasRootRole =
    role === '' || role === 'admin' || role === 'super_admin' || role === 'superadmin'
  return (hasRootId || hasRootEmail) && hasRootRole
}
