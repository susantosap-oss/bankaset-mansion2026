'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard, Building2, Settings,
  Map, LogIn, Upload,
} from 'lucide-react';

const NAV_ITEMS = [
  { label: 'Dashboard',           href: '/',                   icon: LayoutDashboard, public: true,  requiresAuth: false },
  { label: 'Asset Bank',          href: '/assets',             icon: Building2,       public: true,  requiresAuth: false },
  { label: 'Market Intelligence', href: '/market-intelligence', icon: Map,             public: true,  requiresAuth: false },
  { label: 'Import Asset',        href: '/pdf-import',         icon: Upload,          public: false, requiresAuth: true  },
  { label: 'Pengaturan',          href: '/settings',           icon: Settings,        public: true,  requiresAuth: true  },
];

interface SidebarProps {
  isAuthenticated: boolean;
  onNavigate?: () => void;
}

export function Sidebar({ isAuthenticated, onNavigate }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside className="w-60 h-full min-h-screen bg-gray-900 flex flex-col">
      {/* Logo */}
      <div className="px-6 py-5 border-b border-gray-700">
        <p className="text-white font-bold text-lg leading-tight">Mansion</p>
        <p className="text-gray-400 text-xs">Asset Bank Intelligence</p>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV_ITEMS.map((item) => {
          // Jika butuh auth tapi belum login → arahkan ke login dengan callbackUrl
          const href = item.requiresAuth && !isAuthenticated
            ? `/login?callbackUrl=${encodeURIComponent(item.href)}`
            : item.href;

          const active = pathname === item.href ||
            (item.href !== '/' && pathname.startsWith(item.href));

          return (
            <Link
              key={item.href}
              href={href}
              onClick={onNavigate}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                active
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800',
              )}
            >
              <item.icon className="w-4 h-4 flex-shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>

    </aside>
  );
}
