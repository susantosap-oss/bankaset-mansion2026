'use client';

import { useCallback, useEffect, useState } from 'react';
import { Search, RefreshCw, Building2, Bot, Upload } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { formatCurrency } from '@/lib/utils';
import { ASSET_TYPE_LABELS } from '@/domain/value-objects/AssetType';
import { ASSET_STATUS_LABELS } from '@/domain/value-objects/AssetStatus';
import { AIAnalysisPanel } from '@/components/ai/AIAnalysisPanel';
import type { Asset } from '@/domain/entities/Asset';

const STATUS_BADGE: Record<string, 'success' | 'warning' | 'danger' | 'default'> = {
  ACTIVE: 'success',
  IN_PROCESS: 'warning',
  SOLD: 'default',
  NPL: 'danger',
};

function fmtRp(v: number | undefined): string {
  if (!v) return '—';
  return formatCurrency(v);
}

function fmtRatio(v: number | undefined): string {
  if (v == null) return '—';
  return v.toFixed(1);
}

interface PaginatedAssets {
  data: Asset[];
  total: number;
  page: number;
  totalPages: number;
  limit: number;
}

export default function AssetsPage() {
  const [assets, setAssets] = useState<PaginatedAssets | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [bankFilter, setBankFilter] = useState('');
  const [cityFilter, setCityFilter] = useState('');
  const [page, setPage] = useState(1);
  const [banks, setBanks] = useState<string[]>([]);
  const [cities, setCities] = useState<string[]>([]);
  const [aiAsset, setAiAsset] = useState<Asset | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportMsg, setExportMsg] = useState<string | null>(null);

  const fetchAssets = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (bankFilter) params.set('bankName', bankFilter);
      if (cityFilter) params.set('city', cityFilter);
      params.set('page', String(page));
      params.set('limit', '20');
      const res = await fetch(`/api/assets?${params}`);
      const json = await res.json();
      if (json.data !== undefined) {
        setAssets({
          data: json.data,
          total: json.meta?.total ?? json.total ?? 0,
          page: json.meta?.page ?? json.page ?? 1,
          totalPages: json.meta?.totalPages ?? json.totalPages ?? 1,
          limit: json.meta?.limit ?? json.limit ?? 20,
        });
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [search, bankFilter, cityFilter, page]);

  useEffect(() => {
    fetch('/api/dashboard').then(r => r.json()).then(json => {
      if (json.data?.banks) setBanks(json.data.banks);
      if (json.data?.cities) setCities(json.data.cities);
    }).catch(() => {});
  }, []);

  useEffect(() => { fetchAssets(); }, [fetchAssets]);

  async function handleExportSsot() {
    setExporting(true);
    setExportMsg(null);
    try {
      const res = await fetch('/api/admin/export-ssot', { method: 'POST' });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error?.message ?? `Error ${res.status}`);
      setExportMsg(`✓ ${json.data.exported} asset disimpan ke sheet "${json.data.sheet}"`);
    } catch (e) {
      setExportMsg(`✗ ${e instanceof Error ? e.message : 'Export gagal'}`);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="p-6 space-y-5">
      {aiAsset && <AIAnalysisPanel asset={aiAsset} onClose={() => setAiAsset(null)} />}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Asset Bank</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {assets ? `${assets.total} asset` : 'Memuat...'}{' '}
            <span className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5 ml-1">
              Rasio Sisa Pokok ≥ 2 · LTV ≥ 1%
            </span>
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={fetchAssets}>
              <RefreshCw className="w-4 h-4" /> Refresh
            </Button>
            <Button variant="secondary" size="sm" onClick={handleExportSsot} loading={exporting}>
              <Upload className="w-4 h-4" /> Simpan ke Sheet CRM
            </Button>
          </div>
          {exportMsg && (
            <p className={`text-xs ${exportMsg.startsWith('✓') ? 'text-emerald-600' : 'text-red-600'}`}>
              {exportMsg}
            </p>
          )}
        </div>
      </div>

      {/* Filters */}
      <form onSubmit={(e) => { e.preventDefault(); setPage(1); fetchAssets(); }}
        className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text" placeholder="Cari alamat, kota, debitur..."
            value={search} onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <select value={bankFilter} onChange={(e) => { setBankFilter(e.target.value); setPage(1); }}
          className="px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">Semua Bank</option>
          {banks.map(b => <option key={b} value={b}>{b}</option>)}
        </select>
        <select value={cityFilter} onChange={(e) => { setCityFilter(e.target.value); setPage(1); }}
          className="px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">Semua Kota</option>
          {cities.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <Button type="submit" size="sm">Cari</Button>
      </form>

      {/* Table */}
      {loading ? (
        <div className="text-center py-16 text-gray-400 text-sm">Memuat data asset...</div>
      ) : assets?.data.length === 0 ? (
        <Card><CardContent>
          <div className="text-center py-16">
            <Building2 className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">Belum ada asset</p>
            <p className="text-sm text-gray-400 mt-1">Import file Excel/CSV dari halaman Import Asset</p>
          </div>
        </CardContent></Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-3 py-2 font-medium text-gray-500 whitespace-nowrap">Bank</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-500 whitespace-nowrap">Tipe</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-500 whitespace-nowrap">Kota</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-500">Alamat</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-500 whitespace-nowrap">Debitur</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-500 whitespace-nowrap">Nilai Pasar</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-500 whitespace-nowrap">Outstanding</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-500 whitespace-nowrap">Sisa Pokok</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-500 whitespace-nowrap">Rasio</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-500 whitespace-nowrap">Likuidasi</th>
                  <th className="text-center px-3 py-2 font-medium text-gray-500 whitespace-nowrap">Status</th>
                  <th className="px-2 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {assets?.data.map((asset) => (
                  <tr key={asset.assetId} className="hover:bg-gray-50/60 transition-colors align-top">
                    <td className="px-3 py-2 font-medium text-gray-900 whitespace-nowrap">{asset.bankName}</td>
                    <td className="px-3 py-2 text-gray-600 whitespace-nowrap">
                      {ASSET_TYPE_LABELS[asset.assetType] ?? asset.assetType}
                    </td>
                    <td className="px-3 py-2 text-gray-700 whitespace-nowrap">
                      <div>{asset.city}</div>
                      {asset.district && <div className="text-gray-400">{asset.district}</div>}
                    </td>
                    <td className="px-3 py-2 text-gray-600 max-w-[220px] leading-snug">
                      {asset.address || '—'}
                    </td>
                    <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{asset.debtorName || '—'}</td>
                    <td className="px-3 py-2 text-right font-medium text-gray-900 whitespace-nowrap">
                      {fmtRp(asset.marketValue)}
                    </td>
                    <td className="px-3 py-2 text-right text-gray-700 whitespace-nowrap">
                      {fmtRp(asset.outstanding)}
                    </td>
                    <td className="px-3 py-2 text-right text-gray-700 whitespace-nowrap">
                      {fmtRp(asset.principalOutstanding)}
                    </td>
                    <td className="px-3 py-2 text-right text-gray-500 whitespace-nowrap">
                      {fmtRatio(asset.liquidationRatio)}
                    </td>
                    <td className="px-3 py-2 text-right text-gray-700 whitespace-nowrap">
                      {fmtRp(asset.liquidationValue)}
                    </td>
                    <td className="px-3 py-2 text-center whitespace-nowrap">
                      <Badge variant={STATUS_BADGE[asset.status] ?? 'default'}>
                        {ASSET_STATUS_LABELS[asset.status] ?? asset.status}
                      </Badge>
                    </td>
                    <td className="px-2 py-2">
                      <button
                        onClick={() => setAiAsset(asset)}
                        className="p-1 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                        title="Analisis AI"
                      >
                        <Bot className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {assets && assets.totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
              <p className="text-xs text-gray-500">
                {(assets.page - 1) * assets.limit + 1}–{Math.min(assets.page * assets.limit, assets.total)} dari {assets.total}
              </p>
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" disabled={assets.page <= 1}
                  onClick={() => setPage(p => p - 1)}>Prev</Button>
                <Button variant="secondary" size="sm" disabled={assets.page >= assets.totalPages}
                  onClick={() => setPage(p => p + 1)}>Next</Button>
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
