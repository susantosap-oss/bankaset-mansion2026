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
import { diffAssets } from '@/lib/assetFingerprint';

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
      /** Jika true: bandingkan dengan data lama → update/disable/tambah. */
      syncMode?: boolean;
      /**
       * Khusus CASSIE: jika baki debet (principalOutstanding) tidak ada di file,
       * hitung otomatis = outstanding × (cassieDiscPct / 100).
       * Contoh: cassieDiscPct=50 → principalOutstanding = outstanding × 50%.
       */
      cassieDiscPct?: number;
    };

    const { bankName, allRows, mapping, saveMappingForBank, labelAsset, syncMode, cassieDiscPct } = body;

    if (!bankName || !Array.isArray(allRows) || !mapping) {
      return err('VALIDATION_ERROR', 'bankName, allRows, dan mapping wajib diisi');
    }
    if (labelAsset !== 'CASSIE' && labelAsset !== 'LELANG' && labelAsset !== 'AYDA') {
      return err('VALIDATION_ERROR', 'Label Asset wajib dipilih (Cassie/Lelang/AYDA)');
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

    const toProcess: CreateAssetInput[] = [];
    const rejected: Array<{ row: number; city: string; assetType: string; reason: string }> = [];

    for (let i = 0; i < allRows.length; i++) {
      const rawRow = allRows[i];
      if (Object.values(rawRow).every((v) => !String(v).trim())) continue;

      const { asset } = normService.normalizeRow(rawRow, resolvedMapping);

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
      // Cassie → Harga Outstanding; Lelang/AYDA → Harga Limit dari kolom termapping
      const limitPrice = labelAsset === 'CASSIE'
        ? (asset.outstanding ?? 0)
        : (asset.limitPrice ?? 0);

      // ── Cassie Disc: hitung principalOutstanding jika tidak ada di file ──
      let principalOutstanding = asset.principalOutstanding;
      let liquidationRatio = asset.liquidationRatio;

      if (
        labelAsset === 'CASSIE' &&
        cassieDiscPct != null &&
        cassieDiscPct > 0 &&
        cassieDiscPct <= 100 &&
        (!principalOutstanding || principalOutstanding === 0)
      ) {
        const outstanding = asset.outstanding ?? 0;
        principalOutstanding = outstanding * (cassieDiscPct / 100);
        if (!liquidationRatio && outstanding > 0) {
          liquidationRatio = cassieDiscPct; // ratio = principalOutstanding/outstanding × 100
        }
      }

      toProcess.push({
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
        principalOutstanding,
        liquidationRatio,
        liquidationValue: asset.liquidationValue,
        limitPrice,
        labelAsset,
      });
    }

    // ── Sync Mode: bandingkan dengan data lama ────────────────────────
    if (syncMode) {
      const existing = await assetRepo.findActiveByBank(bankName);
      const diff = diffAssets(existing, toProcess);

      // 1. Disable aset yang tidak ada di file baru (dianggap SOLD)
      const disabledCount = await assetRepo.bulkDisable(diff.toDisable.map((a) => a.assetId));

      // 2. Update aset yang ada tapi berubah
      const updateInputs = diff.changed.map(({ existing: ex, incoming: inc }) => ({
        assetId: ex.assetId,
        partial: {
          assetType: inc.assetType,
          city: inc.city,
          district: inc.district,
          area: inc.area,
          address: inc.address,
          marketValue: inc.marketValue,
          outstanding: inc.outstanding,
          landArea: inc.landArea,
          buildingArea: inc.buildingArea,
          debtorName: inc.debtorName,
          principalOutstanding: inc.principalOutstanding,
          liquidationRatio: inc.liquidationRatio,
          liquidationValue: inc.liquidationValue,
          limitPrice: inc.limitPrice,
          rawRowRef: inc.rawRowRef,
        } satisfies Partial<CreateAssetInput>,
      }));
      const updatedCount = await assetRepo.bulkUpdateFields(updateInputs);

      // 3. Tambah aset baru
      let savedCount = 0;
      let failedCount = 0;
      let saveErrors: Array<{ row: number; reason: string }> = [];
      if (diff.toAdd.length > 0) {
        const result = await assetRepo.bulkSave(diff.toAdd);
        savedCount = result.saved;
        failedCount = result.failed;
        saveErrors = result.errors;
      }

      const areaResearched = await autoResearchNewAreas(diff.toAdd).catch(() => 0);

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
        } catch { /* Non-fatal */ }
      }

      return ok({
        mode: 'sync',
        totalRows: allRows.length,
        accepted: toProcess.length,
        rejected: rejected.length,
        sync: {
          unchanged: diff.unchanged.length,
          updated: updatedCount,
          disabled: disabledCount,
          added: savedCount,
          addFailed: failedCount,
        },
        areaResearched,
        rejectedDetails: rejected.slice(0, 50),
        saveErrors: saveErrors.slice(0, 10),
      });
    }

    // ── Normal Mode (append saja, tidak ada diff) ─────────────────────
    let savedCount = 0;
    let failedCount = 0;
    let saveErrors: Array<{ row: number; reason: string }> = [];

    if (toProcess.length > 0) {
      const result = await assetRepo.bulkSave(toProcess);
      savedCount = result.saved;
      failedCount = result.failed;
      saveErrors = result.errors;
    }

    const areaResearched = await autoResearchNewAreas(toProcess).catch(() => 0);

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
      } catch { /* Non-fatal */ }
    }

    return ok({
      mode: 'append',
      totalRows: allRows.length,
      accepted: toProcess.length,
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
