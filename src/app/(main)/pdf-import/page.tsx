'use client';

import { useState, useRef, useCallback } from 'react';
import { FileText, CheckCircle, XCircle, ChevronRight, RotateCcw, ExternalLink, AlertTriangle, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { Card, CardHeader, CardContent } from '@/components/ui/Card';
import type { PDFExtractedAsset } from '@/types/pdf';
import { AssetLabel, ASSET_LABEL_LABELS, ALL_ASSET_LABELS } from '@/domain/value-objects/AssetLabel';

// ── Types ──────────────────────────────────────────────────────────
interface PDFPreviewData {
  fileName: string;
  bankName: string;
  totalPages: number;
  relevantPages: number;
  assets: PDFExtractedAsset[];
  warnings: string[];
  method: string;
}

interface ConfirmResult {
  totalAssets: number;
  accepted: number;
  rejected: number;
  savedCount: number;
  failedCount: number;
  areaResearched: number;
  rejectedDetails: Array<{ index: number; city: string; assetType: string; reason: string }>;
  saveErrors: Array<{ row: number; reason: string }>;
}

type Step = 'upload' | 'review' | 'done';

const STEPS: { key: Step; label: string }[] = [
  { key: 'upload', label: 'Upload PDF' },
  { key: 'review', label: 'Review Asset' },
  { key: 'done', label: 'Hasil Import' },
];

const ASSET_TYPES = ['RUMAH', 'LAHAN', 'RUKO', 'GUDANG', 'PABRIK', 'APARTEMEN', 'KANTOR', 'HOTEL', 'OTHER'];

// ── Step indicator ─────────────────────────────────────────────────
function StepBar({ current }: { current: Step }) {
  const idx = STEPS.findIndex((s) => s.key === current);
  return (
    <div className="flex items-center gap-0 mb-8">
      {STEPS.map((s, i) => (
        <div key={s.key} className="flex items-center">
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium ${
            i < idx ? 'bg-emerald-100 text-emerald-700' :
            i === idx ? 'bg-blue-600 text-white' :
            'bg-gray-100 text-gray-400'
          }`}>
            <span className="w-4 h-4 rounded-full flex items-center justify-center border text-[10px] font-bold border-current">
              {i + 1}
            </span>
            {s.label}
          </div>
          {i < STEPS.length - 1 && <ChevronRight className="w-4 h-4 text-gray-300 mx-1" />}
        </div>
      ))}
    </div>
  );
}

function ConfidenceBadge({ confidence }: { confidence: string }) {
  if (confidence === 'HIGH') return <Badge variant="success">Tinggi</Badge>;
  if (confidence === 'MEDIUM') return <Badge variant="warning">Sedang</Badge>;
  return <Badge variant="danger">Rendah</Badge>;
}

// ── Main component ─────────────────────────────────────────────────
export default function PDFImportPage() {
  const [step, setStep] = useState<Step>('upload');
  const [sourceType, setSourceType] = useState<'Bank' | 'Balai Lelang'>('Bank');
  const [bankName, setBankName] = useState('');
  const [labelAsset, setLabelAsset] = useState<AssetLabel>('LELANG');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PDFPreviewData | null>(null);
  const [assets, setAssets] = useState<PDFExtractedAsset[]>([]);
  const [result, setResult] = useState<ConfirmResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const reset = useCallback(() => {
    setStep('upload');
    setSourceType('Bank');
    setBankName('');
    setLabelAsset('LELANG');
    setFile(null);
    setPreview(null);
    setAssets([]);
    setResult(null);
    setError(null);
    if (fileRef.current) fileRef.current.value = '';
  }, []);

  // Step 1: Upload & extract
  async function handleExtract() {
    if (!file || !bankName.trim()) {
      setError('Pilih file PDF dan isi nama source (bank/balai lelang)');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('bankName', bankName.trim());
      const res = await fetch('/api/import/pdf', { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error?.message ?? json.message ?? `Error ${res.status}`);

      const data: PDFPreviewData = json.data;
      setPreview(data);
      setAssets(labelAsset === 'CASSIE'
        ? data.assets.map((a) => ({ ...a, limitPrice: (a.outstanding || 0) }))
        : data.assets);
      setStep('review');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Terjadi kesalahan');
    } finally {
      setLoading(false);
    }
  }

  // Edit asset field
  function updateAsset(idx: number, field: keyof PDFExtractedAsset, value: string | number) {
    setAssets((prev) => prev.map((a, i) => {
      if (i !== idx) return a;
      const updated = { ...a, [field]: value };
      // Cassie: Harga Limit = Harga Outstanding
      if (labelAsset === 'CASSIE' && field === 'outstanding') {
        updated.limitPrice = Number(value);
      }
      return updated;
    }));
  }

  // Remove asset
  function removeAsset(idx: number) {
    setAssets((prev) => prev.filter((_, i) => i !== idx));
  }

  // Step 2: Confirm
  async function handleConfirm() {
    if (!preview || assets.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/import/pdf/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bankName: preview.bankName, assets, labelAsset }),
      });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error?.message ?? json.message ?? `Error ${res.status}`);
      setResult(json.data);
      setStep('done');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Terjadi kesalahan');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900">Import PDF</h2>
        <p className="text-sm text-gray-500 mt-1">Ekstrak data asset dari dokumen PDF bank menggunakan AI (Groq)</p>
      </div>

      <StepBar current={step} />

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 flex gap-2 items-start">
          <XCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* ── Step 1: Upload ──────────────────────────────── */}
      {step === 'upload' && (
        <Card>
          <CardHeader>
            <h3 className="font-semibold text-gray-800">Upload Dokumen PDF</h3>
          </CardHeader>
          <CardContent className="space-y-5">
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1.5">
                Source <span className="text-gray-400 font-normal">(isi jika file tidak memuat nama sumber)</span>
              </label>
              <div className="flex mb-2">
                {(['Bank', 'Balai Lelang'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setSourceType(t)}
                    className={`px-3 py-1.5 text-xs font-medium border transition-colors first:rounded-l-lg last:rounded-r-lg ${
                      sourceType === t
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
              <Input
                id="bankName"
                placeholder={
                  sourceType === 'Bank'
                    ? 'cth: BRI, BNI, BTN, CIMB Niaga'
                    : 'cth: KPKNL Surabaya, Balai Lelang PT. XYZ'
                }
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
              />
            </div>

            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1.5">
                Label Asset <span className="text-gray-400 font-normal">(menentukan cara hitung Harga Limit)</span>
              </label>
              <Select
                id="labelAsset"
                value={labelAsset}
                onChange={(e) => setLabelAsset(e.target.value as AssetLabel)}
              >
                {ALL_ASSET_LABELS.map((l) => (
                  <option key={l} value={l}>{ASSET_LABEL_LABELS[l]}</option>
                ))}
              </Select>
              <p className="text-xs text-gray-400 mt-1">
                {labelAsset === 'CASSIE'
                  ? 'Harga Limit = Harga Outstanding'
                  : 'Harga Limit = Harga Lelang (hasil ekstraksi AI)'}
              </p>
            </div>

            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">File PDF</label>
              <div
                className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/40 transition-colors"
                onClick={() => fileRef.current?.click()}
              >
                <FileText className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                {file ? (
                  <p className="text-sm font-medium text-blue-700">{file.name}</p>
                ) : (
                  <>
                    <p className="text-sm font-medium text-gray-700">Klik untuk pilih file</p>
                    <p className="text-xs text-gray-400 mt-1">.pdf — maks. 20MB</p>
                  </>
                )}
              </div>
              <input
                ref={fileRef}
                type="file"
                accept=".pdf"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </div>

            <div className="rounded-lg bg-blue-50 border border-blue-200 px-4 py-3 text-xs text-blue-700">
              AI akan membaca PDF dan mengekstrak data asset secara otomatis. Proses ini mungkin memakan waktu
              beberapa menit untuk PDF dengan banyak halaman.
            </div>

            <div className="flex justify-end pt-2">
              <Button onClick={handleExtract} loading={loading} disabled={!file || !bankName.trim()}>
                Ekstrak Asset dari PDF
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Step 2: Review ──────────────────────────────── */}
      {step === 'review' && preview && (
        <div className="space-y-4">
          {/* Summary card */}
          <Card>
            <CardContent className="py-4">
              <div className="flex flex-wrap gap-4 items-center justify-between">
                <div className="flex gap-6">
                  <StatItem label="Total Halaman" value={preview.totalPages} />
                  <StatItem label="Halaman Relevan" value={preview.relevantPages} />
                  <StatItem label="Asset Ditemukan" value={preview.assets.length} />
                  <StatItem label="Siap Disimpan" value={assets.length} />
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="info">{preview.bankName}</Badge>
                  <Badge variant="default">Label: {ASSET_LABEL_LABELS[labelAsset]}</Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Warnings */}
          {preview.warnings.length > 0 && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 space-y-1">
              {preview.warnings.map((w, i) => (
                <div key={i} className="flex gap-2 text-xs text-amber-700">
                  <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                  {w}
                </div>
              ))}
            </div>
          )}

          {assets.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-gray-500 text-sm">Tidak ada asset yang berhasil diekstrak dari PDF ini.</p>
                <p className="text-gray-400 text-xs mt-1">Pastikan PDF berisi teks (bukan scan gambar) dan memiliki data asset Jawa Timur.</p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-gray-800">Review & Edit Asset</h3>
                  <p className="text-xs text-gray-500">{assets.length} asset • klik sel untuk edit</p>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-100">
                        <th className="text-left px-3 py-3 font-medium text-gray-600 w-8">#</th>
                        <th className="text-left px-3 py-3 font-medium text-gray-600">Tipe</th>
                        <th className="text-left px-3 py-3 font-medium text-gray-600">Kota</th>
                        <th className="text-left px-3 py-3 font-medium text-gray-600">Kecamatan</th>
                        <th className="text-left px-3 py-3 font-medium text-gray-600 min-w-[200px]">Alamat</th>
                        <th className="text-right px-3 py-3 font-medium text-gray-600">Nilai Pasar</th>
                        <th className="text-right px-3 py-3 font-medium text-gray-600">Outstanding</th>
                        <th className="text-right px-3 py-3 font-medium text-gray-600">Harga Limit</th>
                        <th className="text-right px-3 py-3 font-medium text-gray-600">LT (m²)</th>
                        <th className="text-right px-3 py-3 font-medium text-gray-600">LB (m²)</th>
                        <th className="text-left px-3 py-3 font-medium text-gray-600">Debitur</th>
                        <th className="text-center px-3 py-3 font-medium text-gray-600">Konfiden</th>
                        <th className="px-3 py-3"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {assets.map((asset, idx) => (
                        <tr key={idx} className="hover:bg-gray-50/60 group">
                          <td className="px-3 py-2 text-gray-400">{idx + 1}</td>
                          <td className="px-3 py-2">
                            <select
                              value={asset.assetType}
                              onChange={(e) => updateAsset(idx, 'assetType', e.target.value)}
                              className="w-full rounded border border-transparent hover:border-gray-300 focus:border-blue-400 bg-transparent focus:bg-white px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-400 text-xs"
                            >
                              {ASSET_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                            </select>
                          </td>
                          <EditCell value={asset.city} onChange={(v) => updateAsset(idx, 'city', v)} />
                          <EditCell value={asset.district} onChange={(v) => updateAsset(idx, 'district', v)} />
                          <EditCell value={asset.address} onChange={(v) => updateAsset(idx, 'address', v)} wide />
                          <EditCell value={String(asset.marketValue)} onChange={(v) => updateAsset(idx, 'marketValue', Number(v))} align="right" />
                          <EditCell value={String(asset.outstanding)} onChange={(v) => updateAsset(idx, 'outstanding', Number(v))} align="right" />
                          {labelAsset === 'CASSIE' ? (
                            <td className="px-3 py-2 text-right text-gray-500" title="Otomatis: Nilai Pokok Hutang + 3%">
                              {Math.round(asset.limitPrice ?? 0).toLocaleString('id-ID')}
                            </td>
                          ) : (
                            <EditCell value={String(asset.limitPrice ?? 0)} onChange={(v) => updateAsset(idx, 'limitPrice', Number(v))} align="right" />
                          )}
                          <EditCell value={String(asset.landArea)} onChange={(v) => updateAsset(idx, 'landArea', Number(v))} align="right" />
                          <EditCell value={String(asset.buildingArea)} onChange={(v) => updateAsset(idx, 'buildingArea', Number(v))} align="right" />
                          <EditCell value={asset.debtorName} onChange={(v) => updateAsset(idx, 'debtorName', v)} />
                          <td className="px-3 py-2 text-center">
                            <ConfidenceBadge confidence={asset.confidence} />
                          </td>
                          <td className="px-3 py-2">
                            <button
                              onClick={() => removeAsset(idx)}
                              className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 transition-opacity"
                              title="Hapus asset ini"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="flex justify-between">
            <Button variant="secondary" onClick={reset}>Batal</Button>
            <Button onClick={handleConfirm} loading={loading} disabled={assets.length === 0}>
              Simpan {assets.length} Asset
            </Button>
          </div>
        </div>
      )}

      {/* ── Step 3: Result ──────────────────────────────── */}
      {step === 'done' && result && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <h3 className="font-semibold text-gray-800">Hasil Import PDF</h3>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <StatBox label="Total Asset" value={result.totalAssets} color="gray" />
                <StatBox label="Disimpan" value={result.savedCount} color="emerald" />
                <StatBox label="Ditolak (Geo)" value={result.rejected} color="amber" />
                <StatBox label="Gagal Simpan" value={result.failedCount} color="red" />
                <StatBox label="Area Dianalisis AI" value={result.areaResearched ?? 0} color="blue" />
              </div>

              {result.savedCount > 0 && (
                <div className="flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-700">
                  <CheckCircle className="w-5 h-5 flex-shrink-0" />
                  <span><strong>{result.savedCount} asset</strong> berhasil disimpan ke Asset Engine.
                  {(result.areaResearched ?? 0) > 0 && <> · <strong>{result.areaResearched} area baru</strong> otomatis dianalisis AI dan ditambahkan ke Market Intelligence.</>}
                  </span>
                </div>
              )}

              {result.rejectedDetails.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-2">Detail penolakan:</p>
                  <div className="rounded-lg border border-gray-200 overflow-auto max-h-48">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50 sticky top-0">
                        <tr>
                          <th className="text-left px-3 py-2 text-gray-600">#</th>
                          <th className="text-left px-3 py-2 text-gray-600">Kota</th>
                          <th className="text-left px-3 py-2 text-gray-600">Tipe</th>
                          <th className="text-left px-3 py-2 text-gray-600">Alasan</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {result.rejectedDetails.map((r, i) => (
                          <tr key={i} className="hover:bg-gray-50">
                            <td className="px-3 py-2 text-gray-500">#{r.index}</td>
                            <td className="px-3 py-2 text-gray-700">{r.city || '—'}</td>
                            <td className="px-3 py-2 text-gray-700">{r.assetType || '—'}</td>
                            <td className="px-3 py-2 text-red-600">{r.reason}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="flex justify-between">
            <Button variant="secondary" onClick={reset}>
              <RotateCcw className="w-4 h-4" /> Import PDF Lain
            </Button>
            <Link href="/assets">
              <Button>
                Lihat Asset Bank <ExternalLink className="w-4 h-4" />
              </Button>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────
function EditCell({
  value, onChange, align, wide,
}: { value: string; onChange: (v: string) => void; align?: 'right'; wide?: boolean }) {
  return (
    <td className={`px-3 py-2 ${align === 'right' ? 'text-right' : ''} ${wide ? 'min-w-[200px]' : ''}`}>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full rounded border border-transparent hover:border-gray-300 focus:border-blue-400 bg-transparent focus:bg-white px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-400 text-xs ${align === 'right' ? 'text-right' : ''}`}
      />
    </td>
  );
}

function StatItem({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-lg font-bold text-gray-800">{value}</p>
      <p className="text-xs text-gray-500">{label}</p>
    </div>
  );
}

function StatBox({ label, value, color }: { label: string; value: number; color: 'blue' | 'emerald' | 'amber' | 'red' | 'gray' }) {
  const colors = {
    blue: 'bg-blue-50 text-blue-700',
    emerald: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-700',
    red: 'bg-red-50 text-red-700',
    gray: 'bg-gray-50 text-gray-700',
  };
  return (
    <div className={`rounded-xl p-4 ${colors[color]}`}>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs font-medium mt-0.5">{label}</p>
    </div>
  );
}
