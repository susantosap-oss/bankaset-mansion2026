import { AssetType, COMMERCIAL_ASSET_TYPES, normalizeAssetType } from '@/domain/value-objects/AssetType';
import { canonicalize, CITY_ABBREVIATIONS, CITY_CANONICAL } from '@/lib/cityUtils';

export type FilterRegion = 'SURABAYA_RAYA' | 'JAWA_TIMUR' | 'OUTSIDE';

export type FilterReason =
  | 'ACCEPTED_SURABAYA_RAYA'
  | 'ACCEPTED_COMMERCIAL_JATIM'
  | 'REJECTED_OUTSIDE_JATIM'
  | 'REJECTED_NON_COMMERCIAL_OUTSIDE_SURABAYA_RAYA';

export interface GeoFilterResult {
  accepted: boolean;
  region: FilterRegion;
  reason: FilterReason;
  normalizedCity: string; // canonical display name — used as stored city value
}

// ── Internal matching sets (lowercase) ────────────────────────────
// Surabaya Raya = Surabaya + Gresik + Sidoarjo + Mojokerto + Malang Kota
// Semua tipe asset diterima di wilayah ini.
const SURABAYA_RAYA_DISPLAY = new Set([
  'Surabaya', 'Sidoarjo', 'Gresik', 'Mojokerto', 'Kab. Mojokerto', 'Malang',
]);

// All valid canonical display names for Jawa Timur
const JATIM_CANONICAL_NAMES = new Set(Object.values(CITY_CANONICAL));

// Keywords for fast PDF page pre-filter (Pass 1)
export const JAWA_TIMUR_KEYWORDS: string[] = [
  'surabaya', 'sidoarjo', 'gresik', 'mojokerto',
  'malang', 'kediri', 'jember', 'banyuwangi', 'madiun',
  'pasuruan', 'probolinggo', 'blitar', 'tulungagung',
  'jombang', 'bojonegoro', 'lamongan', 'tuban', 'nganjuk',
  'ngawi', 'magetan', 'pamekasan', 'sumenep', 'sampang',
  'bangkalan', 'lumajang', 'situbondo', 'bondowoso',
  'trenggalek', 'ponorogo', 'pacitan', 'batu',
  'jawa timur', 'jatim',
  'sby', 'sda', 'gsk',
];

export class GeographicFilterService {
  filter(rawCity: string, rawAssetType: string): GeoFilterResult {
    const canonical = canonicalize(rawCity);
    const inJatim = JATIM_CANONICAL_NAMES.has(canonical) || this.fuzzyInJatim(rawCity);

    if (!inJatim) {
      return {
        accepted: false,
        region: 'OUTSIDE',
        reason: 'REJECTED_OUTSIDE_JATIM',
        normalizedCity: canonical,
      };
    }

    const inSurabayaRaya = SURABAYA_RAYA_DISPLAY.has(canonical);

    if (inSurabayaRaya) {
      return {
        accepted: true,
        region: 'SURABAYA_RAYA',
        reason: 'ACCEPTED_SURABAYA_RAYA',
        normalizedCity: canonical,
      };
    }

    const assetType: AssetType = normalizeAssetType(rawAssetType);
    const isCommercial = COMMERCIAL_ASSET_TYPES.includes(assetType);

    if (!isCommercial) {
      return {
        accepted: false,
        region: 'JAWA_TIMUR',
        reason: 'REJECTED_NON_COMMERCIAL_OUTSIDE_SURABAYA_RAYA',
        normalizedCity: canonical,
      };
    }

    return {
      accepted: true,
      region: 'JAWA_TIMUR',
      reason: 'ACCEPTED_COMMERCIAL_JATIM',
      normalizedCity: canonical,
    };
  }

  /**
   * Parse city, district, and area from a free-form Indonesian address string.
   * Returns canonical display name for city.
   */
  extractFromAddress(address: string): { city?: string; district?: string; area?: string } {
    const lower = address.toLowerCase();
    const out: { city?: string; district?: string; area?: string } = {};

    // Kecamatan: "Kec. Wonokromo" / "Kecamatan Wonokromo"
    const kecMatch = lower.match(/\bkec(?:amatan)?\.?\s+([a-z][a-z\s-]{1,30}?)(?=[,.\d\n]|$)/);
    if (kecMatch) {
      out.district = kecMatch[1].trim().replace(/\b\w/g, (c) => c.toUpperCase());
    }

    // Kelurahan: "Kel. Rungkut Kidul" / "Kelurahan Rungkut"
    const kelMatch = lower.match(/\bkel(?:urahan)?\.?\s+([a-z][a-z\s-]{1,30}?)(?=[,.\d\n]|$)/);
    if (kelMatch) {
      out.area = kelMatch[1].trim().replace(/\b\w/g, (c) => c.toUpperCase());
    }

    // City step 1: cek singkatan sebagai token tersendiri
    for (const [abbr, fullCity] of Object.entries(CITY_ABBREVIATIONS)) {
      const pattern = new RegExp(`(?:^|[^a-z])${abbr}(?:[^a-z]|$)`);
      if (pattern.test(lower)) {
        out.city = canonicalize(fullCity);
        break;
      }
    }

    // City step 2: jika belum ketemu, scan nama canonical — terpanjang dulu
    if (!out.city) {
      const sorted = [...Object.keys(CITY_CANONICAL)].sort((a, b) => b.length - a.length);
      for (const key of sorted) {
        const pattern = new RegExp(`\\b${key.replace(/\s+/g, '\\s+')}\\b`);
        if (pattern.test(lower)) {
          out.city = CITY_CANONICAL[key];
          break;
        }
      }
    }

    return out;
  }

  /** Fast keyword check for PDF page pre-filter (Pass 1) */
  pageContainsJawaTimur(pageText: string): boolean {
    const lower = pageText.toLowerCase();
    return JAWA_TIMUR_KEYWORDS.some((kw) => lower.includes(kw));
  }

  isInJawaTimur(rawCity: string): boolean {
    return JATIM_CANONICAL_NAMES.has(canonicalize(rawCity)) || this.fuzzyInJatim(rawCity);
  }

  // Partial match fallback untuk typo / variasi tak terduga
  private fuzzyInJatim(rawCity: string): boolean {
    const lower = rawCity.toLowerCase().trim();
    return [...JATIM_CANONICAL_NAMES].some(
      (name) => lower.includes(name.toLowerCase()) || name.toLowerCase().includes(lower)
    );
  }
}
