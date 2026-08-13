import { Asset, CreateAssetInput } from '@/domain/entities/Asset';

function norm(s: string | undefined | null): string {
  return (s ?? '').toLowerCase().trim().replace(/\s+/g, ' ');
}

/** Deterministic key untuk mencocokkan aset lama vs baru dari bank yang sama. */
export function fingerprint(debtorName: string | undefined, address: string): string {
  const d = norm(debtorName);
  const a = norm(address);
  return d ? `${d}|${a.slice(0, 80)}` : a.slice(0, 120);
}

const NUM_TOLERANCE = 0.01; // 1% toleransi untuk angka floating point

function numChanged(a: number | undefined, b: number | undefined): boolean {
  if (a == null && b == null) return false;
  if (a == null || b == null) return (a ?? 0) !== (b ?? 0);
  if (a === 0 && b === 0) return false;
  const ref = Math.max(Math.abs(a), Math.abs(b));
  return ref > 0 && Math.abs(a - b) / ref > NUM_TOLERANCE;
}

export interface AssetDiff {
  unchanged: Asset[];
  changed: Array<{ existing: Asset; incoming: CreateAssetInput }>;
  toDisable: Asset[];
  toAdd: CreateAssetInput[];
}

/**
 * Bandingkan data incoming (dari file baru) dengan data existing (dari sheet).
 * Matching key: fingerprint(debtorName, address).
 */
export function diffAssets(existingAssets: Asset[], incoming: CreateAssetInput[]): AssetDiff {
  const existingMap = new Map<string, Asset>();
  for (const a of existingAssets) {
    const fp = fingerprint(a.debtorName, a.address);
    if (!existingMap.has(fp)) existingMap.set(fp, a);
  }

  const matchedIds = new Set<string>();
  const unchanged: Asset[] = [];
  const changed: Array<{ existing: Asset; incoming: CreateAssetInput }> = [];
  const toAdd: CreateAssetInput[] = [];

  for (const inc of incoming) {
    const fp = fingerprint(inc.debtorName, inc.address);
    const existing = existingMap.get(fp);

    if (!existing) {
      toAdd.push(inc);
      continue;
    }

    matchedIds.add(existing.assetId);

    const hasChange =
      numChanged(existing.marketValue, inc.marketValue) ||
      numChanged(existing.outstanding, inc.outstanding) ||
      numChanged(existing.limitPrice, inc.limitPrice) ||
      numChanged(existing.principalOutstanding, inc.principalOutstanding) ||
      numChanged(existing.liquidationRatio, inc.liquidationRatio) ||
      numChanged(existing.liquidationValue, inc.liquidationValue) ||
      numChanged(existing.landArea, inc.landArea) ||
      numChanged(existing.buildingArea, inc.buildingArea) ||
      norm(existing.address) !== norm(inc.address) ||
      norm(existing.city) !== norm(inc.city) ||
      existing.assetType !== inc.assetType;

    if (hasChange) {
      changed.push({ existing, incoming: inc });
    } else {
      unchanged.push(existing);
    }
  }

  const toDisable = existingAssets.filter((a) => !matchedIds.has(a.assetId));
  return { unchanged, changed, toDisable, toAdd };
}
