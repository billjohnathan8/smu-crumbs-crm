/**
 * Root admin is represented as the first seeded user (usr_1). Some flows also
 * emit legacy role aliases, so we normalize both role and id checks here.
 */
export function isRootAdminUser(user: { id?: unknown; role?: unknown } | null | undefined): boolean {
  if (!user) return false

  const role = String(user.role ?? '').trim().toLowerCase()
  const id = String(user.id ?? '').trim().toLowerCase()

  return role === 'super_admin' || role === 'superadmin' || id === 'usr_1' || id === '1'
}
