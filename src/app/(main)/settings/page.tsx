'use client';

import Link from 'next/link';
import { Upload, FileText, GitBranch, BookOpen, ArrowRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/Card';

const TOOLS = [
  {
    href: '/import',
    icon: Upload,
    color: 'bg-blue-50 text-blue-600',
    border: 'hover:border-blue-300',
    title: 'Import Asset',
    desc: 'Upload file Excel atau CSV dari bank. Sistem akan memandu mapping kolom dan preview data sebelum disimpan.',
  },
  {
    href: '/pdf-import',
    icon: FileText,
    color: 'bg-violet-50 text-violet-600',
    border: 'hover:border-violet-300',
    title: 'Import PDF',
    desc: 'Ekstrak data asset dari dokumen PDF laporan bank menggunakan AI. Mendukung berbagai format layout.',
  },
  {
    href: '/mappings',
    icon: GitBranch,
    color: 'bg-amber-50 text-amber-600',
    border: 'hover:border-amber-300',
    title: 'Mapping Kolom',
    desc: 'Kelola template pemetaan kolom per bank. Simpan sekali, dipakai otomatis di import berikutnya.',
  },
  {
    href: '/normalization',
    icon: BookOpen,
    color: 'bg-emerald-50 text-emerald-600',
    border: 'hover:border-emerald-300',
    title: 'Normalisasi',
    desc: 'Atur alias nama kota, kecamatan, dan tipe aset agar data dari berbagai bank terstandardisasi.',
  },
];

export default function SettingsPage() {
  return (
    <div className="p-4 md:p-6 space-y-6 max-w-4xl">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">Pengaturan</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          Tools pengelolaan data — import, mapping, dan normalisasi aset bank.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {TOOLS.map((tool) => (
          <Link key={tool.href} href={tool.href}>
            <Card className={`h-full cursor-pointer border transition-colors ${tool.border}`}>
              <CardContent className="p-5 flex flex-col gap-3 h-full">
                <div className="flex items-start justify-between">
                  <span className={`inline-flex items-center justify-center w-10 h-10 rounded-xl ${tool.color}`}>
                    <tool.icon className="w-5 h-5" />
                  </span>
                  <ArrowRight className="w-4 h-4 text-gray-300 mt-1" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-gray-900">{tool.title}</p>
                  <p className="text-xs text-gray-500 mt-1 leading-relaxed">{tool.desc}</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
