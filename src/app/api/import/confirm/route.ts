import { NextRequest } from 'next/server';
import { ok, err, requirePrivileged } from '@/lib/api';
import {
  getNormalizationService,
  getGeographicFilterService,
  getAssetRepository,
  getBankMappingRepository,
} from '@/lib/container';
import { CanonicalField } from '@/domain/entities/BankMapping';
import { CreateAssetInput } from '@/domain/entities/Asset';
import { AssetLabel } from '@/domain/value-objects/AssetLabel';
import { autoResearchNewAreas } from '@/lib/autoResearchAreas';

export const maxDuration = 60;

const REJECTED_LABELS: Record<string, string> = {
  REJECTED_OUTSIDE_JATIM: 'Di luar Jawa Timur',
  REJECTED_NON_COMMERCIAL_OUTSIDE_SURABAYA_RAYA: 'Tipe aset tidak diterima di luar Surabaya Raya',
};

export async function POST(req: NextRequest) {
  const { error, session } = await requirePrivileged();
  if (error) return error;

  try {
    const body = await req.json() as {
      bankName: string;
      allRows: Record<string, string>[];
      mapping: Record<string, string>;
      saveMappingForBank?: boolean;
      labelAsset?: AssetLabel;
    };

    const { bankName, allRows, mapping, saveMappingForBank, labelAsset } = body;

    if (!bankName || !Array.isArray(allRows) || !mapping) {
      return err('VALIDATION_ERROR', 'bankName, allRows, dan mapping wajib diisi');
    }
    if (labelAsset !== 'CASSIE' && labelAsset !== 'LELANG') {
      return err('VALIDATION_ERROR', 'Label Asset wajib dipilih (Cassie/Lelang)');
    }
    if (allRows.length === 0) return err('VALIDATION_ERROR', 'File tidak memiliki data');
    if (allRows.length > 2000) return err('VALIDATION_ERROR', 'Maksimal 2000 baris per import');

    const normService = getNormalizationService();
    const geoService = getGeographicFilterService();
    const assetRepo = getAssetRepository();

    const resolvedMapping: Record<string, CanonicalField> = {};
    for (const [col, canonical] of Object.entries(mapping)) {
      if (canonical && canonical !== 'ignore') {
        resolvedMapping[col] = canonical as CanonicalField;
      }
    }

    const toSave: CreateAssetInput[] = [];
    const rejected: Array<{ row: number; city: string; assetType: string; reason: string }> = [];

    for (let i = 0; i < allRows.length; i++) {
      const rawRow = allRows[i];
      if (Object.values(rawRow).every((v) => !String(v).trim())) continue;

      const { asset } = normService.normalizeRow(rawRow, resolvedMapping);

      // If city not mapped, try to extract from full address
      if (!asset.city?.trim() && asset.address?.trim()) {
        const extracted = geoService.extractFromAddress(asset.address);
        if (extracted.city) asset.city = extracted.city;
        if (!asset.district && extracted.district) asset.district = extracted.district;
        if (!asset.area && extracted.area) asset.area = extracted.area;
      }

      const city = asset.city ?? '';
      const assetType = asset.assetType ?? '';
      const geoResult = geoService.filter(city, assetType);

      if (!geoResult.accepted) {
        rejected.push({
          row: i + 2,
          city,
          assetType,
          reason: REJECTED_LABELS[geoResult.reason] ?? geoResult.reason,
        });
        continue;
      }

      // Label Asset menentukan Harga Limit:
      // Cassie -> Nilai Pokok Hutang + 3%; Lelang -> Harga Limit dari kolom termapping (Harga Lelang)
      const limitPrice = labelAsset === 'CASSIE'
        ? (asset.principalOutstanding ?? 0) * 1.03
        : (asset.limitPrice ?? 0);

      toSave.push({
        bankName: asset.bankName?.trim() || bankName,
        assetType: asset.assetType || 'OTHER',
        city: geoResult.normalizedCity || city,
        district: asset.district ?? '',
        area: asset.area ?? '',
        address: asset.address ?? '',
        marketValue: asset.marketValue ?? 0,
        outstanding: asset.outstanding ?? 0,
        landArea: asset.landArea ?? 0,
        buildingArea: asset.buildingArea ?? 0,
        status: 'ACTIVE',
        rawRowRef: JSON.stringify(rawRow).slice(0, 300),
        debtorName: asset.debtorName,
        principalOutstanding: asset.principalOutstanding,
        liquidationRatio: asset.liquidationRatio,
        liquidationValue: asset.liquidationValue,
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

    if (saveMappingForBank && Object.keys(resolvedMapping).length > 0) {
      try {
        const fields: Partial<Record<CanonicalField, string>> = {};
        for (const [col, canonical] of Object.entries(resolvedMapping)) {
          fields[canonical] = col;
        }
        await getBankMappingRepository().save({
          bankName,
          fields,
          active: true,
          updatedBy: session!.user?.email ?? 'system',
        });
      } catch {
        // Non-fatal
      }
    }

    return ok({
      totalRows: allRows.length,
      accepted: toSave.length,
      rejected: rejected.length,
      savedCount,
      failedCount,
      areaResearched,
      rejectedDetails: rejected.slice(0, 50),
      saveErrors: saveErrors.slice(0, 10),
    });
  } catch (e) {
    console.error('[POST /api/import/confirm]', e);
    return err('SERVER_ERROR', 'Gagal menyimpan asset', 500);
  }
}
