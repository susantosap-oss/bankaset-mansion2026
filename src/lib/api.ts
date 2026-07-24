import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { UserRole, PRIVILEGED_ROLES } from '@/domain/value-objects/UserRole';
import type { Session } from 'next-auth';

export function ok<T>(data: T, meta?: Record<string, unknown>) {
  return NextResponse.json({ success: true, data, ...(meta ? { meta } : {}) });
}

export function err(code: string, message: string, status = 400) {
  return NextResponse.json({ success: false, error: { code, message } }, { status });
}

type PrivilegedResult =
  | { session: Session; error: null }
  | { session: null; error: NextResponse };

/** Require ADMIN / PRINCIPAL / SUPERUSER — return 401 if not. */
export async function requirePrivileged(): Promise<PrivilegedResult> {
  const session = await auth();
  const role = session?.user?.role as UserRole | undefined;

  if (!session || !role || !PRIVILEGED_ROLES.includes(role)) {
    return { session: null, error: err('UNAUTHORIZED', 'Login diperlukan', 401) };
  }
  return { session: session as Session, error: null };
}

/** Require any authenticated user (any role). */
export async function requireAuth(): Promise<PrivilegedResult> {
  const session = await auth();
  if (!session?.user) {
    return { session: null, error: err('UNAUTHORIZED', 'Login diperlukan', 401) };
  }
  return { session: session as Session, error: null };
}
