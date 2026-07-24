'use client';

import { signOut } from 'next-auth/react';
import { UserRole } from '@/domain/value-objects/UserRole';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { LogOut, User, Menu } from 'lucide-react';

const roleBadge: Record<UserRole, { label: string; variant: 'success' | 'info' | 'warning' | 'danger' }> = {
  SUPERUSER: { label: 'Superuser', variant: 'danger' },
  PRINCIPAL: { label: 'Principal', variant: 'warning' },
  ADMIN: { label: 'Admin', variant: 'info' },
  AGENT: { label: 'Agent', variant: 'success' },
};

interface HeaderProps {
  user?: { name?: string | null; email?: string | null; role?: UserRole };
  title: string;
  onMenuClick?: () => void;
}

export function Header({ user, title, onMenuClick }: HeaderProps) {
  return (
    <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-4 md:px-6">
      <div className="flex items-center gap-3">
        <button onClick={onMenuClick} className="md:hidden p-1.5 rounded-lg text-gray-500 hover:bg-gray-100">
          <Menu className="w-5 h-5" />
        </button>
        <h1 className="text-sm md:text-base font-semibold text-gray-800 truncate">{title}</h1>
      </div>
      <div className="flex items-center gap-3">
        {user ? (
          <>
            {user.role && (
              <Badge variant={roleBadge[user.role].variant}>{roleBadge[user.role].label}</Badge>
            )}
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <User className="w-4 h-4" />
              <span>{user.name ?? user.email}</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => { await signOut({ redirect: false }); window.location.href = '/'; }}
            >
              <LogOut className="w-4 h-4" />
            </Button>
          </>
        ) : (
          <span className="text-sm text-gray-400">Publik</span>
        )}
      </div>
    </header>
  );
}
