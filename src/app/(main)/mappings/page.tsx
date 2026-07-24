'use client';

import { useEffect, useState } from 'react';
import { Plus, Trash2, ChevronDown, ChevronUp, GitBranch } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardHeader, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { CANONICAL_FIELD_LABELS, ALL_CANONICAL_FIELDS, CanonicalField } from '@/domain/entities/BankMapping';
import type { BankMapping } from '@/domain/entities/BankMapping';

export default function MappingsPage() {
  const [mappings, setMappings] = useState<BankMapping[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [expandedBank, setExpandedBank] = useState<string | null>(null);

  // Form state
  const [formBank, setFormBank] = useState('');
  const [formFields, setFormFields] = useState<Partial<Record<CanonicalField, string>>>({});
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  async function load() {
    setLoading(true);
    try {
      const res = await fetch('/api/mappings');
      const json = await res.json();
      setMappings(json.data ?? []);
    } catch {
      // silently ignore
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleSave() {
    if (!formBank.trim()) { setFormError('Nama bank wajib diisi'); return; }
    const filledFields = Object.fromEntries(
      Object.entries(formFields).filter(([, v]) => v?.trim())
    );
    if (Object.keys(filledFields).length === 0) {
      setFormError('Minimal satu kolom harus diisi');
      return;
    }

    setSaving(true);
    setFormError('');
    try {
      const res = await fetch('/api/mappings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bankName: formBank.trim(), fields: filledFields }),
      });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.message ?? 'Gagal menyimpan');
      setShowForm(false);
      setFormBank('');
      setFormFields({});
      load();
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : 'Terjadi kesalahan');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(bankName: string) {
    if (!confirm(`Hapus mapping untuk "${bankName}"?`)) return;
    try {
      await fetch(`/api/mappings/${encodeURIComponent(bankName)}`, { method: 'DELETE' });
      load();
    } catch {
      // silently ignore
    }
  }

  return (
    <div className="p-6 space-y-5 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Mapping Kolom Bank</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Definisikan nama kolom spesifik tiap bank agar normalisasi berjalan otomatis
          </p>
        </div>
        <Button size="sm" onClick={() => setShowForm((v) => !v)}>
          <Plus className="w-4 h-4" /> Tambah Mapping
        </Button>
      </div>

      {/* Add form */}
      {showForm && (
        <Card>
          <CardHeader>
            <h3 className="font-semibold text-gray-800">Mapping Baru</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Isi nama kolom <em>di file bank</em> untuk setiap field standar yang tersedia
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {formError && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{formError}</p>
            )}
            <Input
              label="Nama Bank"
              placeholder="cth: BRI, BNI, BTN"
              value={formBank}
              onChange={(e) => setFormBank(e.target.value)}
            />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {ALL_CANONICAL_FIELDS.map((field) => (
                <Input
                  key={field}
                  label={CANONICAL_FIELD_LABELS[field]}
                  placeholder={`Nama kolom di file ${formBank || 'bank'}`}
                  value={formFields[field] ?? ''}
                  onChange={(e) =>
                    setFormFields((prev) => ({ ...prev, [field]: e.target.value }))
                  }
                />
              ))}
            </div>
            <div className="flex gap-3 pt-2">
              <Button onClick={handleSave} loading={saving}>Simpan Mapping</Button>
              <Button variant="secondary" onClick={() => { setShowForm(false); setFormError(''); }}>
                Batal
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Mapping list */}
      {loading ? (
        <div className="text-center py-12 text-gray-400 text-sm">Memuat...</div>
      ) : mappings.length === 0 ? (
        <Card>
          <CardContent>
            <div className="text-center py-14">
              <GitBranch className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 font-medium">Belum ada mapping</p>
              <p className="text-sm text-gray-400 mt-1">
                Tambah mapping agar sistem bisa mengenali kolom dari file bank secara otomatis
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {mappings.map((m) => {
            const fieldCount = Object.keys(m.fields).length;
            const isExpanded = expandedBank === m.bankName;
            return (
              <Card key={m.bankName}>
                <div
                  className="flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-gray-50 rounded-xl transition-colors"
                  onClick={() => setExpandedBank(isExpanded ? null : m.bankName)}
                >
                  <div className="flex-1">
                    <p className="font-semibold text-gray-900">{m.bankName}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {fieldCount} kolom terpetakan · Diupdate oleh {m.updatedBy}
                    </p>
                  </div>
                  <Badge variant={m.active ? 'success' : 'default'}>
                    {m.active ? 'Aktif' : 'Nonaktif'}
                  </Badge>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(m.bankName); }}
                    className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    title="Hapus mapping"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                  {isExpanded ? (
                    <ChevronUp className="w-4 h-4 text-gray-400" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-gray-400" />
                  )}
                </div>

                {isExpanded && (
                  <div className="px-5 pb-4 border-t border-gray-100 pt-3">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1.5">
                      {ALL_CANONICAL_FIELDS.map((field) => {
                        const colName = m.fields[field];
                        return (
                          <div key={field} className={`flex items-center gap-2 text-xs py-1 ${!colName ? 'opacity-40' : ''}`}>
                            <span className="w-40 text-gray-500">{CANONICAL_FIELD_LABELS[field]}</span>
                            <span className="text-gray-300">→</span>
                            <span className={colName ? 'text-gray-900 font-medium' : 'italic text-gray-400'}>
                              {colName || 'tidak dikonfigurasi'}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
