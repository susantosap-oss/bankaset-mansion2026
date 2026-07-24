'use client';

import { useState, useEffect } from 'react';
import { X, Bot, RefreshCw, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import type { Asset } from '@/domain/entities/Asset';
import { ASSET_TYPE_LABELS } from '@/domain/value-objects/AssetType';
import { formatCurrency } from '@/lib/utils';

interface AIAnalysis {
  analysisId: string;
  assetId: string;
  summary: string;
  investmentPotential: string;
  sellPotential: string;
  risks: string;
  recommendation: string;
  marketingStrategy: string;
  modelUsed: string;
  generatedAt: string;
}

interface Props {
  asset: Asset;
  onClose: () => void;
}

function Section({ title, content, accent }: { title: string; content: string; accent: string }) {
  return (
    <div className={`rounded-xl p-4 border ${accent}`}>
      <p className="text-xs font-semibold mb-1.5 uppercase tracking-wide opacity-70">{title}</p>
      <p className="text-sm text-gray-700 leading-relaxed">{content}</p>
    </div>
  );
}

function RecommendationBadge({ text }: { text: string }) {
  const upper = text.toUpperCase();
  const isBuy = upper.includes('BELI');
  const isSkip = upper.includes('SKIP');
  const color = isBuy ? 'bg-emerald-600' : isSkip ? 'bg-red-600' : 'bg-amber-600';
  return (
    <div className={`${color} text-white rounded-xl px-5 py-4`}>
      <p className="text-xs font-semibold mb-1 opacity-80 uppercase tracking-wide">Rekomendasi</p>
      <p className="text-sm font-medium leading-snug">{text}</p>
    </div>
  );
}

export function AIAnalysisPanel({ asset, onClose }: Props) {
  const [analysis, setAnalysis] = useState<AIAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Try to load cached analysis
    fetch(`/api/ai/analyze/${asset.assetId}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.data) setAnalysis(json.data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [asset.assetId]);

  async function handleGenerate() {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch(`/api/ai/analyze/${asset.assetId}`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error?.message ?? json.message ?? `Error ${res.status}`);
      setAnalysis(json.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal generate analisis');
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* Panel */}
      <div className="relative w-full max-w-lg bg-white shadow-2xl flex flex-col h-full overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-gray-100 bg-gray-50">
          <div className="flex items-center gap-2 min-w-0">
            <Bot className="w-5 h-5 text-blue-600 shrink-0" />
            <div className="min-w-0">
              <p className="font-semibold text-gray-900 text-sm truncate">Analisis AI — {asset.bankName}</p>
              <p className="text-xs text-gray-500 truncate">
                {ASSET_TYPE_LABELS[asset.assetType] ?? asset.assetType} · {asset.city}
                {asset.district ? `, ${asset.district}` : ''}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-200 text-gray-500 shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Asset quick info */}
        <div className="px-5 py-3 border-b border-gray-100 bg-blue-50/50">
          <div className="flex gap-4 text-xs text-gray-600">
            <div>
              <span className="text-gray-400">Nilai Pasar</span>
              <p className="font-semibold text-gray-800">{asset.marketValue ? formatCurrency(asset.marketValue) : '—'}</p>
            </div>
            <div>
              <span className="text-gray-400">Outstanding</span>
              <p className="font-semibold text-gray-800">{asset.outstanding ? formatCurrency(asset.outstanding) : '—'}</p>
            </div>
            {asset.landArea > 0 && (
              <div>
                <span className="text-gray-400">Luas Tanah</span>
                <p className="font-semibold text-gray-800">{asset.landArea} m²</p>
              </div>
            )}
            {asset.buildingArea > 0 && (
              <div>
                <span className="text-gray-400">Luas Bgn</span>
                <p className="font-semibold text-gray-800">{asset.buildingArea} m²</p>
              </div>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-24 bg-gray-100 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : analysis ? (
            <>
              <div className="rounded-xl border border-gray-200 p-4 bg-gray-50">
                <p className="text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">Ringkasan</p>
                <p className="text-sm text-gray-800 leading-relaxed font-medium">{analysis.summary}</p>
              </div>

              <RecommendationBadge text={analysis.recommendation} />

              <Section title="Potensi Investasi" content={analysis.investmentPotential}
                accent="border-blue-100 bg-blue-50/40" />
              <Section title="Potensi Jual" content={analysis.sellPotential}
                accent="border-emerald-100 bg-emerald-50/40" />
              <Section title="Risiko" content={analysis.risks}
                accent="border-red-100 bg-red-50/40" />
              <Section title="Strategi Marketing" content={analysis.marketingStrategy}
                accent="border-amber-100 bg-amber-50/40" />

              <p className="text-xs text-gray-400 text-center pt-2">
                Dianalisis oleh {analysis.modelUsed} ·{' '}
                {new Date(analysis.generatedAt).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}
              </p>

              {error && (
                <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-xs text-red-700">
                  {error}
                </div>
              )}

              <div className="flex justify-center pt-1">
                <Button variant="secondary" onClick={handleGenerate} loading={generating}>
                  <RefreshCw className="w-3.5 h-3.5" /> Generate Ulang
                </Button>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-full gap-5 py-12">
              <div className="w-16 h-16 rounded-2xl bg-blue-100 flex items-center justify-center">
                <Sparkles className="w-8 h-8 text-blue-600" />
              </div>
              <div className="text-center">
                <p className="font-semibold text-gray-800">Belum ada analisis</p>
                <p className="text-sm text-gray-500 mt-1 max-w-[260px]">
                  Klik tombol di bawah untuk membuat analisis AI menggunakan Groq llama
                </p>
              </div>
              {error && (
                <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-2 text-xs text-red-700 max-w-[300px] text-center">
                  {error}
                </div>
              )}
              <Button onClick={handleGenerate} loading={generating}>
                <Sparkles className="w-4 h-4" /> Generate Analisis AI
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
