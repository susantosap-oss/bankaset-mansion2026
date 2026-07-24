export type UserRole = 'SUPERUSER' | 'PRINCIPAL' | 'ADMIN' | 'AGENT';

// Roles that can upload, approve, and manage
export const PRIVILEGED_ROLES: UserRole[] = ['SUPERUSER', 'PRINCIPAL', 'ADMIN'];

// Only SUPERUSER can manage other users
export const SUPERUSER_ONLY: UserRole[] = ['SUPERUSER'];

export function canUpload(role: UserRole | undefined): boolean {
  if (!role) return false;
  return PRIVILEGED_ROLES.includes(role);
}

export function canApprove(role: UserRole | undefined): boolean {
  if (!role) return false;
  return PRIVILEGED_ROLES.includes(role);
}

export function canManageUsers(role: UserRole | undefined): boolean {
  return role === 'SUPERUSER';
}
