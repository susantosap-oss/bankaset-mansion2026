import Groq from 'groq-sdk';

export interface AreaResearchResult {
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
  portalStats?: {
    portal: string;
    listingCount: number;
    medianPrice: number;
  }[];
  alternatives?: AreaResearchResult[];
}

interface SerperResult {
  totalResults: string; // "1,230" — from searchInformation
  organic: Array<{ title: string; snippet: string; link: string }>;
}

const GROQ_MODEL = 'llama-3.3-70b-versatile';

const PORTALS = [
  { name: 'rumah123.com', site: 'rumah123.com' },
  { name: 'lamudi.co.id',  site: 'lamudi.co.id' },
  { name: 'olx.co.id',     site: 'olx.co.id' },
];

// ── Serper helpers ─────────────────────────────────────────────────

async function serperSearch(query: string): Promise<SerperResult> {
  const apiKey = process.env.SERPER_API_KEY;
  if (!apiKey) return { totalResults: '0', organic: [] };
  try {
    const res = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: query, gl: 'id', hl: 'id', num: 10 }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { totalResults: '0', organic: [] };
    const data = await res.json() as {
      searchInformation?: { totalResults?: string };
      organic?: Array<{ title: string; snippet: string; link: string }>;
    };
    return {
      totalResults: data.searchInformation?.totalResults ?? '0',
      organic: data.organic ?? [],
    };
  } catch {
    return { totalResults: '0', organic: [] };
  }
}

// ── Price extraction ───────────────────────────────────────────────

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

// ── Demand score from listing count ───────────────────────────────
// Based on total estimated results across portals

function demandFromCount(total: number): number {
  if (total >= 500) return 95;
  if (total >= 200) return 85;
  if (total >= 100) return 75;
  if (total >= 50)  return 62;
  if (total >= 20)  return 50;
  if (total >= 5)   return 35;
  return 20;
}

// Liquidity: from how many portals have actual organic results
function liquidityFromPortalCount(portalsWithData: number, totalOrganic: number): number {
  const base = portalsWithData * 25; // 3 portals → 75
  const bonus = Math.min(20, Math.floor(totalOrganic / 3)); // up to +20 from organic count
  return Math.min(95, base + bonus);
}

// ── Extract area name from portal URL ─────────────────────────────
// rumah123: /jual/{city}/{area}/rumah/  →  area slug
// lamudi:   /{province}/{city}/{area}/  →  area slug

const PROPERTY_TYPE_SLUGS = new Set(['rumah', 'apartemen', 'ruko', 'tanah', 'kavling', 'gudang', 'kos', 'vila', 'kantor', 'hotel', 'residensial', 'komersial']);
const GENERIC_SLUGS = new Set(['beli', 'sewa', 'jual', 'baru', 'bekas', 'murah', 'dijual', 'disewa', 'properti', 'listing', 'all', 'lainnya']);

function slugToName(slug: string): string {
  return slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function extractAreaFromUrl(url: string, citySlug: string): string | null {
  try {
    const parts = new URL(url).pathname.split('/').filter(Boolean);
    const cityIdx = parts.findIndex((p) => p === citySlug || p.replace(/-/g, ' ') === citySlug);
    if (cityIdx < 0) return null;
    const candidate = parts[cityIdx + 1];
    if (!candidate) return null;
    if (PROPERTY_TYPE_SLUGS.has(candidate) || GENERIC_SLUGS.has(candidate)) return null;
    if (/^\d/.test(candidate) || candidate.startsWith('r') && /\d{4,}/.test(candidate)) return null; // listing IDs
    if (candidate.length < 3 || candidate.length > 40) return null;
    return slugToName(candidate);
  } catch {
    return null;
  }
}

// Extract listing count from title/snippet in any format
// "6.037 Properti Dijual" → 6037 | "7+ Ruko Dijual" → 7 | "Daftar 25 rumah" → 25
function extractListingCount(text: string): number {
  const m = text.match(/(\d[\d.]*)\+?\s*(?:properti|rumah|ruko|tanah|kavling|unit|listing|iklan|apartemen|gudang|pabrik|lahan)/i);
  if (!m) return 0;
  return parseInt(m[1].replace(/\./g, ''), 10) || 0;
}

// Extract per-m² price from snippet: "Rp 3,04 Juta/m²" → 3_040_000
function extractPerSqmPrice(text: string): number {
  const re = /(?:rp\.?\s*)?([\d]+(?:[.,][\d]+)?)\s*(?:juta|jt)\s*[/\\]\s*m[²2²]/gi;
  let best = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const num = parseFloat(m[1].replace(',', '.'));
    if (!isNaN(num)) best = Math.max(best, Math.round(num * 1_000_000));
  }
  return best;
}

// city "kota surabaya" → slug "surabaya"
function cityToSlug(city: string): string {
  return city.toLowerCase()
    .replace(/^kota\s+/, '')
    .replace(/^kabupaten\s+/, '')
    .replace(/\s+/g, '-');
}

// ── Main service ───────────────────────────────────────────────────

export class AreaResearchService {
  private groq: Groq;

  constructor() {
    this.groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  }

  async research(area: string | null | undefined, city: string): Promise<AreaResearchResult> {
    const hasSerper = !!process.env.SERPER_API_KEY;
    const areaProvided = area?.trim() || '';
    const suggestArea = !areaProvided;

    if (hasSerper) {
      return suggestArea
        ? this.discoverAndResearch(city)
        : this.researchWithPortalData(areaProvided, city);
    }

    // Fallback: Groq knowledge (no Serper)
    return this.researchWithGroq(areaProvided || null, city);
  }

  // ── Mode 1: PORTAL_DATA — area specified ────────────────────────

  private async researchWithPortalData(area: string, city: string): Promise<AreaResearchResult> {
    type PortalResult = {
      portal: string;
      listingCount: number;
      perSqmPrice: number;
      hasResults: boolean;
      links: string[];
    };

    const portalResults = await Promise.all(
      PORTALS.map(async (p): Promise<PortalResult> => {
        const q = `properti dijual ${area} ${city} site:${p.site}`;
        const data = await serperSearch(q);

        // Jumlahkan semua count yang ditemukan di title/snippet (bisa dari beberapa tipe properti)
        let listingCount = 0;
        let perSqmPrice = 0;
        for (const r of data.organic) {
          const text = `${r.title} ${r.snippet}`;
          listingCount += extractListingCount(text);
          const p2 = extractPerSqmPrice(text);
          if (p2 > perSqmPrice) perSqmPrice = p2;
        }

        return {
          portal: p.name,
          listingCount,
          perSqmPrice,
          hasResults: data.organic.length > 0,
          links: data.organic.slice(0, 2).map((o) => o.link),
        };
      })
    );

    const portalsWithData = portalResults.filter((p) => p.hasResults).length;
    const totalListings = portalResults.reduce((s, p) => s + p.listingCount, 0);
    // Median per-m² dari portal yang punya data harga per m²
    const sqmPrices = portalResults.map((p) => p.perSqmPrice).filter((v) => v > 0);
    const medianPerSqm = Math.round(median(sqmPrices));

    const demandScore = demandFromCount(totalListings > 0 ? totalListings : portalsWithData * 5);
    const liquidityScore = liquidityFromPortalCount(portalsWithData, portalResults.filter((p) => p.listingCount > 0).length);
    const confidence: AreaResearchResult['confidence'] =
      portalsWithData >= 2 ? 'HIGH' : portalsWithData === 1 ? 'MEDIUM' : 'LOW';

    const reasoning = await this.generateReasoning(area, city, {
      totalListings,
      portalsWithData,
      medianPrice: medianPerSqm,
    });

    return {
      area,
      city,
      suggestedDemandScore: demandScore,
      suggestedLiquidityScore: liquidityScore,
      suggestedMedianPrice: medianPerSqm, // hanya diisi jika ditemukan harga /m² di snippet
      reasoning,
      sources: portalResults.flatMap((p) => p.links).filter(Boolean),
      method: 'PORTAL_DATA',
      confidence,
      areaWasSuggested: false,
      portalStats: portalResults.map((p) => ({
        portal: p.portal,
        listingCount: p.listingCount,
        medianPrice: p.perSqmPrice,
      })),
    };
  }

  // ── Mode 2: PORTAL_DATA — discover most active area in city ──────
  // 100% data dari portal — tidak ada Groq untuk nama area

  private async discoverAndResearch(city: string): Promise<AreaResearchResult> {
    const slug = cityToSlug(city);

    // Query kecamatan-level pages di rumah123 untuk kota ini
    const results = await serperSearch(`site:rumah123.com/jual/${slug} properti dijual`);

    // Ekstrak nama area dari URL — HANYA yang strict di bawah /jual/{citySlug}/
    const areaScore = new Map<string, number>();
    const organic = results.organic;
    const pathPrefix = `/jual/${slug}/`;
    for (let i = 0; i < organic.length; i++) {
      const r = organic[i];
      // Strict check: URL harus benar-benar di bawah /jual/{city}/
      try {
        const pathname = new URL(r.link).pathname.toLowerCase();
        if (!pathname.includes(pathPrefix)) continue;
      } catch { continue; }

      const area = extractAreaFromUrl(r.link, slug);
      if (!area) continue;
      const count = extractListingCount(`${r.title} ${r.snippet}`);
      const positionScore = organic.length - i;
      const score = count > 0 ? count : positionScore;
      const current = areaScore.get(area) ?? 0;
      areaScore.set(area, Math.max(current, score));
    }

    // Urutkan berdasarkan skor tertinggi, ambil top 3
    const sorted = [...areaScore.entries()].sort((a, b) => b[1] - a[1]);
    const top3Areas = sorted.slice(0, 3).map(([area]) => area);

    if (top3Areas.length === 0) {
      return {
        area: '',
        city,
        suggestedDemandScore: 0,
        suggestedLiquidityScore: 0,
        suggestedMedianPrice: 0,
        reasoning: 'Tidak ditemukan data listing di portal untuk kota ini. Coba isi nama area secara manual.',
        sources: [],
        method: 'PORTAL_DATA',
        confidence: 'LOW',
        areaWasSuggested: true,
      };
    }

    // Research semua top area secara paralel
    const settled = await Promise.allSettled(
      top3Areas.map((area) => this.researchWithPortalData(area, city))
    );

    const successResults = settled
      .filter((r): r is PromiseFulfilledResult<AreaResearchResult> => r.status === 'fulfilled')
      .map((r) => r.value);

    if (successResults.length === 0) {
      return {
        area: '',
        city,
        suggestedDemandScore: 0,
        suggestedLiquidityScore: 0,
        suggestedMedianPrice: 0,
        reasoning: 'Riset portal gagal. Coba isi nama area secara manual.',
        sources: [],
        method: 'PORTAL_DATA',
        confidence: 'LOW',
        areaWasSuggested: true,
      };
    }

    // Sort by demand score — yang tertinggi jadi utama
    successResults.sort((a, b) => b.suggestedDemandScore - a.suggestedDemandScore);
    const [main, ...rest] = successResults;
    return {
      ...main,
      areaWasSuggested: true,
      alternatives: rest.map((r) => ({ ...r, areaWasSuggested: true })),
    };
  }

  // ── Mode 3: Groq knowledge (no Serper) ──────────────────────────

  private async researchWithGroq(area: string | null, city: string): Promise<AreaResearchResult> {
    const suggestArea = !area;
    const prompt = suggestArea
      ? `Kamu adalah analis pasar properti Jawa Timur. Rekomendasikan satu kecamatan/area properti paling aktif di ${city}, Jawa Timur beserta estimasi skor pasar.

Format JSON (hanya JSON):
{
  "suggestedArea": "<nama kecamatan>",
  "demandScore": <0-100>,
  "liquidityScore": <0-100>,
  "medianPrice": <harga median per m² dalam rupiah>,
  "reasoning": "<2-3 kalimat alasan>",
  "confidence": "MEDIUM"
}`
      : `Kamu adalah analis pasar properti Jawa Timur. Estimasi skor pasar untuk:
- Area: ${area}
- Kota: ${city}, Jawa Timur

Format JSON (hanya JSON):
{
  "demandScore": <0-100>,
  "liquidityScore": <0-100>,
  "medianPrice": <harga median per m² dalam rupiah>,
  "reasoning": "<2-3 kalimat alasan>",
  "confidence": "<HIGH|MEDIUM|LOW>"
}`;

    const completion = await this.groq.chat.completions.create({
      model: GROQ_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 600,
    });

    const raw = completion.choices[0]?.message?.content ?? '{}';
    let parsed: Record<string, unknown> = {};
    try {
      const match = raw.match(/\{[\s\S]*\}/);
      parsed = match ? JSON.parse(match[0]) : {};
    } catch { parsed = {}; }

    const resolvedArea = suggestArea
      ? String(parsed.suggestedArea ?? '').trim()
      : area!;

    return {
      area: resolvedArea,
      city,
      suggestedDemandScore: Math.max(0, Math.min(100, Number(parsed.demandScore) || 50)),
      suggestedLiquidityScore: Math.max(0, Math.min(100, Number(parsed.liquidityScore) || 50)),
      suggestedMedianPrice: Math.max(0, Number(parsed.medianPrice) || 0),
      reasoning: String(parsed.reasoning ?? 'Estimasi berdasarkan pengetahuan pasar properti Jawa Timur.'),
      sources: [],
      method: 'GROQ_KNOWLEDGE',
      confidence: (['HIGH', 'MEDIUM', 'LOW'].includes(String(parsed.confidence))
        ? parsed.confidence : 'MEDIUM') as AreaResearchResult['confidence'],
      areaWasSuggested: suggestArea,
    };
  }

  // ── Groq reasoning text (used alongside portal data) ─────────────

  private async generateReasoning(
    area: string,
    city: string,
    stats: { totalListings: number; portalsWithData: number; medianPrice: number }
  ): Promise<string> {
    try {
      const completion = await this.groq.chat.completions.create({
        model: GROQ_MODEL,
        messages: [{
          role: 'user',
          content: `Jelaskan potensi properti di ${area}, ${city} Jawa Timur dalam 2-3 kalimat singkat.
Data: ${stats.totalListings} listing ditemukan di ${stats.portalsWithData} portal, median harga lahan Rp ${(stats.medianPrice / 1_000_000).toFixed(0)} juta/m².
Fokus: aksesibilitas, karakteristik kawasan, daya tarik investasi. Jawab langsung tanpa pembuka.`,
        }],
        temperature: 0.4,
        max_tokens: 200,
      });
      return completion.choices[0]?.message?.content?.trim() ?? '';
    } catch {
      return `Area ${area} di ${city} memiliki ${stats.totalListings} listing properti aktif di portal properti.`;
    }
  }
}
