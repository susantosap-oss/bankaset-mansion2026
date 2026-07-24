/**
 * Canonical city names for Jawa Timur — 9 Kota + 29 Kabupaten.
 *
 * Aturan display:
 *   - Kota (ada walikota)          → nama polos, tanpa prefix   → "Surabaya"
 *   - Kabupaten tanpa pasangan Kota → nama polos                → "Sidoarjo"
 *   - Kabupaten YG punya pasangan Kota → "Kab. X"              → "Kab. Malang"
 *
 * Semua variasi input (lowercase, dengan/tanpa prefix, singkatan) → satu canonical.
 */
export const CITY_CANONICAL: Record<string, string> = {
  // ── 9 Kota Jawa Timur ──────────────────────────────────────────
  'surabaya':           'Surabaya',
  'kota surabaya':      'Surabaya',
  'malang':             'Malang',
  'kota malang':        'Malang',
  'malang kota':        'Malang',
  'batu':               'Batu',
  'kota batu':          'Batu',
  'kediri':             'Kediri',
  'kota kediri':        'Kediri',
  'blitar':             'Blitar',
  'kota blitar':        'Blitar',
  'probolinggo':        'Probolinggo',
  'kota probolinggo':   'Probolinggo',
  'pasuruan':           'Pasuruan',
  'kota pasuruan':      'Pasuruan',
  'mojokerto':          'Mojokerto',
  'kota mojokerto':     'Mojokerto',
  'madiun':             'Madiun',
  'kota madiun':        'Madiun',

  // ── Kabupaten tanpa pasangan Kota (nama polos) ────────────────
  'sidoarjo':              'Sidoarjo',
  'kabupaten sidoarjo':    'Sidoarjo',
  'gresik':                'Gresik',
  'kabupaten gresik':      'Gresik',
  'jember':                'Jember',
  'kabupaten jember':      'Jember',
  'banyuwangi':            'Banyuwangi',
  'kabupaten banyuwangi':  'Banyuwangi',
  'tulungagung':           'Tulungagung',
  'kabupaten tulungagung': 'Tulungagung',
  'jombang':               'Jombang',
  'kabupaten jombang':     'Jombang',
  'bojonegoro':            'Bojonegoro',
  'kabupaten bojonegoro':  'Bojonegoro',
  'lamongan':              'Lamongan',
  'kabupaten lamongan':    'Lamongan',
  'tuban':                 'Tuban',
  'kabupaten tuban':       'Tuban',
  'nganjuk':               'Nganjuk',
  'kabupaten nganjuk':     'Nganjuk',
  'ngawi':                 'Ngawi',
  'kabupaten ngawi':       'Ngawi',
  'magetan':               'Magetan',
  'kabupaten magetan':     'Magetan',
  'pamekasan':             'Pamekasan',
  'kabupaten pamekasan':   'Pamekasan',
  'sumenep':               'Sumenep',
  'kabupaten sumenep':     'Sumenep',
  'sampang':               'Sampang',
  'kabupaten sampang':     'Sampang',
  'bangkalan':             'Bangkalan',
  'kabupaten bangkalan':   'Bangkalan',
  'lumajang':              'Lumajang',
  'kabupaten lumajang':    'Lumajang',
  'situbondo':             'Situbondo',
  'kabupaten situbondo':   'Situbondo',
  'bondowoso':             'Bondowoso',
  'kabupaten bondowoso':   'Bondowoso',
  'trenggalek':            'Trenggalek',
  'kabupaten trenggalek':  'Trenggalek',
  'ponorogo':              'Ponorogo',
  'kabupaten ponorogo':    'Ponorogo',
  'pacitan':               'Pacitan',
  'kabupaten pacitan':     'Pacitan',

  // ── Kabupaten YG punya pasangan Kota → "Kab. X" ──────────────
  'kabupaten malang':      'Kab. Malang',
  'kabupaten kediri':      'Kab. Kediri',
  'kabupaten blitar':      'Kab. Blitar',
  'kabupaten probolinggo': 'Kab. Probolinggo',
  'kabupaten pasuruan':    'Kab. Pasuruan',
  'kabupaten mojokerto':   'Kab. Mojokerto',
  'kabupaten madiun':      'Kab. Madiun',
};

export const CITY_ABBREVIATIONS: Record<string, string> = {
  // Surabaya Raya
  sby: 'surabaya', sda: 'sidoarjo', gsk: 'gresik', grs: 'gresik',
  mjk: 'mojokerto', mjo: 'mojokerto', mlg: 'malang',
  // Jawa Timur lainnya
  btu: 'batu',  kdr: 'kediri',  mdn: 'madiun',  jbr: 'jember',
  bwi: 'banyuwangi', psr: 'pasuruan', pas: 'pasuruan',
  pbg: 'probolinggo', prb: 'probolinggo', blt: 'blitar',
  tlg: 'tulungagung', jmb: 'jombang', bjn: 'bojonegoro', bjo: 'bojonegoro',
  lmg: 'lamongan', tbn: 'tuban', njk: 'nganjuk', ngw: 'ngawi',
  mgt: 'magetan', pmk: 'pamekasan', snp: 'sumenep', smp: 'sampang',
  bkl: 'bangkalan', lmj: 'lumajang', stb: 'situbondo', bdw: 'bondowoso',
  tgk: 'trenggalek', pnr: 'ponorogo', pct: 'pacitan',
};

/**
 * Konversi string kota apapun → canonical display name.
 * Handles: singkatan (SBY), prefix (Kota/Kab./Kabupaten), case apapun.
 * Jika tidak dikenal → Title Case dari input asli.
 */
export function canonicalize(raw: string): string {
  if (!raw?.trim()) return '';
  let lower = raw.toLowerCase().trim();

  // Expand singkatan (tidak ada spasi = kemungkinan kode)
  if (!lower.includes(' ')) {
    const code = lower.replace(/\./g, '');
    if (CITY_ABBREVIATIONS[code]) lower = CITY_ABBREVIATIONS[code];
  }

  // Normalisasi prefix "kab." → "kabupaten"
  lower = lower.replace(/^kab\.\s*/, 'kabupaten ').replace(/^kab\s+/, 'kabupaten ');

  return CITY_CANONICAL[lower] ?? raw.trim().replace(/\b\w/g, (c) => c.toUpperCase());
}
