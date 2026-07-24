'use client';

import { useEffect, useState, useCallback } from 'react';
import { KPICard } from '@/components/dashboard/KPICard';
import { Building2, Landmark, MapPin, TrendingUp, ShoppingBag, Upload } from 'lucide-react';
import { ASSET_TYPE_LABELS } from '@/domain/value-objects/AssetType';
import { Button } from '@/components/ui/Button';

interface DashboardData {
  totalAssets: number;
  totalSellable: number;
  totalBanks: number;
  totalCities: number;
  banks: string[];
  cities: string[];
  assetsByType: { type: string; count: number }[];
  assetsByCity: { city: string; count: number }[];
}

function BarChart({ items, total }: { items: { label: string; count: number }[]; total: number }) {
  if (items.length === 0) {
    return <p className="text-sm text-gray-400 text-center py-8">Belum ada data.</p>;
  }
  const max = Math.max(...items.map((i) => i.count), 1);
  return (
    <div className="space-y-2.5">
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-3">
          <span className="text-xs text-gray-600 w-28 shrink-0 truncate capitalize">{item.label}</span>
          <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
            <div
              className="h-2 rounded-full bg-blue-500 transition-all"
              style={{ width: `${(item.count / max) * 100}%` }}
            />
          </div>
          <span className="text-xs text-gray-500 w-12 text-right shrink-0">
            {item.count}
            <span className="text-gray-400 ml-1">({total > 0 ? Math.round((item.count / total) * 100) : 0}%)</span>
          </span>
        </div>
      ))}
    </div>
  );
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportMsg, setExportMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/dashboard');
      if (!res.ok) return;
      const json = await res.json();
      setData(json.data);
    } catch { /* silent */ }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleExport() {
    setExporting(true);
    setExportMsg(null);
    try {
      const res = await fetch('/api/admin/export-ssot', { method: 'POST' });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error?.message ?? `Error ${res.status}`);
      setExportMsg({ ok: true, text: `${json.data.exported} asset berhasil disimpan ke sheet "${json.data.sheet}"` });
    } catch (e) {
      setExportMsg({ ok: false, text: e instanceof Error ? e.message : 'Export gagal' });
    } finally {
      setExporting(false);
    }
  }

  const total = data?.totalSellable ?? 0;

  const typeItems = (data?.assetsByType ?? []).map((t) => ({
    label: ASSET_TYPE_LABELS[t.type as keyof typeof ASSET_TYPE_LABELS] ?? t.type,
    count: t.count,
  }));

  const cityItems = (data?.assetsByCity ?? []).map((c) => ({
    label: c.city,
    count: c.count,
  }));

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Dashboard</h2>
          <p className="text-sm text-gray-500 mt-1">Overview asset bank lelang wilayah Jawa Timur</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Button variant="secondary" size="sm" onClick={handleExport} loading={exporting}>
            <Upload className="w-4 h-4" />
            Simpan Asset Sellable ke Sheet
          </Button>
          {exportMsg && (
            <p className={`text-xs ${exportMsg.ok ? 'text-emerald-600' : 'text-red-600'}`}>
              {exportMsg.text}
            </p>
          )}
        </div>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <KPICard
          label="Total Asset"
          value={data?.totalAssets ?? '—'}
          sub="Semua yang diimport"
          color="gray"
          icon={<Building2 className="w-6 h-6 text-gray-500" />}
        />
        <KPICard
          label="Asset Sellable"
          value={data?.totalSellable ?? '—'}
          sub="Lolos filter kualitas"
          color="blue"
          icon={<ShoppingBag className="w-6 h-6 text-blue-500" />}
        />
        <KPICard
          label="Bank Partner"
          value={data?.totalBanks ?? '—'}
          sub="Bank terdaftar"
          color="emerald"
          icon={<Landmark className="w-6 h-6 text-emerald-500" />}
        />
        <KPICard
          label="Kota / Area"
          value={data?.totalCities ?? '—'}
          sub="Kota terdaftar"
          color="amber"
          icon={<MapPin className="w-6 h-6 text-amber-500" />}
        />
      </div>

      {/* Distribution charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="font-semibold text-gray-700 mb-4">Asset per Kota <span className="text-xs font-normal text-gray-400">(sellable)</span></h3>
          <BarChart items={cityItems} total={total} />
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="font-semibold text-gray-700 mb-4">Asset per Tipe <span className="text-xs font-normal text-gray-400">(sellable)</span></h3>
          <BarChart items={typeItems} total={total} />
        </div>
      </div>

      {/* Bank list */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="font-semibold text-gray-700 mb-4">Bank Partner</h3>
        {(data?.banks ?? []).length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {data!.banks.map((b) => (
              <span key={b} className="text-xs bg-gray-100 text-gray-700 px-3 py-1.5 rounded-full font-medium">
                {b}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-400 text-center py-8">Belum ada data. Import asset untuk memulai.</p>
        )}
      </div>
    </div>
  );
}
