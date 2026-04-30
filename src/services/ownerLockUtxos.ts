import { resolveDataHash, resolvePaymentKeyHash } from '@meshsdk/core';

import { fetchAddressUtxos, type KoiosUtxo } from './koios';
import { buildOwnerLockDatum, getOwnerLockScriptAddress } from './ownerLock';

export type OwnerLockedUtxo = KoiosUtxo & {
  lovelace: number;
  ownerVkh?: string;
};

function extractOwnerVkhFromInlineDatum(inlineDatum: unknown): string | undefined {
  if (!inlineDatum || typeof inlineDatum !== 'object') return undefined;

  const anyDatum = inlineDatum as any;
  const fields = anyDatum.fields;
  if (!Array.isArray(fields) || fields.length === 0) return undefined;

  const ownerField = fields[0];
  if (typeof ownerField === 'string') return ownerField;
  if (ownerField && typeof ownerField === 'object') {
    if (typeof (ownerField as any).bytes === 'string') return (ownerField as any).bytes;
    if (typeof (ownerField as any).hex === 'string') return (ownerField as any).hex;
    if (typeof (ownerField as any).value === 'string') return (ownerField as any).value;
  }

  return undefined;
}

export async function fetchMyOwnerLockedUtxos(walletAddress: string): Promise<OwnerLockedUtxo[]> {
  const ownerVkh = resolvePaymentKeyHash(walletAddress);
  const ownerDatumHash = resolveDataHash(buildOwnerLockDatum(walletAddress));
  const scriptAddress = getOwnerLockScriptAddress();

  const scriptUtxos = await fetchAddressUtxos(scriptAddress);

  return scriptUtxos
    .map((u) => {
      const lovelace = parseInt(u.value || '0', 10);
      return {
        ...u,
        lovelace: Number.isFinite(lovelace) ? lovelace : 0,
        ownerVkh: extractOwnerVkhFromInlineDatum(u.inline_datum),
      };
    })
    // Koios often returns only datum_hash (inline_datum may be null). Prefer datum_hash match.
    .filter((u) => (u.datum_hash ? u.datum_hash === ownerDatumHash : u.ownerVkh === ownerVkh));
}

export async function fetchMyOwnerLockedTotalLovelace(walletAddress: string): Promise<number> {
  const utxos = await fetchMyOwnerLockedUtxos(walletAddress);
  return utxos.reduce((sum, u) => sum + u.lovelace, 0);
}

