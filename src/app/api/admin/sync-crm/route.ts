import { NextRequest } from 'next/server';
import { ok, err, requirePrivileged } from '@/lib/api';
import { getGoogleSheetClient } from '@/infrastructure/gsheet/GoogleSheetClient';
import { getAssetRepository } from '@/lib/container';
import { Asset } from '@/domain/entities/Asset';
import { v4 as uuidv4 } from 'uuid';

export const maxDuration = 60;

const CRM_SHEET_NAME = 'Assets';
const COL_SOURCE_ID  = 29; // Source_Row_ID di CRM

// ── Helpers ────────────────────────────────────────────────────────────────

const LABEL_SHORT: Record<string, string> = { CASSIE: 'CS', LELANG: 'LE', AYDA: 'AY' };
const TYPE_SHORT:  Record<string, string> = {
  RUMAH: 'RMH', APARTEMEN: 'APT', RUKO: 'RKO', GUDANG: 'GDG',
  PABRIK: 'PBK', LAHAN: 'TNH', KANTOR: 'KTR', HOTEL: 'HTL', OTHER: 'LNY',
};
const TYPE_ICON: Record<string, string> = {
  RUMAH: '🏡', APARTEMEN: '🏢', RUKO: '🏪', GUDANG: '🏭',
  PABRIK: '🏭', LAHAN: '🌿', KANTOR: '🏢', HOTEL: '🏨', OTHER: '🏠',
};
const TYPE_HASHTAG: Record<string, string> = {
  RUMAH: '#lelangrumah #propertirumah',
  APARTEMEN: '#lelangapartemen #propertiapartemen',
  RUKO: '#lelangruko #propertiruko',
  GUDANG: '#lelanggudang #propertikomersiil',
  PABRIK: '#lelangpabrik #propertikomersiil',
  LAHAN: '#lelangtanah #propertitanah',
  KANTOR: '#lelangkantor #propertikomersiil',
  HOTEL: '#lelanghotel #propertikomersiil',
  OTHER: '',
};

function formatRupiah(val: number | undefined): string {
  if (!val || val === 0) return '';
  if (val >= 1_000_000_000) return `Rp ${(val / 1_000_000_000).toFixed(1).replace('.', ',')} M`;
  if (val >= 1_000_000)     return `Rp ${Math.round(val / 1_000_000)} Jt`;
  return `Rp ${val.toLocaleString('id-ID')}`;
}

function toExcelDate(date: Date): number {
  return Math.floor(date.getTime() / 86400000) + 25569;
}

function buildKodeAsset(
  label: string,
  type: string,
  year: number,
  seq: number,
): string {
  const l = LABEL_SHORT[label] ?? 'XX';
  const t = TYPE_SHORT[type]  ?? 'LNY';
  return `AST-${l}-${t}-${year}-${String(seq).padStart(3, '0')}`;
}

function getNextSeq(existingCodes: string[]): number {
  let max = 0;
  for (const code of existingCodes) {
    const m = code.match(/(\d+)$/);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return max + 1;
}

function buildCaption(asset: Asset, label: string): string {
  const icon   = TYPE_ICON[asset.assetType]    ?? '🏠';
  const typeLabel = asset.assetType === 'LAHAN' ? 'Lahan / Tanah' : (asset.assetType.charAt(0) + asset.assetType.slice(1).toLowerCase());
  const labelLabel = label === 'CASSIE' ? 'Cessie' : label === 'LELANG' ? 'Lelang' : 'AYDA';
  const harga  = formatRupiah(asset.limitPrice || asset.outstanding) || '-';
  const city   = asset.city?.toLowerCase().replace(/^kota\s+/, '').replace(/^kabupaten\s+/, '');
  const cityTag = city ? `#properti${city.replace(/\s+/g, '')} #${city.replace(/\s+/g, '')}` : '';
  const bankTag = `#${asset.bankName.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
  const typeTag = TYPE_HASHTAG[asset.assetType] ?? '';

  const specs = [
    asset.landArea     > 0 ? `LT : ${asset.landArea} m²`     : '',
    asset.buildingArea > 0 ? `LB : ${asset.buildingArea} m²` : '',
  ].filter(Boolean).join('\n');

  return [
    `${icon} HOT ITEM ${icon}`,
    labelLabel,
    typeLabel,
    `📍 ${asset.address}`,
    '',
    specs ? `📐 Spesifikasi :\n${specs}` : '',
    '',
    `💰 Best Price : ${harga}`,
    `⚖️ Cash Only | No Viewing | Asset Bank`,
    '',
    `📲 DM atau hubungi kami untuk info lengkap!`,
    '',
    `#lelangproperti #propertilelang #eksekusijaminan ${typeTag} ${cityTag} ${bankTag} #investasiproperti #jualproperti #propertimurah #bawahahargapasar`,
  ].filter((l) => l !== undefined).join('\n');
}

function buildCRMRow(asset: Asset, kodeAsset: string, now: string): string[] {
  const label = asset.labelAsset ?? 'LELANG';
  const hargaLimit   = asset.limitPrice || asset.outstanding || 0;
  const hargaPasar   = asset.marketValue || 0;
  const hargaEks     = asset.liquidationValue || 0;
  const sourceData   = JSON.stringify({
    assetId:          asset.assetId,
    bankName:         asset.bankName,
    assetType:        asset.assetType,
    area:             asset.area,
    status:           asset.status,
    outstanding:      asset.outstanding,
    principalOuts:    asset.principalOutstanding,
    liquidRatio:      asset.liquidationRatio,
    liquidValue:      asset.liquidationValue,
    hargaLimit,
    hargaPasarEst:    hargaPasar,
    demandScore:      '',
    sellable:         'Ya',
    labelAsset:       label,
    createdAtSrc:     asset.createdAt,
    updatedAtSrc:     asset.updatedAt,
  });

  const row: string[] = new Array(38).fill('');
  row[0]  = uuidv4();                                    // ID
  row[1]  = kodeAsset;                                   // Kode_Asset
  row[2]  = String(toExcelDate(new Date()));             // Tanggal_Input
  row[3]  = asset.assetType === 'LAHAN' ? 'Tanah' : (asset.assetType.charAt(0) + asset.assetType.slice(1).toLowerCase()); // Tipe_Properti
  row[4]  = asset.debtorName ?? asset.address.slice(0, 60); // Nama_Asset
  row[5]  = asset.debtorName ?? '';                     // Nama_Debitur
  row[6]  = '';                                          // No_Perkara
  row[7]  = asset.bankName;                             // Bank_Kreditur
  row[8]  = asset.address;                              // Alamat
  row[9]  = asset.district ?? '';                       // Kecamatan
  row[10] = asset.city ?? '';                           // Kota
  row[11] = 'Jawa Timur';                               // Provinsi
  row[12] = asset.landArea     > 0 ? String(asset.landArea)     : ''; // Luas_Tanah
  row[13] = asset.buildingArea > 0 ? String(asset.buildingArea) : ''; // Luas_Bangunan
  row[14] = asset.certificateType ?? '';                // Sertifikat
  row[15] = hargaLimit  > 0 ? String(hargaLimit)  : ''; // Harga_Limit_Lelang
  row[16] = formatRupiah(hargaLimit);                   // Harga_Limit_Format
  row[17] = hargaPasar  > 0 ? String(hargaPasar)  : ''; // Est_Harga_Pasar
  row[18] = formatRupiah(hargaPasar);                   // Est_Harga_Pasar_Format
  row[19] = hargaEks    > 0 ? String(hargaEks)    : ''; // Est_Harga_Eksekusi
  row[20] = formatRupiah(hargaEks);                     // Est_Harga_Eksekusi_Format
  row[21] = '';                                          // Keterangan_Debitur
  row[22] = '';                                          // Foto_1_URL
  row[23] = '';                                          // Foto_2_URL
  row[24] = '';                                          // Foto_3_URL
  row[25] = '[]';                                        // Cloudinary_IDs
  row[26] = buildCaption(asset, label);                 // Caption_Sosmed
  row[27] = 'Publish';                                  // Status
  row[28] = 'TRUE';                                     // Tampilkan_di_Web
  row[29] = asset.assetId;                              // Source_Row_ID
  row[30] = sourceData;                                 // Source_Data
  row[31] = '';                                          // Created_By_ID
  row[32] = 'System Sync';                              // Created_By_Nama
  row[33] = now;                                         // Created_At
  row[34] = now;                                         // Updated_At
  row[35] = '';                                          // Notes
  row[36] = '';                                          // (empty)
  row[37] = '';                                          // Gmaps_link
  return row;
}

// ── API ────────────────────────────────────────────────────────────────────

async function findNewAssets() {
  const sheetId = process.env.CRM_SHEET_ID;
  if (!sheetId) throw new Error('CRM_SHEET_ID tidak dikonfigurasi');

  const client = getGoogleSheetClient();
  const [crmRows, assetResult] = await Promise.all([
    client.readSheet(sheetId, CRM_SHEET_NAME),
    getAssetRepository().findAll({ status: 'ACTIVE' }, { page: 1, limit: 9999 }),
  ]);

  // Kumpulkan Source_Row_IDs yang sudah ada di CRM
  const existingIds = new Set(
    crmRows.slice(1).map((r) => (r[COL_SOURCE_ID] ?? '').trim()).filter(Boolean)
  );

  // Kumpulkan Kode_Asset yang sudah ada (untuk sequence)
  const existingCodes = crmRows.slice(1).map((r) => r[1] ?? '').filter(Boolean);

  // Aset baru = ada di Asset Bank, belum ada di CRM
  const newAssets = assetResult.data.filter((a) => !existingIds.has(a.assetId));

  return { newAssets, existingCodes, sheetId, client };
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const isCLI = !!process.env.AUTH_SECRET && authHeader === `Bearer ${process.env.AUTH_SECRET}`;
  if (!isCLI) {
    const { error } = await requirePrivileged();
    if (error) return error;
  }

  try {
    const { newAssets } = await findNewAssets();
    return ok({
      newAssets: newAssets.length,
      preview: newAssets.slice(0, 5).map((a) => ({
        assetId: a.assetId,
        bank: a.bankName,
        address: a.address.slice(0, 60),
        createdAt: a.createdAt,
      })),
    });
  } catch (e) {
    console.error('[GET /api/admin/sync-crm]', e);
    return err('SERVER_ERROR', e instanceof Error ? e.message : 'Gagal cek aset baru', 500);
  }
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const isCLI = !!process.env.AUTH_SECRET && authHeader === `Bearer ${process.env.AUTH_SECRET}`;
  if (!isCLI) {
    const { error } = await requirePrivileged();
    if (error) return error;
  }

  try {
    const { newAssets, existingCodes, sheetId, client } = await findNewAssets();
    if (newAssets.length === 0) return ok({ added: 0, message: 'Semua aset sudah tersinkron.' });

    const now  = new Date().toISOString();
    const year = new Date().getFullYear();
    let seq    = getNextSeq(existingCodes);

    const rows = newAssets.map((asset) => {
      const kode = buildKodeAsset(asset.labelAsset ?? 'LELANG', asset.assetType, year, seq++);
      return buildCRMRow(asset, kode, now);
    });

    await client.appendRows(sheetId, CRM_SHEET_NAME, rows);

    return ok({
      added: rows.length,
      message: `${rows.length} aset baru berhasil ditambahkan ke CRM.`,
    });
  } catch (e) {
    console.error('[POST /api/admin/sync-crm]', e);
    return err('SERVER_ERROR', e instanceof Error ? e.message : 'Gagal sync ke CRM', 500);
  }
}
