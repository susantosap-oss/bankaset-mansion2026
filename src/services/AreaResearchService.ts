import Groq from 'groq-sdk';

export interface DemandRankEntry {
  area: string;
  demandScore: number;
  liquidityScore: number;
  /** Volume pencarian Google (totalResults dari query buyer-intent) */
  searchVolume: number;
  listingCount: number; // listing aktif di portal (sinyal likuiditas)
  medianPrice: number;  // per m², Rp
}

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
  /** Pernyataan eksplisit area dengan demand pencarian Google tertinggi */
  topDemandStatement?: string;
  /** Ranking area berdasarkan volume pencarian Google pembeli */
  demandRanking?: DemandRankEntry[];
  /** Harga pasar estimasi (Rp/m²) dari area demand tertinggi */
  marketPriceEst?: number;
  /** Sumber kandidat area: dari database asset atau dari AI discovery */
  candidateSource?: 'DATABASE' | 'AI_DISCOVERY';
  /** Jumlah asset Sellable yang ditemukan per kecamatan (hanya jika candidateSource=DATABASE) */
  dbAssetCounts?: Record<string, number>;
  portalStats?: { portal: string; listingCount: number; medianPrice: number }[];
  alternatives?: AreaResearchResult[];
}

// Internal — bawa raw search volume agar bisa dipakai di ranking
interface AreaResearchInternal extends AreaResearchResult {
  _buyerSearchVolume: number;
  _portalListingCount: number;
}

interface SerperResult {
  totalResults: string;
  organic: Array<{ title: string; snippet: string; link: string }>;
}

const GROQ_MODEL = 'llama-3.3-70b-versatile';

const PORTALS = [
  { name: 'rumah123.com', site: 'rumah123.com' },
  { name: 'lamudi.co.id',  site: 'lamudi.co.id' },
  { name: 'olx.co.id',     site: 'olx.co.id' },
];

// ── Serper ─────────────────────────────────────────────────────────

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

// ── Parse helper ───────────────────────────────────────────────────
// Handles: "1.230.000", "1,230,000", "Sekitar 1.230.000 hasil", "About 1,230,000"
// Strategy: buang semua non-digit, join digit groups
function parseSearchResultCount(s: string): number {
  if (!s) return 0;
  // Ambil semua kelompok digit, gabungkan
  const groups = s.match(/\d+/g);
  if (!groups || groups.length === 0) return 0;
  // Jika ada beberapa grup (separator), gabungkan semua jadi satu angka
  return parseInt(groups.join(''), 10) || 0;
}

// ── Demand scoring — dari Google search volume buyer-intent ────────
// Input: totalResults query "beli rumah {area} {city}"
// Angka totalResults Google bisa ratusan ribu → jutaan untuk area populer
function demandFromSearchVolume(totalResults: number): number {
  if (totalResults >= 5_000_000) return 95;
  if (totalResults >= 2_000_000) return 88;
  if (totalResults >= 500_000)   return 80;
  if (totalResults >= 100_000)   return 70;
  if (totalResults >= 50_000)    return 60;
  if (totalResults >= 10_000)    return 48;
  if (totalResults >= 5_000)     return 38;
  if (totalResults >= 1_000)     return 27;
  if (totalResults >= 100)       return 18;
  return 10;
}

// ── Liquidity scoring — dari listing aktif di portal ──────────────
function liquidityFromPortalCount(portalsWithData: number, portalsWithListings: number): number {
  const base = portalsWithData * 25;
  const bonus = Math.min(20, portalsWithListings * 7);
  return Math.min(95, base + bonus);
}

// ── Price extraction ───────────────────────────────────────────────

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

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

function extractListingCount(text: string): number {
  const m = text.match(/(\d[\d.]*)\+?\s*(?:properti|rumah|ruko|tanah|kavling|unit|listing|iklan|apartemen|gudang|pabrik|lahan)/i);
  if (!m) return 0;
  return parseInt(m[1].replace(/\./g, ''), 10) || 0;
}

// ── Area name extraction dari URL portal ──────────────────────────

const PROPERTY_TYPE_SLUGS = new Set([
  'rumah', 'apartemen', 'ruko', 'tanah', 'kavling', 'gudang',
  'kos', 'vila', 'kantor', 'hotel', 'residensial', 'komersial',
]);
const GENERIC_SLUGS = new Set([
  'beli', 'sewa', 'jual', 'baru', 'bekas', 'murah', 'dijual',
  'disewa', 'properti', 'listing', 'all', 'lainnya',
]);

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
    if (/^\d/.test(candidate) || (candidate.startsWith('r') && /\d{4,}/.test(candidate))) return null;
    if (candidate.length < 3 || candidate.length > 40) return null;
    return slugToName(candidate);
  } catch {
    return null;
  }
}

// Ekstrak area dari snippets hasil pencarian buyer-intent
// Contoh: "Rumah dijual di Rungkut, Surabaya" → "Rungkut"
function extractAreasFromSnippets(
  organics: Array<{ title: string; snippet: string }>,
  cityName: string,
): string[] {
  const cityKey = cityName.toLowerCase().replace(/^kota\s+|^kabupaten\s+/, '');
  const stopWords = new Set([
    'Properti', 'Rumah', 'Ruko', 'Apartemen', 'Tanah', 'Jual', 'Dijual',
    'Beli', 'Cari', 'Indonesia', 'Jawa', 'Timur', 'Google', 'Portal',
    'Listing', 'Harga', 'Murah', 'Baru', 'Bekas', 'Total', 'Unit',
  ]);

  const mentions = new Map<string, number>();

  for (const o of organics) {
    const text = `${o.title} ${o.snippet}`;

    // Pattern 1: "di/kawasan/kecamatan/area {NamaArea}"
    const re1 = /(?:di|kawasan|kecamatan|area|daerah|kelurahan)\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?)/g;
    for (const m of text.matchAll(re1)) {
      const name = m[1].trim();
      if (name.length < 3 || name.length > 30) continue;
      if (name.toLowerCase() === cityKey) continue;
      if (stopWords.has(name)) continue;
      mentions.set(name, (mentions.get(name) ?? 0) + 2);
    }

    // Pattern 2: "{NamaArea}, {city}" atau "{NamaArea} {city}"
    const re2 = new RegExp(`([A-Z][a-zA-Z]+(?:\\s+[A-Z][a-zA-Z]+)?)[,\\s]+${cityKey}`, 'gi');
    for (const m of text.matchAll(re2)) {
      const name = m[1].trim();
      if (name.length < 3 || name.length > 30) continue;
      if (stopWords.has(name)) continue;
      mentions.set(name, (mentions.get(name) ?? 0) + 1);
    }
  }

  return [...mentions.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([area]) => area);
}

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

  async research(
    area: string | null | undefined,
    city: string,
    dbCandidates: string[] = [],
  ): Promise<AreaResearchResult> {
    const hasSerper = !!process.env.SERPER_API_KEY;
    const areaProvided = area?.trim() || '';
    const suggestArea = !areaProvided;

    if (hasSerper) {
      return suggestArea
        ? this.discoverAndResearch(city, dbCandidates)
        : this.researchSingleArea(areaProvided, city);
    }

    return this.researchWithGroq(areaProvided || null, city);
  }

  // ── Mode 1: area sudah diisi ───────────────────────────────────

  private async researchSingleArea(area: string, city: string): Promise<AreaResearchResult> {
    const r = await this.researchAreaFull(area, city);
    const { _buyerSearchVolume, _portalListingCount, ...clean } = r;
    return {
      ...clean,
      topDemandStatement:
        `${area}, ${city} — ${_buyerSearchVolume.toLocaleString('id-ID')} hasil pencarian Google` +
        (r.suggestedDemandScore >= 70 ? ' (demand TINGGI)' :
         r.suggestedDemandScore >= 48 ? ' (demand SEDANG)' : ' (demand RENDAH)') +
        (r.suggestedMedianPrice > 0
          ? ` · harga pasar est. Rp ${(r.suggestedMedianPrice / 1_000_000).toFixed(1)}jt/m²`
          : ''),
    };
  }

  // ── Mode 2: auto-discover — cari kecamatan dengan demand Google tertinggi ──
  //
  // Prioritas kandidat:
  //   1. dbCandidates  — kecamatan dari asset Sellable di database (paling relevan)
  //   2. Groq suggestion — kecamatan populer dari training data
  //   3. Snippet buyer search — ekstrak dari organic results

  private async discoverAndResearch(city: string, dbCandidates: string[] = []): Promise<AreaResearchResult> {
    // Path cepat: jika ada data dari database, langsung score — skip Groq & snippet
    if (dbCandidates.length > 0) {
      return this.researchFromDbCandidates(city, dbCandidates);
    }
    const slug = cityToSlug(city);

    // ── Step 1a: Groq suggest kandidat kecamatan ──────────────────
    const [groqCandidates, buyerDiscovery] = await Promise.all([
      this.getCandidateAreasFromGroq(city),
      serperSearch(`beli rumah kecamatan ${city} Jawa Timur`),
    ]);

    // ── Step 1b: Ekstrak nama area dari snippets buyer search ──────
    const snippetCandidates = extractAreasFromSnippets(buyerDiscovery.organic, city);

    // ── Step 1c: Fallback portal URL untuk area backup ─────────────
    const portalDiscover = await serperSearch(`site:rumah123.com/jual/${slug} properti dijual`);
    const pathPrefix = `/jual/${slug}/`;
    const portalCandidates: string[] = [];
    for (const r of portalDiscover.organic) {
      try {
        if (!new URL(r.link).pathname.toLowerCase().includes(pathPrefix)) continue;
      } catch { continue; }
      const area = extractAreaFromUrl(r.link, slug);
      if (area) portalCandidates.push(area);
    }

    // Prioritas: Groq > snippet buyer > portal (supply-based, paling rendah)
    const merged = [...groqCandidates, ...snippetCandidates, ...portalCandidates];
    const uniqueCandidates = [...new Map(merged.map((a) => [a.toLowerCase(), a])).values()].slice(0, 5);

    if (uniqueCandidates.length === 0) {
      return {
        area: '',
        city,
        suggestedDemandScore: 0,
        suggestedLiquidityScore: 0,
        suggestedMedianPrice: 0,
        topDemandStatement: `Tidak ditemukan kandidat kecamatan untuk ${city}. Isi nama area secara manual.`,
        reasoning: 'Tidak dapat menemukan area kandidat. Coba isi nama area secara manual.',
        sources: [],
        method: 'PORTAL_DATA',
        confidence: 'LOW',
        areaWasSuggested: true,
      };
    }

    // ── Step 2: Ukur demand tiap kandidat dari Google search volume ──
    const settled = await Promise.allSettled(
      uniqueCandidates.map((area) => this.researchAreaFull(area, city))
    );

    const results = settled
      .filter((r): r is PromiseFulfilledResult<AreaResearchInternal> => r.status === 'fulfilled')
      .map((r) => r.value);

    if (results.length === 0) {
      return {
        area: '',
        city,
        suggestedDemandScore: 0,
        suggestedLiquidityScore: 0,
        suggestedMedianPrice: 0,
        topDemandStatement: `Riset demand gagal untuk ${city}. Coba isi area secara manual.`,
        reasoning: 'Riset gagal. Coba isi nama area secara manual.',
        sources: [],
        method: 'PORTAL_DATA',
        confidence: 'LOW',
        areaWasSuggested: true,
      };
    }

    // Sort by demand score (dari Google search volume pembeli) — tertinggi jadi utama
    results.sort((a, b) => b.suggestedDemandScore - a.suggestedDemandScore);

    const demandRanking: DemandRankEntry[] = results.map((r) => ({
      area: r.area,
      demandScore: r.suggestedDemandScore,
      liquidityScore: r.suggestedLiquidityScore,
      searchVolume: r._buyerSearchVolume,
      listingCount: r._portalListingCount,
      medianPrice: r.suggestedMedianPrice,
    }));

    const [main, ...rest] = results;
    const topDemandStatement =
      `Demand pencarian Google terbanyak di ${city} ada di ${main.area}` +
      (main._buyerSearchVolume > 0
        ? ` (${main._buyerSearchVolume.toLocaleString('id-ID')} hasil pencarian pembeli)`
        : '') +
      (main.suggestedMedianPrice > 0
        ? ` — harga pasar est. Rp ${(main.suggestedMedianPrice / 1_000_000).toFixed(1)}jt/m²`
        : '');

    const { _buyerSearchVolume: _mv, _portalListingCount: _ml, ...mainClean } = main;
    const alternativesClean = rest.map(({ _buyerSearchVolume: _v, _portalListingCount: _l, ...r }) => ({
      ...r,
      areaWasSuggested: true,
    }));

    return {
      ...mainClean,
      areaWasSuggested: true,
      topDemandStatement,
      demandRanking,
      marketPriceEst: main.suggestedMedianPrice > 0 ? main.suggestedMedianPrice : undefined,
      alternatives: alternativesClean,
    };
  }

  // ── Mode 2b: kandidat dari database asset Sellable ────────────────
  // Score tiap kecamatan dari demand Google — ranking = kecamatan mana
  // yang paling banyak dicari pembeli di kota yang sama

  private async researchFromDbCandidates(city: string, candidates: string[]): Promise<AreaResearchResult> {
    const settled = await Promise.allSettled(
      candidates.map((area) => this.researchAreaFull(area, city))
    );

    const results = settled
      .filter((r): r is PromiseFulfilledResult<AreaResearchInternal> => r.status === 'fulfilled')
      .map((r) => r.value);

    if (results.length === 0) {
      return {
        area: '',
        city,
        suggestedDemandScore: 0,
        suggestedLiquidityScore: 0,
        suggestedMedianPrice: 0,
        topDemandStatement: `Riset demand gagal untuk asset di ${city}. Coba isi area secara manual.`,
        reasoning: 'Riset gagal. Coba isi nama area secara manual.',
        sources: [],
        method: 'PORTAL_DATA',
        confidence: 'LOW',
        areaWasSuggested: true,
        candidateSource: 'DATABASE',
      };
    }

    results.sort((a, b) => b.suggestedDemandScore - a.suggestedDemandScore);

    const demandRanking: DemandRankEntry[] = results.map((r) => ({
      area: r.area,
      demandScore: r.suggestedDemandScore,
      liquidityScore: r.suggestedLiquidityScore,
      searchVolume: r._buyerSearchVolume,
      listingCount: r._portalListingCount,
      medianPrice: r.suggestedMedianPrice,
    }));

    const [main, ...rest] = results;
    const topDemandStatement =
      `Dari asset Sellable di ${city}, demand Google tertinggi ada di ${main.area}` +
      (main._buyerSearchVolume > 0
        ? ` (${main._buyerSearchVolume.toLocaleString('id-ID')} hasil pencarian)`
        : '') +
      (main.suggestedMedianPrice > 0
        ? ` · harga pasar est. Rp ${(main.suggestedMedianPrice / 1_000_000).toFixed(1)}jt/m²`
        : '');

    const { _buyerSearchVolume: _mv, _portalListingCount: _ml, ...mainClean } = main;
    const alternativesClean = rest.map(({ _buyerSearchVolume: _v, _portalListingCount: _l, ...r }) => ({
      ...r,
      areaWasSuggested: true,
    }));

    return {
      ...mainClean,
      areaWasSuggested: true,
      topDemandStatement,
      demandRanking,
      marketPriceEst: main.suggestedMedianPrice > 0 ? main.suggestedMedianPrice : undefined,
      candidateSource: 'DATABASE',
      alternatives: alternativesClean,
    };
  }

  // ── Core: riset satu area ─────────────────────────────────────────
  // Demand  = totalResults Google query "properti {area} {city}"
  //           semakin banyak hasil = area semakin banyak dicari = demand tinggi
  // Likuid. = listing aktif di portal properti (rumah123, lamudi, olx)

  private async researchAreaFull(area: string, city: string): Promise<AreaResearchInternal> {
    // Satu demand query — cukup untuk sinyal pencarian, hemat Serper quota
    const demandQuery = `properti ${area} ${city}`;

    // Parallel: demand query + 3 portal queries = 4 calls per area
    const [demandResult, ...portalResults] = await Promise.all([
      serperSearch(demandQuery),
      ...PORTALS.map((p) => serperSearch(`properti dijual ${area} ${city} site:${p.site}`)),
    ]);

    const rawTotal = demandResult.totalResults;
    let buyerSearchVolume = parseSearchResultCount(rawTotal);

    // Debug: lihat format raw dari Serper agar bisa diperbaiki jika perlu
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[demand] "${demandQuery}" → totalResults="${rawTotal}" → parsed=${buyerSearchVolume}`);
    }

    // Fallback: jika totalResults tidak dapat diparsing (API format berubah),
    // estimasi dari organic results — Serper mengembalikan top N hasil yang relevan
    if (buyerSearchVolume === 0 && demandResult.organic.length > 0) {
      // 10 organic hasil ≈ Google punya setidaknya ratusan ribu halaman relevan
      buyerSearchVolume = demandResult.organic.length * 50_000;
    }

    const demandScore = demandFromSearchVolume(buyerSearchVolume);

    // ── Likuiditas & harga: dari portal listing ─────────────────────
    type PortalData = {
      portal: string; listingCount: number; perSqmPrice: number;
      hasResults: boolean; links: string[];
    };
    const portalData: PortalData[] = portalResults.map((data, i) => {
      let listingCount = 0;
      let perSqmPrice = 0;
      for (const r of data.organic) {
        const text = `${r.title} ${r.snippet}`;
        listingCount += extractListingCount(text);
        const p = extractPerSqmPrice(text);
        if (p > perSqmPrice) perSqmPrice = p;
      }
      return {
        portal: PORTALS[i].name,
        listingCount,
        perSqmPrice,
        hasResults: data.organic.length > 0,
        links: data.organic.slice(0, 2).map((o) => o.link),
      };
    });

    const portalsWithData = portalData.filter((p) => p.hasResults).length;
    const portalsWithListings = portalData.filter((p) => p.listingCount > 0).length;
    const totalListings = portalData.reduce((s, p) => s + p.listingCount, 0);
    const sqmPrices = portalData.map((p) => p.perSqmPrice).filter((v) => v > 0);
    const medianPerSqm = Math.round(median(sqmPrices));

    const liquidityScore = liquidityFromPortalCount(portalsWithData, portalsWithListings);
    const confidence: AreaResearchResult['confidence'] =
      portalsWithData >= 2 ? 'HIGH' : portalsWithData === 1 ? 'MEDIUM' : 'LOW';

    const reasoning = await this.generateReasoning(area, city, {
      buyerSearchVolume,
      totalListings,
      portalsWithData,
      medianPrice: medianPerSqm,
    });

    return {
      area,
      city,
      suggestedDemandScore: demandScore,
      suggestedLiquidityScore: liquidityScore,
      suggestedMedianPrice: medianPerSqm,
      reasoning,
      sources: portalData.flatMap((p) => p.links).filter(Boolean),
      method: 'PORTAL_DATA',
      confidence,
      areaWasSuggested: false,
      portalStats: portalData.map((p) => ({
        portal: p.portal,
        listingCount: p.listingCount,
        medianPrice: p.perSqmPrice,
      })),
      _buyerSearchVolume: buyerSearchVolume,
      _portalListingCount: totalListings,
    };
  }

  // ── Groq: suggest kandidat kecamatan ─────────────────────────────
  // Groq punya knowledge tentang kecamatan populer di kota-kota Jawa Timur

  private async getCandidateAreasFromGroq(city: string): Promise<string[]> {
    try {
      const completion = await this.groq.chat.completions.create({
        model: GROQ_MODEL,
        messages: [{
          role: 'user',
          content: `Sebutkan 5 kecamatan di ${city}, Jawa Timur yang paling banyak dicari pembeli properti (rumah, ruko, tanah). Berdasarkan popularitas & aktivitas pasar properti.
Format hanya JSON array: ["kecamatan1","kecamatan2","kecamatan3","kecamatan4","kecamatan5"]
Tanpa penjelasan, tanpa prefix "Kecamatan".`,
        }],
        temperature: 0.2,
        max_tokens: 80,
      });
      const raw = completion.choices[0]?.message?.content ?? '[]';
      const match = raw.match(/\[[\s\S]*?\]/);
      if (!match) return [];
      const parsed = JSON.parse(match[0]) as unknown[];
      return parsed.filter((s): s is string => typeof s === 'string').slice(0, 5);
    } catch {
      return [];
    }
  }

  // ── Mode 3: Groq knowledge (no Serper) ───────────────────────────

  private async researchWithGroq(area: string | null, city: string): Promise<AreaResearchResult> {
    const suggestArea = !area;
    const prompt = suggestArea
      ? `Kamu adalah analis pasar properti Jawa Timur. Rekomendasikan kecamatan dengan demand pencarian Google tertinggi di ${city}, Jawa Timur.

Format JSON (hanya JSON):
{
  "suggestedArea": "<nama kecamatan>",
  "demandScore": <0-100, berdasarkan banyaknya pencarian pembeli>,
  "liquidityScore": <0-100, berdasarkan ketersediaan listing>,
  "medianPrice": <harga median per m² dalam rupiah>,
  "reasoning": "<2-3 kalimat alasan>",
  "confidence": "MEDIUM"
}`
      : `Kamu adalah analis pasar properti Jawa Timur. Estimasi skor untuk:
- Area: ${area}
- Kota: ${city}, Jawa Timur

Format JSON (hanya JSON):
{
  "demandScore": <0-100, berdasarkan banyaknya pencarian pembeli di Google>,
  "liquidityScore": <0-100>,
  "medianPrice": <harga median per m² dalam rupiah>,
  "reasoning": "<2-3 kalimat>",
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

    const resolvedArea = suggestArea ? String(parsed.suggestedArea ?? '').trim() : area!;

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

  // ── Groq reasoning — menyebut search volume, bukan listing ───────

  private async generateReasoning(
    area: string,
    city: string,
    stats: { buyerSearchVolume: number; totalListings: number; portalsWithData: number; medianPrice: number },
  ): Promise<string> {
    const demandLevel =
      stats.buyerSearchVolume >= 500_000 ? 'sangat tinggi' :
      stats.buyerSearchVolume >= 100_000 ? 'tinggi' :
      stats.buyerSearchVolume >= 10_000  ? 'sedang' :
      stats.buyerSearchVolume >= 1_000   ? 'rendah' : 'sangat rendah';

    try {
      const completion = await this.groq.chat.completions.create({
        model: GROQ_MODEL,
        messages: [{
          role: 'user',
          content: `Jelaskan potensi properti di ${area}, ${city} Jawa Timur dalam 2-3 kalimat singkat.
Data: volume pencarian Google ${stats.buyerSearchVolume.toLocaleString('id-ID')} hasil (tingkat demand: ${demandLevel}), ${stats.totalListings} listing aktif di ${stats.portalsWithData} portal properti, median harga Rp ${(stats.medianPrice / 1_000_000).toFixed(0)} juta/m².
Aturan: semakin tinggi volume pencarian Google = semakin besar demand pembeli. Jelaskan sesuai level demand tersebut. Fokus pada karakteristik kawasan dan daya tarik investasi. Jawab langsung tanpa pembuka.`,
        }],
        temperature: 0.4,
        max_tokens: 200,
      });
      return completion.choices[0]?.message?.content?.trim() ?? '';
    } catch {
      return `${area}, ${city}: volume pencarian Google ${stats.buyerSearchVolume.toLocaleString('id-ID')} hasil (demand ${demandLevel}), ${stats.totalListings} listing aktif di portal.`;
    }
  }
}
