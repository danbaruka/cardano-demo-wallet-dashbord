import { fetchAddressUtxos, fetchDatumInfo, type KoiosUtxo } from './koios';
import { claimableLovelace } from './vestingMath';
import {
  getVestingScriptAddress,
  normalizeVkh,
  parseVestingDatumInline,
  resolvePaymentKeyHashFromAddress,
} from './vesting';
import type { VestingBalances, VestingUtxo } from '../types/vesting';

function datumSourceFromUtxo(u: KoiosUtxo): unknown {
  if (u.inline_datum) {
    const inline = u.inline_datum as { value?: unknown };
    return inline.value ?? u.inline_datum;
  }
  return null;
}

async function resolveDatumForUtxos(utxos: KoiosUtxo[]): Promise<Map<string, unknown>> {
  const byHash = new Map<string, unknown>();

  for (const u of utxos) {
    const source = datumSourceFromUtxo(u);
    if (source && u.datum_hash) {
      byHash.set(u.datum_hash, source);
    }
  }

  const missingHashes = utxos
    .filter((u) => u.datum_hash && !byHash.has(u.datum_hash))
    .map((u) => u.datum_hash as string);

  if (missingHashes.length > 0) {
    const datumRows = await fetchDatumInfo(missingHashes);
    for (const row of datumRows) {
      if (row.datum_hash && row.value) {
        byHash.set(row.datum_hash, row.value);
      }
    }
  }

  return byHash;
}

async function mapKoiosUtxo(
  u: KoiosUtxo,
  datumByHash: Map<string, unknown>,
): Promise<VestingUtxo | null> {
  const lovelace = parseInt(u.value || '0', 10);
  const inlineSource = datumSourceFromUtxo(u);
  const hashSource = u.datum_hash ? datumByHash.get(u.datum_hash) : null;
  const parsed = parseVestingDatumInline(inlineSource ?? hashSource);
  if (!parsed) return null;

  return {
    ...parsed,
    tx_hash: u.tx_hash,
    tx_index: u.tx_index,
    lovelace: Number.isFinite(lovelace) ? lovelace : 0,
  };
}

export async function fetchAllVestingUtxos(): Promise<VestingUtxo[]> {
  const scriptAddress = getVestingScriptAddress();
  const scriptUtxos = await fetchAddressUtxos(scriptAddress, { extended: true });
  const datumByHash = await resolveDatumForUtxos(scriptUtxos);

  const mapped = await Promise.all(scriptUtxos.map((u) => mapKoiosUtxo(u, datumByHash)));
  return mapped.filter((u): u is VestingUtxo => u !== null);
}

export function walletVkhSet(walletAddresses: string[]): Set<string> {
  return new Set(walletAddresses.map((addr) => normalizeVkh(resolvePaymentKeyHashFromAddress(addr))));
}

export async function fetchWalletAddresses(wallet: {
  getUsedAddresses: () => Promise<string[]>;
  getChangeAddress: () => Promise<string>;
}): Promise<string[]> {
  const used = await wallet.getUsedAddresses();
  const change = await wallet.getChangeAddress();
  return [...new Set([...used, change].filter(Boolean))];
}

export async function fetchIssuerVestingUtxos(walletAddresses: string[]): Promise<VestingUtxo[]> {
  const issuerVkhs = walletVkhSet(walletAddresses);
  const all = await fetchAllVestingUtxos();
  return all.filter((u) => issuerVkhs.has(normalizeVkh(u.issuerVkh)));
}

export async function fetchBeneficiaryVestingUtxos(walletAddresses: string[]): Promise<VestingUtxo[]> {
  const beneficiaryVkhs = walletVkhSet(walletAddresses);
  const all = await fetchAllVestingUtxos();
  return all.filter((u) => beneficiaryVkhs.has(normalizeVkh(u.beneficiaryVkh)));
}

export async function fetchVestingUtxoByRef(
  txHash: string,
  txIndex: number,
): Promise<VestingUtxo | null> {
  const all = await fetchAllVestingUtxos();
  return all.find((u) => u.tx_hash === txHash && u.tx_index === txIndex) ?? null;
}

export function computeVestingBalances(utxo: VestingUtxo | null, nowMs: number = Date.now()): VestingBalances {
  if (!utxo) {
    return {
      total: 0,
      claimed: 0,
      claimableNow: 0,
      remaining: 0,
      lockedInUtxo: 0,
      status: 'cancelled',
    };
  }

  const claimable = claimableLovelace(utxo, nowMs);
  const remaining = Math.max(0, utxo.totalAmount - utxo.claimedAmount);
  const status = utxo.claimedAmount >= utxo.totalAmount ? 'completed' : 'active';

  return {
    total: utxo.totalAmount,
    claimed: utxo.claimedAmount,
    claimableNow: claimable,
    remaining,
    lockedInUtxo: utxo.lovelace,
    status,
    nextUnlockAt:
      claimable > 0
        ? nowMs
        : utxo.startTime +
          Math.ceil(Math.max(0, nowMs - utxo.startTime) / utxo.releaseIntervalMs + 1) *
            utxo.releaseIntervalMs,
  };
}

export function isWalletIssuer(utxo: VestingUtxo, walletAddresses: string[]): boolean {
  const issuerVkhs = walletVkhSet(walletAddresses);
  return issuerVkhs.has(normalizeVkh(utxo.issuerVkh));
}

export function isWalletBeneficiary(utxo: VestingUtxo, walletAddresses: string[]): boolean {
  const beneficiaryVkhs = walletVkhSet(walletAddresses);
  return beneficiaryVkhs.has(normalizeVkh(utxo.beneficiaryVkh));
}
