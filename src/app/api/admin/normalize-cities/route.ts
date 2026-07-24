import { NextRequest } from 'next/server';
import { ok, err, requirePrivileged } from '@/lib/api';
import { getAssetRepository, getGeographicFilterService } from '@/lib/container';
import { canonicalize } from '@/lib/cityUtils';

export const maxDuration = 60;

export async function POST(_req: NextRequest) {
  const { error } = await requirePrivileged();
  if (error) return error;

  try {
    const assetRepo = getAssetRepository();
    const geoService = getGeographicFilterService();

    const { data: all } = await assetRepo.findAll(undefined, { page: 1, limit: 9999 });

    const toUpdate: Array<{ assetId: string; city: string; district?: string; area?: string }> = [];

    for (const asset of all) {
      const currentCity = asset.city?.trim() ?? '';

      if (!currentCity) {
        // Kota kosong — coba ekstrak dari alamat
        if (!asset.address?.trim()) continue;
        const extracted = geoService.extractFromAddress(asset.address);
        if (!extracted.city) continue;
        toUpdate.push({
          assetId: asset.assetId,
          city: extracted.city, // sudah canonical dari extractFromAddress
          district: !asset.district?.trim() && extracted.district ? extracted.district : undefined,
          area: !asset.area?.trim() && extracted.area ? extracted.area : undefined,
        });
      } else {
        // Kota ada — canonicalize agar tidak ada duplikat ("Kota Surabaya" → "Surabaya")
        const canonical = canonicalize(currentCity);
        if (canonical !== currentCity) {
          toUpdate.push({ assetId: asset.assetId, city: canonical });
        }
      }
    }

    const updated = await assetRepo.bulkNormalizeCities(toUpdate);

    return ok({
      scanned: all.length,
      candidates: toUpdate.length,
      updated,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[POST /api/admin/normalize-cities]', msg);
    return err('SERVER_ERROR', `Normalisasi gagal: ${msg}`, 500);
  }
}
