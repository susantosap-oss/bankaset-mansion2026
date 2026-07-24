import Groq from 'groq-sdk';
import { Asset } from '@/domain/entities/Asset';
import { AIAnalysis } from '@/domain/entities/AIAnalysis';
import { ASSET_TYPE_LABELS } from '@/domain/value-objects/AssetType';
import { v4 as uuidv4 } from 'uuid';

const GROQ_MODEL = 'llama-3.3-70b-versatile';

function formatRp(v: number): string {
  if (!v) return 'tidak diketahui';
  if (v >= 1_000_000_000) return `Rp ${(v / 1_000_000_000).toFixed(2)} miliar`;
  if (v >= 1_000_000) return `Rp ${(v / 1_000_000).toFixed(0)} juta`;
  return `Rp ${v.toLocaleString('id-ID')}`;
}

export class AIAnalystService {
  private groq: Groq;

  constructor() {
    this.groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  }

  async analyze(asset: Asset): Promise<AIAnalysis> {
    const margin = asset.marketValue - asset.outstanding;
    const marginPct = asset.marketValue > 0
      ? Math.round((margin / asset.marketValue) * 100)
      : 0;

    const prompt = `Kamu adalah analis properti investasi senior di Jawa Timur dengan pengalaman 15 tahun di bidang lelang bank (AYDA/agunan).

DATA ASSET LELANG BANK:
- Bank: ${asset.bankName}
- Tipe Properti: ${ASSET_TYPE_LABELS[asset.assetType] ?? asset.assetType}
- Kota: ${asset.city}${asset.district ? `, Kecamatan ${asset.district}` : ''}${asset.area ? `, ${asset.area}` : ''}
- Alamat: ${asset.address || 'tidak dicantumkan'}
- Nilai Pasar / NJOP: ${formatRp(asset.marketValue)}
- Baki Debet / Outstanding: ${formatRp(asset.outstanding)}
- Margin: ${formatRp(margin)} (${marginPct}%)
- Luas Tanah: ${asset.landArea ? `${asset.landArea} m²` : 'tidak diketahui'}
- Luas Bangunan: ${asset.buildingArea ? `${asset.buildingArea} m²` : 'tidak diketahui'}
${asset.debtorName ? `- Nama Debitur: ${asset.debtorName}` : ''}

Berikan analisis investasi dalam format JSON berikut (jawab dalam Bahasa Indonesia):
{
  "summary": "Ringkasan 2-3 kalimat tentang asset ini secara keseluruhan",
  "investmentPotential": "Analisis potensi investasi, margin yang tersedia, estimasi ROI, dan daya tarik dibanding pasar sekitar (3-4 kalimat)",
  "sellPotential": "Seberapa cepat dan mudah asset bisa dijual kembali, target segmen pembeli yang cocok, dan estimasi waktu pemasaran (2-3 kalimat)",
  "risks": "Risiko-risiko utama yang harus diperhatikan investor: kondisi fisik potensial, risiko lokasi, aspek hukum AYDA, kondisi pasar (3-4 kalimat)",
  "recommendation": "Rekomendasi konkret satu baris: BELI / SKIP / NEGOSIASI HARGA, dengan alasan singkat",
  "marketingStrategy": "Strategi marketing yang tepat: platform yang direkomendasikan, positioning harga, segmen target, pendekatan negosiasi (3-4 kalimat)"
}

Kembalikan HANYA JSON object di atas, tanpa penjelasan tambahan.`;

    const completion = await this.groq.chat.completions.create({
      model: GROQ_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.4,
      max_tokens: 1500,
    });

    const raw = completion.choices[0]?.message?.content ?? '{}';
    let parsed: Record<string, string> = {};
    try {
      const match = raw.match(/\{[\s\S]*\}/);
      parsed = match ? JSON.parse(match[0]) : {};
    } catch {
      parsed = {};
    }

    return {
      analysisId: uuidv4(),
      assetId: asset.assetId,
      summary: String(parsed.summary ?? 'Tidak dapat dianalisis'),
      investmentPotential: String(parsed.investmentPotential ?? '—'),
      sellPotential: String(parsed.sellPotential ?? '—'),
      risks: String(parsed.risks ?? '—'),
      recommendation: String(parsed.recommendation ?? '—'),
      marketingStrategy: String(parsed.marketingStrategy ?? '—'),
      modelUsed: GROQ_MODEL,
      generatedAt: new Date().toISOString(),
    };
  }
}
