'use client';

import { useEffect, useState } from 'react';
import { Plus, Trash2, BookOpen, MapPin, CheckCircle, XCircle, Copy } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { Card, CardHeader, CardContent } from '@/components/ui/Card';
import { CANONICAL_FIELD_LABELS, ALL_CANONICAL_FIELDS, CanonicalField } from '@/domain/entities/BankMapping';
import type { FieldAlias } from '@/domain/entities/FieldAlias';

interface BackfillResult {
  scanned: number;
  candidates: number;
  updated: number;
}

interface DedupPreview {
  duplicateGroups: number;
  totalDuplicates: number;
}

export default function NormalizationPage() {
  const [aliases, setAliases] = useState<FieldAlias[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [aliasText, setAliasText] = useState('');
  const [canonicalField, setCanonicalField] = useState<CanonicalField | ''>('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [filterField, setFilterField] = useState('');
  const [backfilling, setBackfilling] = useState(false);
  const [backfillResult, setBackfillResult] = useState<BackfillResult | null>(null);
  const [backfillError, setBackfillError] = useState<string | null>(null);

  const [dedupPreview, setDedupPreview] = useState<DedupPreview | null>(null);
  const [dedupChecking, setDedupChecking] = useState(false);
  const [dedupRemoving, setDedupRemoving] = useState(false);
  const [dedupRemoved, setDedupRemoved] = useState<number | null>(null);
  const [dedupError, setDedupError] = useState<string | null>(null);

  const [crmTotal, setCrmTotal]       = useState<number | null>(null);
  const [crmDups, setCrmDups]         = useState<number | null>(null);
  const [crmChecking, setCrmChecking] = useState(false);
  const [crmRemoving, setCrmRemoving] = useState(false);
  const [crmRemoved, setCrmRemoved]   = useState<number | null>(null);
  const [crmError, setCrmError]       = useState<string | null>(null);

  async function handleBackfillCities() {
    if (!confirm('Normalisasi kota untuk semua asset yang belum memiliki data Kota?\n\nProses ini membaca kolom Alamat Lengkap dan mengisi Kota/Kecamatan secara otomatis.')) return;
    setBackfilling(true);
    setBackfillResult(null);
    setBackfillError(null);
    try {
      const res = await fetch('/api/admin/normalize-cities', { method: 'POST' });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error?.message ?? `Error ${res.status}`);
      setBackfillResult(json.data);
    } catch (e) {
      setBackfillError(e instanceof Error ? e.message : 'Gagal normalisasi');
    } finally {
      setBackfilling(false);
    }
  }

  async function handleDedupCheck() {
    setDedupChecking(true);
    setDedupPreview(null);
    setDedupRemoved(null);
    setDedupError(null);
    try {
      const res = await fetch('/api/admin/dedup');
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error?.message ?? `Error ${res.status}`);
      setDedupPreview({ duplicateGroups: json.data.duplicateGroups, totalDuplicates: json.data.totalDuplicates });
    } catch (e) {
      setDedupError(e instanceof Error ? e.message : 'Gagal cek duplikat');
    } finally {
      setDedupChecking(false);
    }
  }

  async function handleDedupRemove() {
    if (!confirm(`Hapus ${dedupPreview?.totalDuplicates} data kembar?\n\nData yang lebih lama akan dipertahankan, sisanya dinonaktifkan.`)) return;
    setDedupRemoving(true);
    setDedupError(null);
    try {
      const res = await fetch('/api/admin/dedup', { method: 'POST' });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error?.message ?? `Error ${res.status}`);
      setDedupRemoved(json.data.removed);
      setDedupPreview(null);
    } catch (e) {
      setDedupError(e instanceof Error ? e.message : 'Gagal hapus duplikat');
    } finally {
      setDedupRemoving(false);
    }
  }

  async function handleCrmCheck() {
    setCrmChecking(true);
    setCrmDups(null);
    setCrmTotal(null);
    setCrmRemoved(null);
    setCrmError(null);
    try {
      const res = await fetch('/api/admin/dedup-crm');
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error?.message ?? `Error ${res.status}`);
      setCrmTotal(json.data.totalRows);
      setCrmDups(json.data.duplicates);
    } catch (e) {
      setCrmError(e instanceof Error ? e.message : 'Gagal cek duplikat CRM');
    } finally {
      setCrmChecking(false);
    }
  }

  async function handleCrmRemove() {
    if (!confirm(`Proses ${crmDups} duplikat di CRM?\n\n• Data lama dipertahankan\n• Harga & Status diupdate dari data terbaru\n• Status Terjual → Tampilkan di Web = FALSE\n• Baris duplikat dihapus fisik`)) return;
    setCrmRemoving(true);
    setCrmError(null);
    try {
      const res = await fetch('/api/admin/dedup-crm', { method: 'POST' });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error?.message ?? `Error ${res.status}`);
      setCrmRemoved(json.data.removed);
      setCrmDups(null);
      setCrmTotal(null);
      // tampilkan pesan sukses dari server
      if (json.data.message) setCrmError(null);
    } catch (e) {
      setCrmError(e instanceof Error ? e.message : 'Gagal hapus duplikat CRM');
    } finally {
      setCrmRemoving(false);
    }
  }

  async function load() {
    setLoading(true);
    try {
      const res = await fetch('/api/field-aliases');
      const json = await res.json();
      setAliases(json.data ?? []);
    } catch {
      // silently ignore
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleSave() {
    if (!aliasText.trim()) { setFormError('Teks alias wajib diisi'); return; }
    if (!canonicalField) { setFormError('Field tujuan wajib dipilih'); return; }
    setSaving(true);
    setFormError('');
    try {
      const res = await fetch('/api/field-aliases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aliasText: aliasText.trim(), canonicalField }),
      });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.message ?? 'Gagal menyimpan');
      setShowForm(false);
      setAliasText('');
      setCanonicalField('');
      load();
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : 'Terjadi kesalahan');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string, text: string) {
    if (!confirm(`Hapus alias "${text}"?`)) return;
    try {
      await fetch(`/api/field-aliases/${id}`, { method: 'DELETE' });
      load();
    } catch {
      // silently ignore
    }
  }

  const filtered = filterField
    ? aliases.filter((a) => a.canonicalField === filterField)
    : aliases;

  return (
    <div className="p-6 space-y-5 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Kamus Normalisasi</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Alias kolom untuk normalisasi otomatis — sistem mengenali variasi nama kolom dari berbagai bank
          </p>
        </div>
        <Button size="sm" onClick={() => setShowForm((v) => !v)}>
          <Plus className="w-4 h-4" /> Tambah Alias
        </Button>
      </div>

      {/* ── Backfill kota dari alamat ────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h3 className="font-semibold text-gray-800 flex items-center gap-2">
                <MapPin className="w-4 h-4 text-blue-500" />
                Normalisasi Kota dari Alamat Lengkap
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">
                Mengisi kolom Kota/Kecamatan untuk asset lama yang hanya punya Alamat Lengkap.
                Mengenali nama kota penuh dan singkatan (SBY, SDA, GSK, dll).
              </p>
            </div>
            <Button
              variant="secondary"
              onClick={handleBackfillCities}
              loading={backfilling}
            >
              <MapPin className="w-4 h-4" />
              Jalankan Normalisasi
            </Button>
          </div>
        </CardHeader>

        {(backfillResult || backfillError) && (
          <CardContent className="pt-0">
            {backfillError && (
              <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                <XCircle className="w-4 h-4 shrink-0" />
                {backfillError}
              </div>
            )}
            {backfillResult && (
              <div className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3">
                <CheckCircle className="w-4 h-4 shrink-0" />
                <span>
                  Selesai — dipindai <strong>{backfillResult.scanned}</strong> asset,
                  ditemukan <strong>{backfillResult.candidates}</strong> kandidat,
                  diperbarui <strong>{backfillResult.updated}</strong> asset.
                  {backfillResult.updated === 0 && backfillResult.candidates === 0 && ' Semua asset sudah memiliki data Kota.'}
                </span>
              </div>
            )}
          </CardContent>
        )}
      </Card>

      {/* ── Hapus data kembar ───────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h3 className="font-semibold text-gray-800 flex items-center gap-2">
                <Copy className="w-4 h-4 text-red-500" />
                Hapus Data Kembar
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">
                Deteksi dan nonaktifkan aset duplikat berdasarkan bank + nama debitur + alamat.
                Data terbaru dipertahankan, data lama dinonaktifkan.
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={handleDedupCheck} loading={dedupChecking}>
                <Copy className="w-4 h-4" />
                Cek Duplikat
              </Button>
              {dedupPreview && dedupPreview.totalDuplicates > 0 && (
                <Button variant="danger" onClick={handleDedupRemove} loading={dedupRemoving}>
                  <Trash2 className="w-4 h-4" />
                  Hapus {dedupPreview.totalDuplicates} Data
                </Button>
              )}
            </div>
          </div>
        </CardHeader>

        {(dedupPreview !== null || dedupRemoved !== null || dedupError) && (
          <CardContent className="pt-0">
            {dedupError && (
              <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                <XCircle className="w-4 h-4 shrink-0" />
                {dedupError}
              </div>
            )}
            {dedupRemoved !== null && (
              <div className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3">
                <CheckCircle className="w-4 h-4 shrink-0" />
                Selesai — <strong>{dedupRemoved}</strong> data kembar berhasil dinonaktifkan.
              </div>
            )}
            {dedupPreview !== null && dedupRemoved === null && (
              dedupPreview.totalDuplicates === 0 ? (
                <div className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3">
                  <CheckCircle className="w-4 h-4 shrink-0" />
                  Tidak ada data kembar ditemukan.
                </div>
              ) : (
                <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
                  <Copy className="w-4 h-4 shrink-0" />
                  Ditemukan <strong>{dedupPreview.totalDuplicates}</strong> data kembar
                  dalam <strong>{dedupPreview.duplicateGroups}</strong> grup. Klik &quot;Hapus&quot; untuk membersihkan.
                </div>
              )
            )}
          </CardContent>
        )}
      </Card>

      {/* ── Hapus data kembar CRM ──────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h3 className="font-semibold text-gray-800 flex items-center gap-2">
                <Copy className="w-4 h-4 text-orange-500" />
                Hapus Data Kembar CRM
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">
                Deteksi dan hapus baris identik di sheet <strong>Assets</strong> CRM.
                Baris duplikat dihapus fisik, data asli tetap aman.
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={handleCrmCheck} loading={crmChecking}>
                <Copy className="w-4 h-4" />
                Cek Duplikat CRM
              </Button>
              {crmDups !== null && crmDups > 0 && (
                <Button variant="danger" onClick={handleCrmRemove} loading={crmRemoving}>
                  <Trash2 className="w-4 h-4" />
                  Hapus {crmDups} Baris
                </Button>
              )}
            </div>
          </div>
        </CardHeader>

        {(crmDups !== null || crmRemoved !== null || crmError) && (
          <CardContent className="pt-0">
            {crmError && (
              <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                <XCircle className="w-4 h-4 shrink-0" />
                {crmError}
              </div>
            )}
            {crmRemoved !== null && (
              <div className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3">
                <CheckCircle className="w-4 h-4 shrink-0" />
                Selesai — <strong>{crmRemoved}</strong> baris duplikat berhasil dihapus dari CRM.
              </div>
            )}
            {crmDups !== null && crmRemoved === null && (
              crmDups === 0 ? (
                <div className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3">
                  <CheckCircle className="w-4 h-4 shrink-0" />
                  Tidak ada duplikat di CRM. Total {crmTotal} baris.
                </div>
              ) : (
                <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
                  <Copy className="w-4 h-4 shrink-0" />
                  Ditemukan <strong>{crmDups}</strong> baris duplikat dari total <strong>{crmTotal}</strong> baris. Klik &quot;Hapus&quot; untuk membersihkan.
                </div>
              )
            )}
          </CardContent>
        )}
      </Card>

      {/* Add form */}
      {showForm && (
        <Card>
          <CardHeader>
            <h3 className="font-semibold text-gray-800">Alias Baru</h3>
          </CardHeader>
          <CardContent className="space-y-4">
            {formError && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{formError}</p>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Teks Alias (nama kolom di file bank)"
                placeholder="cth: 'Nilai Jaminan', 'Harga Lelang', 'Market Price'"
                value={aliasText}
                onChange={(e) => setAliasText(e.target.value)}
              />
              <Select
                label="Maps ke Field Standar"
                value={canonicalField}
                onChange={(e) => setCanonicalField(e.target.value as CanonicalField)}
              >
                <option value="">Pilih field...</option>
                {ALL_CANONICAL_FIELDS.map((f) => (
                  <option key={f} value={f}>{CANONICAL_FIELD_LABELS[f]}</option>
                ))}
              </Select>
            </div>
            <div className="flex gap-3 pt-1">
              <Button onClick={handleSave} loading={saving}>Simpan Alias</Button>
              <Button variant="secondary" onClick={() => { setShowForm(false); setFormError(''); }}>
                Batal
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filter */}
      {aliases.length > 0 && (
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-500">{filtered.length} alias</span>
          <select
            value={filterField}
            onChange={(e) => setFilterField(e.target.value)}
            className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Semua Field</option>
            {ALL_CANONICAL_FIELDS.map((f) => (
              <option key={f} value={f}>{CANONICAL_FIELD_LABELS[f]}</option>
            ))}
          </select>
        </div>
      )}

      {/* Alias list */}
      {loading ? (
        <div className="text-center py-12 text-gray-400 text-sm">Memuat...</div>
      ) : aliases.length === 0 ? (
        <Card>
          <CardContent>
            <div className="text-center py-14">
              <BookOpen className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 font-medium">Kamus masih kosong</p>
              <p className="text-sm text-gray-400 mt-1">
                Tambah alias untuk membantu sistem mengenali variasi nama kolom dari bank
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Teks Alias</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Field Standar</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600">Confidence</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 hidden md:table-cell">Sumber</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 hidden md:table-cell">Dibuat oleh</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((alias) => (
                  <tr key={alias.aliasId} className="hover:bg-gray-50/60 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-900">{alias.aliasText}</td>
                    <td className="px-4 py-3 text-gray-700">
                      {CANONICAL_FIELD_LABELS[alias.canonicalField] ?? alias.canonicalField}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <ConfidenceBadge value={alias.confidence} />
                    </td>
                    <td className="px-4 py-3 text-gray-500 hidden md:table-cell">
                      <Badge variant={alias.source === 'MANUAL' ? 'info' : 'default'}>
                        {alias.source}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs hidden md:table-cell">
                      {alias.createdBy}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleDelete(alias.aliasId, alias.aliasText)}
                        className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                        title="Hapus alias"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

function ConfidenceBadge({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const variant = pct >= 90 ? 'success' : pct >= 70 ? 'warning' : 'danger';
  return <Badge variant={variant}>{pct}%</Badge>;
}
