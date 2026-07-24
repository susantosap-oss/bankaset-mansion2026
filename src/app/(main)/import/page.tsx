'use client';

import { useState, useRef, useCallback } from 'react';
import { Upload, CheckCircle, XCircle, ChevronRight, RotateCcw, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { Card, CardHeader, CardContent } from '@/components/ui/Card';
import { CANONICAL_FIELD_LABELS, ALL_CANONICAL_FIELDS, CanonicalField } from '@/domain/entities/BankMapping';

// ── Types ──────────────────────────────────────────────────────────
interface ColumnResolution {
  sourceColumn: string;
  suggestedField: CanonicalField | null;
  confidence: number;
  status: 'AUTO_MAPPED' | 'SUGGESTION' | 'UNRESOLVED';
  matchedVia: string | null;
}

interface PreviewData {
  fileType: string;
  fileName: string;
  bankName: string;
  headers: string[];
  sampleRows: Record<string, string>[];
  allRows: Record<string, string>[];
  totalRows: number;
  suggestions: ColumnResolution[];
}

interface ConfirmResult {
  totalRows: number;
  accepted: number;
  rejected: number;
  savedCount: number;
  failedCount: number;
  areaResearched: number;
  rejectedDetails: Array<{ row: number; city: string; assetType: string; reason: string }>;
  saveErrors: Array<{ row: number; reason: string }>;
}

type Step = 'upload' | 'map' | 'review' | 'done';

const STEPS: { key: Step; label: string }[] = [
  { key: 'upload', label: 'Upload File' },
  { key: 'map', label: 'Mapping Kolom' },
  { key: 'review', label: 'Review Data' },
  { key: 'done', label: 'Hasil Import' },
];

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
            <span className="w-4 h-4 rounded-full flex items-center justify-center border text-[10px] font-bold
              border-current">{i + 1}</span>
            {s.label}
          </div>
          {i < STEPS.length - 1 && (
            <ChevronRight className="w-4 h-4 text-gray-300 mx-1" />
          )}
        </div>
      ))}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────
export default function ImportPage() {
  const [step, setStep] = useState<Step>('upload');
  const [bankName, setBankName] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [saveMappingForBank, setSaveMappingForBank] = useState(false);
  const [result, setResult] = useState<ConfirmResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const reset = useCallback(() => {
    setStep('upload');
    setBankName('');
    setFile(null);
    setPreview(null);
    setMapping({});
    setSaveMappingForBank(false);
    setResult(null);
    setError(null);
    if (fileRef.current) fileRef.current.value = '';
  }, []);

  // Step 1: Analyze file
  async function handleAnalyze() {
    if (!file || !bankName.trim()) {
      setError('Pilih file dan isi nama bank');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('bankName', bankName.trim());
      const res = await fetch('/api/import/preview', { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error?.message ?? json.message ?? `Error ${res.status}`);

      const data: PreviewData = json.data;
      setPreview(data);

      // Initialize mapping from suggestions
      const initMapping: Record<string, string> = {};
      for (const s of data.suggestions) {
        initMapping[s.sourceColumn] = s.suggestedField ?? 'ignore';
      }
      setMapping(initMapping);
      setStep('map');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Terjadi kesalahan');
    } finally {
      setLoading(false);
    }
  }

  // Step 3: Confirm import
  async function handleConfirm() {
    if (!preview) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/import/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bankName: preview.bankName,
          allRows: preview.allRows,
          mapping,
          saveMappingForBank,
        }),
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
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900">Import Asset</h2>
        <p className="text-sm text-gray-500 mt-1">Upload file Excel atau CSV dari bank/kantor lelang</p>
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
            <h3 className="font-semibold text-gray-800">Upload File Asset</h3>
          </CardHeader>
          <CardContent className="space-y-5">
            <Input
              id="bankName"
              label="Nama Bank / Sumber Data"
              placeholder="cth: BRI, BNI, BTN, CIMB Niaga"
              value={bankName}
              onChange={(e) => setBankName(e.target.value)}
            />

            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">File Excel / CSV</label>
              <div
                className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/40 transition-colors"
                onClick={() => fileRef.current?.click()}
              >
                <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                {file ? (
                  <p className="text-sm font-medium text-blue-700">{file.name}</p>
                ) : (
                  <>
                    <p className="text-sm font-medium text-gray-700">Klik untuk pilih file</p>
                    <p className="text-xs text-gray-400 mt-1">.xlsx, .xls, .csv — maks. 10MB</p>
                  </>
                )}
              </div>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </div>

            <div className="flex justify-end pt-2">
              <Button onClick={handleAnalyze} loading={loading} disabled={!file || !bankName.trim()}>
                Analisis File
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Step 2: Map Columns ─────────────────────────── */}
      {step === 'map' && preview && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-gray-800">Mapping Kolom</h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {preview.fileName} · {preview.totalRows} baris · {preview.headers.length} kolom
                  </p>
                </div>
                <Badge variant="info">{preview.bankName}</Badge>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      <th className="text-left px-4 py-3 font-medium text-gray-600 w-1/3">Kolom di File</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600 w-1/3">Maps ke Field</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600 hidden md:table-cell">Contoh Nilai</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {preview.suggestions.map((s) => {
                      const currentVal = mapping[s.sourceColumn] ?? 'ignore';
                      const sample = preview.sampleRows[0]?.[s.sourceColumn] ?? '';
                      return (
                        <tr key={s.sourceColumn} className="hover:bg-gray-50/60">
                          <td className="px-4 py-3 font-medium text-gray-800">{s.sourceColumn}</td>
                          <td className="px-4 py-3">
                            <select
                              value={currentVal}
                              onChange={(e) => setMapping((prev) => ({ ...prev, [s.sourceColumn]: e.target.value }))}
                              className="block w-full rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                              <option value="ignore">— Abaikan —</option>
                              {ALL_CANONICAL_FIELDS.map((f) => (
                                <option key={f} value={f}>{CANONICAL_FIELD_LABELS[f]}</option>
                              ))}
                            </select>
                          </td>
                          <td className="px-4 py-3">
                            <StatusBadge status={s.status} currentVal={currentVal} />
                          </td>
                          <td className="px-4 py-3 text-gray-400 text-xs hidden md:table-cell max-w-[120px] truncate">
                            {sample}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="px-4 py-4 border-t border-gray-100 flex items-center gap-3">
                <input
                  type="checkbox"
                  id="saveMapping"
                  checked={saveMappingForBank}
                  onChange={(e) => setSaveMappingForBank(e.target.checked)}
                  className="rounded border-gray-300 text-blue-600"
                />
                <label htmlFor="saveMapping" className="text-sm text-gray-600">
                  Simpan sebagai mapping permanen untuk <span className="font-medium">{preview.bankName}</span>
                </label>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-between">
            <Button variant="secondary" onClick={reset}>Batal</Button>
            <Button onClick={() => setStep('review')}>
              Lanjut Review Data
            </Button>
          </div>
        </div>
      )}

      {/* ── Step 3: Review ──────────────────────────────── */}
      {step === 'review' && preview && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <h3 className="font-semibold text-gray-800">Review Sebelum Import</h3>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Stats */}
              <div className="grid grid-cols-3 gap-4">
                <StatBox label="Total Baris" value={preview.totalRows} color="blue" />
                <StatBox
                  label="Kolom Terpetakan"
                  value={Object.values(mapping).filter((v) => v !== 'ignore').length}
                  sub={`dari ${preview.headers.length} kolom`}
                  color="emerald"
                />
                <StatBox label="Kolom Diabaikan"
                  value={Object.values(mapping).filter((v) => v === 'ignore').length}
                  color="gray"
                />
              </div>

              {/* Mapped field summary */}
              <div>
                <p className="text-xs font-medium text-gray-500 mb-2">Field yang akan diimport:</p>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(mapping)
                    .filter(([, v]) => v !== 'ignore')
                    .map(([col, canonical]) => (
                      <span key={col} className="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded-md">
                        {col} → {CANONICAL_FIELD_LABELS[canonical as CanonicalField] ?? canonical}
                      </span>
                    ))}
                </div>
              </div>

              {/* Sample rows */}
              <div>
                <p className="text-xs font-medium text-gray-500 mb-2">Preview 5 baris pertama:</p>
                <div className="overflow-x-auto rounded-lg border border-gray-200">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50">
                      <tr>
                        {Object.entries(mapping)
                          .filter(([, v]) => v !== 'ignore')
                          .map(([col]) => (
                            <th key={col} className="text-left px-3 py-2 font-medium text-gray-600 whitespace-nowrap">
                              {CANONICAL_FIELD_LABELS[mapping[col] as CanonicalField] ?? col}
                            </th>
                          ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {preview.sampleRows.map((row, i) => (
                        <tr key={i} className="hover:bg-gray-50">
                          {Object.entries(mapping)
                            .filter(([, v]) => v !== 'ignore')
                            .map(([col]) => (
                              <td key={col} className="px-3 py-2 text-gray-700 max-w-[150px] truncate">
                                {row[col] ?? ''}
                              </td>
                            ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-xs text-amber-700">
                Asset akan difilter secara otomatis berdasarkan wilayah: Surabaya Raya menerima semua tipe,
                Jawa Timur lainnya hanya Gudang/Pabrik/Lahan, luar Jawa Timur ditolak.
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-between">
            <Button variant="secondary" onClick={() => setStep('map')}>Kembali</Button>
            <Button onClick={handleConfirm} loading={loading}>
              Mulai Import {preview.totalRows} Baris
            </Button>
          </div>
        </div>
      )}

      {/* ── Step 4: Result ──────────────────────────────── */}
      {step === 'done' && result && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <h3 className="font-semibold text-gray-800">Hasil Import</h3>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <StatBox label="Total Baris" value={result.totalRows} color="gray" />
                <StatBox label="Asset Disimpan" value={result.savedCount} color="emerald" />
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
                  <p className="text-xs font-medium text-gray-500 mb-2">
                    Detail penolakan ({result.rejected} baris):
                  </p>
                  <div className="rounded-lg border border-gray-200 overflow-auto max-h-48">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50 sticky top-0">
                        <tr>
                          <th className="text-left px-3 py-2 text-gray-600">Baris</th>
                          <th className="text-left px-3 py-2 text-gray-600">Kota</th>
                          <th className="text-left px-3 py-2 text-gray-600">Tipe Aset</th>
                          <th className="text-left px-3 py-2 text-gray-600">Alasan</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {result.rejectedDetails.map((r, i) => (
                          <tr key={i} className="hover:bg-gray-50">
                            <td className="px-3 py-2 text-gray-500">#{r.row}</td>
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
              <RotateCcw className="w-4 h-4" /> Import File Lain
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
function StatusBadge({ status, currentVal }: { status: string; currentVal: string }) {
  if (currentVal === 'ignore') return <Badge variant="default">Diabaikan</Badge>;
  if (status === 'AUTO_MAPPED') return <Badge variant="success">Auto</Badge>;
  if (status === 'SUGGESTION') return <Badge variant="warning">Saran</Badge>;
  return <Badge variant="danger">Manual</Badge>;
}

function StatBox({
  label, value, sub, color,
}: { label: string; value: number | string; sub?: string; color: 'blue' | 'emerald' | 'amber' | 'red' | 'gray' }) {
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
      {sub && <p className="text-xs opacity-70 mt-0.5">{sub}</p>}
    </div>
  );
}
