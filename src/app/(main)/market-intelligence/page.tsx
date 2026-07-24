'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, Save, XCircle, RefreshCw, Sparkles, CheckCircle, Globe, Brain, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardHeader, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { ASSET_TYPE_LABELS } from '@/domain/value-objects/AssetType';

interface AreaEntry {
  areaId: string;
  area: string;
  city: string;
  final: { demandScore: number; liquidityScore: number; medianPrice: number; source: string };
  external: { sourceNote?: string; updatedAt?: string; updatedBy?: string } | null;
}

interface Stats {
  totalActive: number;
  assetsByType: { type: string; count: number }[];
  assetsByCity: { city: string; count: number }[];
}

interface NewAreaForm {
  area: string;
  city: string;
  demandScore: string;
  liquidityScore: string;
  medianPrice: string;
  sourceNote: string;
}

interface ResearchResult {
  area: string;
  city: string;
  suggestedDemandScore: number;
  suggestedLiquidityScore: number;
  suggestedMedianPrice: number;
  reasoning: string;
  sources: string[];
  method: 'GROQ_KNOWLEDGE' | 'PORTAL_DATA';
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  areaWasSuggested: boolean;
  portalStats?: { portal: string; listingCount: number; medianPrice: number }[];
  alternatives?: ResearchResult[];
}

const EMPTY_FORM: NewAreaForm = {
  area: '', city: '', demandScore: '50', liquidityScore: '50', medianPrice: '', sourceNote: '',
};

// ── Sub-components ─────────────────────────────────────────────────
function BarChart({ items, total, colorClass = 'bg-blue-500' }: {
  items: { label: string; count: number }[];
  total: number;
  colorClass?: string;
}) {
  if (items.length === 0) return <p className="text-sm text-gray-400 text-center py-6">Belum ada data.</p>;
  const max = Math.max(...items.map((i) => i.count), 1);
  return (
    <div className="space-y-2.5">
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-3">
          <span className="text-xs text-gray-600 w-28 shrink-0 truncate capitalize">{item.label}</span>
          <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
            <div className={`h-2 rounded-full ${colorClass} transition-all`} style={{ width: `${(item.count / max) * 100}%` }} />
          </div>
          <span className="text-xs text-gray-500 w-16 text-right shrink-0">
            {item.count} <span className="text-gray-400">({total > 0 ? Math.round((item.count / total) * 100) : 0}%)</span>
          </span>
        </div>
      ))}
    </div>
  );
}

function ScoreBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-gray-100 rounded-full h-1.5 overflow-hidden">
        <div className={`h-1.5 rounded-full ${color}`} style={{ width: `${value}%` }} />
      </div>
      <span className="text-xs text-gray-600 w-6 text-right">{value}</span>
    </div>
  );
}

function ConfidenceBadge({ confidence }: { confidence: string }) {
  if (confidence === 'HIGH') return <Badge variant="success">Tinggi</Badge>;
  if (confidence === 'MEDIUM') return <Badge variant="warning">Sedang</Badge>;
  return <Badge variant="danger">Rendah</Badge>;
}

function StatBox({ label, value, color, suffix = '' }: {
  label: string; value: number | string; color: string; suffix?: string;
}) {
  const colors: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-700',
    emerald: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-700',
    gray: 'bg-gray-50 text-gray-700',
  };
  return (
    <div className={`rounded-xl p-4 ${colors[color] ?? colors.gray}`}>
      <p className="text-2xl font-bold">{value}{suffix}</p>
      <p className="text-xs font-medium mt-0.5">{label}</p>
    </div>
  );
}

// ── Research Approval Card ─────────────────────────────────────────
function ResearchCard({
  result,
  form,
  onUpdateForm,
  onApprove,
  onDismiss,
  saving,
}: {
  result: ResearchResult;
  form: NewAreaForm;
  onUpdateForm: (f: Partial<NewAreaForm>) => void;
  onApprove: () => void;
  onDismiss: () => void;
  saving: boolean;
}) {
  const allResults = [result, ...(result.alternatives ?? [])];
  const [selectedIdx, setSelectedIdx] = useState(0);
  const active = allResults[selectedIdx] ?? result;

  function selectAlt(idx: number) {
    const r = allResults[idx];
    setSelectedIdx(idx);
    onUpdateForm({
      area: r.area,
      demandScore: String(r.suggestedDemandScore),
      liquidityScore: String(r.suggestedLiquidityScore),
      medianPrice: r.suggestedMedianPrice > 0 ? String(r.suggestedMedianPrice) : '',
    });
  }

  return (
    <div className="rounded-xl border-2 border-blue-200 bg-blue-50/60 p-5 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          {active.method === 'PORTAL_DATA'
            ? <Globe className="w-4 h-4 text-blue-600 shrink-0" />
            : <Brain className="w-4 h-4 text-blue-600 shrink-0" />}
          <div>
            <p className="text-sm font-semibold text-blue-800">
              {result.areaWasSuggested ? `Rekomendasi Area AI — ${result.city}` : `Hasil Riset AI — ${active.area}, ${active.city}`}
            </p>
            <p className="text-xs text-blue-600">
              {active.method === 'PORTAL_DATA'
                ? `Data Portal (rumah123 · lamudi · OLX)`
                : 'Estimasi Groq Knowledge'} ·{' '}
              Keyakinan: <ConfidenceBadge confidence={active.confidence} />
            </p>
          </div>
        </div>
        <button onClick={onDismiss} className="text-blue-400 hover:text-blue-600 p-1">
          <XCircle className="w-4 h-4" />
        </button>
      </div>

      {/* Alternative area tabs — shown when AI suggests area */}
      {result.areaWasSuggested && allResults.length > 1 && (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-blue-700">Pilih kecamatan — klik untuk bandingkan</p>
          <div className="flex flex-wrap gap-2">
            {allResults.map((r, i) => (
              <button
                key={i}
                onClick={() => selectAlt(i)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  selectedIdx === i
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-blue-700 border-blue-200 hover:bg-blue-50'
                }`}
              >
                {r.area}
                <span className={`ml-1.5 ${selectedIdx === i ? 'text-blue-200' : 'text-blue-400'}`}>
                  D:{r.suggestedDemandScore}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Editable area name (for suggested or single-area) */}
      {result.areaWasSuggested && (
        <div className="rounded-lg bg-blue-100/60 border border-blue-200 px-4 py-3 space-y-1">
          <p className="text-xs font-semibold text-blue-700">Area yang Dipilih — edit jika perlu</p>
          <input
            type="text"
            value={form.area}
            onChange={(e) => onUpdateForm({ area: e.target.value })}
            placeholder="Nama kecamatan / area..."
            className="w-full rounded-lg border border-blue-300 bg-white px-3 py-2 text-sm font-medium text-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>
      )}

      {/* AI Reasoning */}
      <div className="rounded-lg bg-white border border-blue-100 px-4 py-3 text-sm text-gray-700 leading-relaxed">
        {active.reasoning}
      </div>

      {/* Portal stats */}
      {active.portalStats && active.portalStats.some((p) => p.listingCount > 0) && (
        <div className="rounded-lg bg-white border border-blue-100 px-4 py-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Estimasi Listing Aktif per Portal
          </p>
          <div className="grid grid-cols-3 gap-2">
            {active.portalStats.map((p) => (
              <div key={p.portal} className="text-center">
                <p className="text-xs text-gray-400 truncate">{p.portal}</p>
                <p className="text-sm font-bold text-blue-700">
                  {p.listingCount > 0 ? `~${p.listingCount.toLocaleString('id-ID')} listing` : '—'}
                </p>
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-2">* Harga median per m² diisi manual setelah approve</p>
        </div>
      )}

      {/* Sources */}
      {active.sources.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {active.sources.slice(0, 4).map((src, i) => {
            const domain = new URL(src).hostname.replace('www.', '');
            return (
              <a key={i} href={src} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs bg-white border border-blue-200 text-blue-700 px-2 py-1 rounded-full hover:bg-blue-100 transition-colors">
                {domain} <ExternalLink className="w-2.5 h-2.5" />
              </a>
            );
          })}
        </div>
      )}

      {/* Suggested scores — editable before approving */}
      <div className="bg-white rounded-xl border border-blue-100 p-4 space-y-3">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Skor yang Disarankan — Edit jika perlu</p>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-gray-500 block mb-1">Demand Score</label>
            <input type="number" min="0" max="100"
              value={form.demandScore}
              onChange={(e) => onUpdateForm({ demandScore: e.target.value })}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold text-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Liquidity Score</label>
            <input type="number" min="0" max="100"
              value={form.liquidityScore}
              onChange={(e) => onUpdateForm({ liquidityScore: e.target.value })}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold text-emerald-700 focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Median Harga (Rp)</label>
            <input type="number" min="0"
              value={form.medianPrice}
              onChange={(e) => onUpdateForm({ medianPrice: e.target.value })}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">Catatan Sumber</label>
          <input type="text"
            value={form.sourceNote}
            onChange={(e) => onUpdateForm({ sourceNote: e.target.value })}
            placeholder={`Riset AI (${active.method === 'PORTAL_DATA' ? 'Portal Data' : 'Groq Knowledge'}) — ${new Date().toLocaleDateString('id-ID')}`}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onDismiss}>Tolak</Button>
        <Button onClick={onApprove} loading={saving}>
          <CheckCircle className="w-4 h-4" /> Approve & Simpan
        </Button>
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────
export default function MarketIntelligencePage() {
  const [areas, setAreas] = useState<AreaEntry[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [researching, setResearching] = useState(false);
  const [researchingRowId, setResearchingRowId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<NewAreaForm>(EMPTY_FORM);
  const [pendingResearch, setPendingResearch] = useState<ResearchResult | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/market-intelligence');
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error?.message ?? `Error ${res.status}`);
      setAreas(json.data.areas);
      setStats(json.data.stats);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Riset AI untuk form tambah baru
  async function handleResearch() {
    if (!form.city.trim()) {
      setError('Isi Kota terlebih dahulu (area boleh kosong — AI akan menyarankan)');
      return;
    }
    setResearching(true);
    setError(null);
    setPendingResearch(null);
    try {
      const res = await fetch('/api/market-intelligence/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          area: form.area.trim() || undefined,
          city: form.city.trim(),
        }),
      });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error?.message ?? `Error ${res.status}`);
      const result: ResearchResult = json.data;
      setForm((f) => ({
        ...f,
        area: result.areaWasSuggested ? result.area : f.area,
        demandScore: String(result.suggestedDemandScore),
        liquidityScore: String(result.suggestedLiquidityScore),
        medianPrice: result.suggestedMedianPrice > 0 ? String(result.suggestedMedianPrice) : f.medianPrice,
        sourceNote: f.sourceNote || `Riset AI (${result.method === 'PORTAL_DATA' ? 'Portal Data' : 'Groq'}) — ${new Date().toLocaleDateString('id-ID')}`,
      }));
      setPendingResearch(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Riset gagal');
    } finally {
      setResearching(false);
    }
  }

  // Riset AI untuk area yang sudah ada di tabel
  async function handleResearchRow(a: AreaEntry) {
    setResearchingRowId(a.areaId);
    setError(null);
    setPendingResearch(null);
    setShowForm(true);
    setForm({
      area: a.area,
      city: a.city,
      demandScore: String(a.final.demandScore),
      liquidityScore: String(a.final.liquidityScore),
      medianPrice: a.final.medianPrice > 0 ? String(a.final.medianPrice) : '',
      sourceNote: '',
    });
    try {
      const res = await fetch('/api/market-intelligence/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ area: a.area, city: a.city }),
      });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error?.message ?? `Error ${res.status}`);
      const result: ResearchResult = json.data;
      setForm((f) => ({
        ...f,
        demandScore: String(result.suggestedDemandScore),
        liquidityScore: String(result.suggestedLiquidityScore),
        medianPrice: result.suggestedMedianPrice > 0 ? String(result.suggestedMedianPrice) : f.medianPrice,
        sourceNote: `Riset AI (${result.method === 'PORTAL_DATA' ? 'Portal Data' : 'Groq'}) — ${new Date().toLocaleDateString('id-ID')}`,
      }));
      setPendingResearch(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Riset gagal');
    } finally {
      setResearchingRowId(null);
    }
  }

  async function handleSave() {
    const demandScore = parseInt(form.demandScore);
    const liquidityScore = parseInt(form.liquidityScore);
    if (!form.area.trim() || !form.city.trim()) { setError('Area dan Kota wajib diisi'); return; }
    if (isNaN(demandScore) || demandScore < 0 || demandScore > 100) { setError('Demand Score harus 0-100'); return; }
    if (isNaN(liquidityScore) || liquidityScore < 0 || liquidityScore > 100) { setError('Liquidity Score harus 0-100'); return; }

    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/market-intelligence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          area: form.area.trim(),
          city: form.city.trim().toLowerCase(),
          demandScore,
          liquidityScore,
          medianPrice: form.medianPrice ? parseInt(form.medianPrice) : 0,
          sourceNote: form.sourceNote,
        }),
      });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error?.message ?? `Error ${res.status}`);
      setForm(EMPTY_FORM);
      setShowForm(false);
      setPendingResearch(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menyimpan');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(areaId: string) {
    if (!confirm('Hapus entry ini?')) return;
    try {
      const res = await fetch(`/api/market-intelligence/${areaId}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error?.message ?? `Error ${res.status}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menghapus');
    }
  }

  const total = stats?.totalActive ?? 0;
  const typeItems = (stats?.assetsByType ?? []).map((t) => ({
    label: ASSET_TYPE_LABELS[t.type as keyof typeof ASSET_TYPE_LABELS] ?? t.type,
    count: t.count,
  }));
  const cityItems = (stats?.assetsByCity ?? []).map((c) => ({ label: c.city, count: c.count }));
  const avgDemand = areas.length > 0 ? Math.round(areas.reduce((s, a) => s + a.final.demandScore, 0) / areas.length) : 0;
  const avgLiquidity = areas.length > 0 ? Math.round(areas.reduce((s, a) => s + a.final.liquidityScore, 0) / areas.length) : 0;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Market Intelligence</h2>
          <p className="text-sm text-gray-500 mt-1">Distribusi asset & skor pasar per wilayah</p>
        </div>
        <Button variant="secondary" onClick={load} disabled={loading}>
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 flex gap-2 items-start">
          <XCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatBox label="Total Asset Aktif" value={total} color="blue" />
        <StatBox label="Area Dipantau" value={areas.length} color="emerald" />
        <StatBox label="Avg Demand Score" value={avgDemand} color="amber" suffix="/100" />
        <StatBox label="Avg Liquidity Score" value={avgLiquidity} color="gray" suffix="/100" />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><h3 className="font-semibold text-gray-700">Asset per Kota</h3></CardHeader>
          <CardContent>
            {loading ? <div className="h-24 animate-pulse bg-gray-100 rounded" /> : <BarChart items={cityItems} total={total} colorClass="bg-blue-500" />}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><h3 className="font-semibold text-gray-700">Asset per Tipe</h3></CardHeader>
          <CardContent>
            {loading ? <div className="h-24 animate-pulse bg-gray-100 rounded" /> : <BarChart items={typeItems} total={total} colorClass="bg-emerald-500" />}
          </CardContent>
        </Card>
      </div>

      {/* Area Intelligence table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-gray-700">Area Intelligence</h3>
              <p className="text-xs text-gray-400 mt-0.5">Skor demand & likuiditas untuk kalkulasi grade asset</p>
            </div>
            <Button onClick={() => { setShowForm(true); setForm(EMPTY_FORM); setPendingResearch(null); }}>
              <Plus className="w-4 h-4" /> Tambah Area
            </Button>
          </div>
        </CardHeader>

        {/* Add/Edit form */}
        {showForm && (
          <div className="px-5 pb-4 border-b border-gray-100 space-y-4">
            {/* Basic inputs */}
            <div className="bg-gray-50 rounded-xl p-4 space-y-3">
              <p className="text-xs font-semibold text-gray-600">Tambah / Update Area</p>
              <div className="grid grid-cols-2 gap-3">
                <Input id="area" label="Kecamatan / Area" placeholder="cth: Rungkut"
                  value={form.area} onChange={(e) => setForm((f) => ({ ...f, area: e.target.value }))} />
                <Input id="city" label="Kota" placeholder="cth: surabaya"
                  value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} />
              </div>

              {/* Riset AI button */}
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  onClick={handleResearch}
                  loading={researching}
                  disabled={!form.city.trim()}
                >
                  <Sparkles className="w-4 h-4 text-blue-500" />
                  Riset AI Otomatis
                </Button>
                <span className="text-xs text-gray-400 self-center">
                  {form.area.trim()
                    ? `Analisis area "${form.area.trim()}"`
                    : 'Area kosong → AI akan suggest kecamatan terbaik'}
                </span>
              </div>

              {/* Manual score inputs — hidden jika ada pending research (tampil di ResearchCard) */}
              {!pendingResearch && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <Input id="demand" label="Demand Score (0-100)" type="number"
                    value={form.demandScore} onChange={(e) => setForm((f) => ({ ...f, demandScore: e.target.value }))} />
                  <Input id="liquidity" label="Liquidity Score (0-100)" type="number"
                    value={form.liquidityScore} onChange={(e) => setForm((f) => ({ ...f, liquidityScore: e.target.value }))} />
                  <Input id="median" label="Median Harga (Rp)" type="number"
                    value={form.medianPrice} onChange={(e) => setForm((f) => ({ ...f, medianPrice: e.target.value }))} />
                  <Input id="note" label="Catatan Sumber"
                    value={form.sourceNote} onChange={(e) => setForm((f) => ({ ...f, sourceNote: e.target.value }))} />
                </div>
              )}

              {!pendingResearch && (
                <div className="flex gap-2 justify-end">
                  <Button variant="secondary" onClick={() => { setShowForm(false); setPendingResearch(null); }}>Batal</Button>
                  <Button onClick={handleSave} loading={saving}>
                    <Save className="w-4 h-4" /> Simpan Manual
                  </Button>
                </div>
              )}
            </div>

            {/* Pending research approval card */}
            {pendingResearch && (
              <ResearchCard
                result={pendingResearch}
                form={form}
                onUpdateForm={(partial) => setForm((f) => ({ ...f, ...partial }))}
                onApprove={handleSave}
                onDismiss={() => setPendingResearch(null)}
                saving={saving}
              />
            )}
          </div>
        )}

        {/* Table */}
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-2">
              {[1, 2, 3].map((i) => <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />)}
            </div>
          ) : areas.length === 0 ? (
            <div className="p-10 text-center">
              <p className="text-sm text-gray-400">Belum ada data area intelligence.</p>
              <p className="text-xs text-gray-400 mt-1">Klik "Tambah Area" lalu "Riset AI Otomatis" untuk mulai.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Area</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Kota</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 w-36">Demand</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 w-36">Liquidity</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Median Harga</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Catatan</th>
                    <th className="px-4 py-3 w-20"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {areas.map((a) => (
                    <tr key={a.areaId} className="hover:bg-gray-50/60 group">
                      <td className="px-4 py-3 font-medium text-gray-800 capitalize">{a.area}</td>
                      <td className="px-4 py-3"><Badge variant="info">{a.city}</Badge></td>
                      <td className="px-4 py-3"><ScoreBar value={a.final.demandScore} color="bg-blue-500" /></td>
                      <td className="px-4 py-3"><ScoreBar value={a.final.liquidityScore} color="bg-emerald-500" /></td>
                      <td className="px-4 py-3 text-gray-600 text-xs">
                        {a.final.medianPrice > 0 ? `Rp ${(a.final.medianPrice / 1_000_000).toFixed(0)}jt/m²` : '—'}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-400 max-w-[160px] truncate">
                        {a.external?.sourceNote || '—'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => handleResearchRow(a)}
                            disabled={researchingRowId === a.areaId}
                            className="p-1.5 rounded-lg text-blue-400 hover:text-blue-600 hover:bg-blue-50 transition-colors disabled:opacity-40"
                            title="Riset ulang dengan AI"
                          >
                            {researchingRowId === a.areaId
                              ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                              : <Sparkles className="w-3.5 h-3.5" />}
                          </button>
                          <button
                            onClick={() => handleDelete(a.areaId)}
                            className="p-1.5 rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                            title="Hapus"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
