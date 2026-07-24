import { auth } from '@/lib/auth';
import { AppShell } from '@/components/layout/AppShell';
import { ServiceWorkerRegistration } from '@/components/layout/ServiceWorkerRegistration';
import { UserRole } from '@/domain/value-objects/UserRole';

export default async function MainLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const user = session?.user
    ? {
        name: session.user.name,
        email: session.user.email,
        role: session.user.role as UserRole | undefined,
      }
    : undefined;

  return (
    <>
      <ServiceWorkerRegistration />
      <AppShell user={user} isAuthenticated={!!session}>
        {children}
      </AppShell>
    </>
  );
}
