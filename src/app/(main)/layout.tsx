import { auth } from '@/lib/auth';
import { Sidebar } from '@/components/layout/Sidebar';
import { Header } from '@/components/layout/Header';
import { ServiceWorkerRegistration } from '@/components/layout/ServiceWorkerRegistration';
import { UserRole } from '@/domain/value-objects/UserRole';

// Route titles map
const ROUTE_TITLES: Record<string, string> = {
  '/': 'Dashboard',
  '/assets': 'Asset Bank',
  '/import': 'Import Asset',
  '/mappings': 'Konfigurasi Mapping',
  '/normalization': 'Kamus Normalisasi',
  '/market-intelligence': 'Market Intelligence',
  '/settings': 'Pengaturan',
};

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
    <div className="flex min-h-screen">
      <ServiceWorkerRegistration />
      <Sidebar isAuthenticated={!!session} />
      <div className="flex-1 flex flex-col min-w-0">
        <Header user={user} title="Mansion Asset Bank Intelligence" />
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
