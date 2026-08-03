import { NextRequest } from 'next/server';
import { ok, err, requirePrivileged } from '@/lib/api';
import { getGeographicFilterService, getAssetRepository } from '@/lib/container';
import type { PDFExtractedAsset } from '@/types/pdf';
import { CreateAssetInput } from '@/domain/entities/Asset';
import { AssetLabel } from '@/domain/value-objects/AssetLabel';
import { normalizeAssetType } from '@/domain/value-objects/AssetType';
import { autoResearchNewAreas } from '@/lib/autoResearchAreas';

export const maxDuration = 60;

const REJECTED_LABELS: Record<string, string> = {
  REJECTED_OUTSIDE_JATIM: 'Di luar Jawa Timur',
  REJECTED_NON_COMMERCIAL_OUTSIDE_SURABAYA_RAYA: 'Tipe aset tidak diterima di luar Surabaya Raya',
};

export async function POST(req: NextRequest) {
  // Allow local CLI tool via Bearer AUTH_SECRET (bypass session)
  const authHeader = req.headers.get('authorization');
  const isCLI = !!process.env.AUTH_SECRET && authHeader === `Bearer ${process.env.AUTH_SECRET}`;

  if (!isCLI) {
    const { error } = await requirePrivileged();
    if (error) return error;
  }

  try {
    const body = await req.json() as {
      bankName: string;
      assets: PDFExtractedAsset[];
      labelAsset?: AssetLabel;
    };

    const { bankName, assets, labelAsset } = body;

    if (!bankName) return err('VALIDATION_ERROR', 'bankName wajib diisi');
    if (!Array.isArray(assets) || assets.length === 0) return err('VALIDATION_ERROR', 'Tidak ada asset untuk disimpan');
    if (assets.length > 500) return err('VALIDATION_ERROR', 'Maksimal 500 asset per konfirmasi');
    if (labelAsset !== 'CASSIE' && labelAsset !== 'LELANG') {
      return err('VALIDATION_ERROR', 'Label Asset wajib dipilih (Cassie/Lelang)');
    }

    const geoService = getGeographicFilterService();
    const assetRepo = getAssetRepository();

    const toSave: CreateAssetInput[] = [];
    const rejected: Array<{ index: number; city: string; assetType: string; reason: string }> = [];

    for (let i = 0; i < assets.length; i++) {
      const a = assets[i];

      // If city not extracted, try to infer from address
      if (!a.city?.trim() && a.address?.trim()) {
        const extracted = geoService.extractFromAddress(a.address);
        if (extracted.city) a.city = extracted.city;
        if (!a.district && extracted.district) a.district = extracted.district;
        if (!a.area && extracted.area) a.area = extracted.area;
      }

      const geoResult = geoService.filter(a.city, a.assetType);

      if (!geoResult.accepted) {
        rejected.push({
          index: i + 1,
          city: a.city,
          assetType: a.assetType,
          reason: REJECTED_LABELS[geoResult.reason] ?? geoResult.reason,
        });
        continue;
      }

      // Label Asset menentukan Harga Limit:
      // Cassie -> Harga Outstanding; Lelang -> Harga Limit hasil ekstraksi (Harga Lelang)
      const limitPrice = labelAsset === 'CASSIE'
        ? (a.outstanding || 0)
        : (a.limitPrice ?? 0);

      // Ratio per label:
      // Cassie  -> Sisa Hutang Pokok / Outstanding
      // Lelang  -> Limit Price / Market Value (diskon dari pasar)
      const liquidationRatio = labelAsset === 'LELANG'
        ? (a.limitPrice && a.marketValue ? Math.round((a.limitPrice / a.marketValue) * 100) / 100 : undefined)
        : (a.liquidationRatio || undefined);

      toSave.push({
        bankName: a.bankName || bankName,
        assetType: normalizeAssetType(a.assetType),
        city: geoResult.normalizedCity || a.city,
        district: a.district ?? '',
        area: a.area ?? '',
        address: a.address ?? '',
        marketValue: a.marketValue ?? 0,
        outstanding: a.outstanding ?? 0,
        landArea: a.landArea ?? 0,
        buildingArea: a.buildingArea ?? 0,
        status: 'ACTIVE',
        rawRowRef: `pdf:halaman-${a.pageNumber}`,
        debtorName: a.debtorName || undefined,
        principalOutstanding: a.principalOutstanding || undefined,
        liquidationRatio,
        liquidationValue: a.liquidationValue || undefined,
        limitPrice,
        labelAsset,
      });
    }

    let savedCount = 0;
    let failedCount = 0;
    let saveErrors: Array<{ row: number; reason: string }> = [];

    if (toSave.length > 0) {
      const result = await assetRepo.bulkSave(toSave);
      savedCount = result.saved;
      failedCount = result.failed;
      saveErrors = result.errors;
    }

    const areaResearched = await autoResearchNewAreas(toSave).catch(() => 0);

    return ok({
      totalAssets: assets.length,
      accepted: toSave.length,
      rejected: rejected.length,
      savedCount,
      failedCount,
      areaResearched,
      rejectedDetails: rejected.slice(0, 50),
      saveErrors: saveErrors.slice(0, 10),
    });
  } catch (e) {
    console.error('[POST /api/import/pdf/confirm]', e);
    return err('SERVER_ERROR', 'Gagal menyimpan asset dari PDF', 500);
  }
}
