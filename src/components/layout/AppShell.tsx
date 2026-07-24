'use client';

import { useState, useCallback } from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { UserRole } from '@/domain/value-objects/UserRole';

interface AppShellProps {
  children: React.ReactNode;
  user?: { name?: string | null; email?: string | null; role?: UserRole };
  isAuthenticated: boolean;
}

export function AppShell({ children, user, isAuthenticated }: AppShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const close = useCallback(() => setMobileOpen(false), []);

  return (
    <div className="flex min-h-screen">
      {/* Mobile overlay backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-20 md:hidden"
          onClick={close}
        />
      )}

      {/* Sidebar — hidden on mobile unless open */}
      <div className={`
        fixed inset-y-0 left-0 z-30 transform transition-transform duration-200 ease-in-out md:relative md:translate-x-0
        ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <Sidebar isAuthenticated={isAuthenticated} onNavigate={close} />
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 md:ml-0">
        <Header
          user={user}
          title="Mansion Asset Bank Intelligence"
          onMenuClick={() => setMobileOpen(o => !o)}
        />
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
