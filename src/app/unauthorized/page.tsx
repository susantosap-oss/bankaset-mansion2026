import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { ShieldX } from 'lucide-react';

export default function UnauthorizedPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="text-center space-y-4">
        <div className="w-16 h-16 bg-red-100 rounded-2xl flex items-center justify-center mx-auto">
          <ShieldX className="w-8 h-8 text-red-500" />
        </div>
        <h1 className="text-xl font-bold text-gray-900">Akses Ditolak</h1>
        <p className="text-sm text-gray-500 max-w-sm">
          Akun Google Anda tidak terdaftar dalam sistem CRM Mansion. Hubungi admin untuk mendapatkan akses.
        </p>
        <Link href="/">
          <Button variant="secondary">Kembali ke Dashboard</Button>
        </Link>
      </div>
    </div>
  );
}
