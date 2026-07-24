'use client';

import { signOut } from 'next-auth/react';
import { UserRole } from '@/domain/value-objects/UserRole';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { LogOut, User } from 'lucide-react';

const roleBadge: Record<UserRole, { label: string; variant: 'success' | 'info' | 'warning' | 'danger' }> = {
  SUPERUSER: { label: 'Superuser', variant: 'danger' },
  PRINCIPAL: { label: 'Principal', variant: 'warning' },
  ADMIN: { label: 'Admin', variant: 'info' },
  AGENT: { label: 'Agent', variant: 'success' },
};

interface HeaderProps {
  user?: { name?: string | null; email?: string | null; role?: UserRole };
  title: string;
}

export function Header({ user, title }: HeaderProps) {
  return (
    <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-6">
      <h1 className="text-base font-semibold text-gray-800">{title}</h1>
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
              onClick={() => signOut({ callbackUrl: '/' })}
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
