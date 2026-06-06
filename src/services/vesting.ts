import {
  applyParamsToScript,
  resolvePaymentKeyHash,
  resolvePlutusScriptAddress,
  resolveDataHash,
} from '@meshsdk/core';
import type { Data, PlutusScript } from '@meshsdk/core';

import { CARDANO_NETWORK, KOIOS_API_BASE } from '../config';
import type { VestingDatumFields } from '../types/vesting';
import vestingBlueprint from '../contracts/vesting/plutus.json';

type AikenBlueprint = {
  preamble?: { plutusVersion?: string };
  validators: Array<{
    title: string;
    compiledCode: string;
    hash: string;
  }>;
};

const blueprint = vestingBlueprint as unknown as AikenBlueprint;

export const VESTING_CLAIM_ACTION = 0;
export const VESTING_CANCEL_ACTION = 1;

export function getVestingCompiledCode(): string {
  const v = blueprint.validators.find((x) => x.title.endsWith('.spend')) ?? blueprint.validators[0];
  if (!v?.compiledCode) throw new Error('Vesting blueprint missing compiledCode');
  return v.compiledCode;
}

export function getVestingScriptHash(): string {
  const v = blueprint.validators.find((x) => x.title.endsWith('.spend')) ?? blueprint.validators[0];
  if (!v?.hash) throw new Error('Vesting blueprint missing hash');
  return v.hash;
}

export function getVestingScriptCbor(): string {
  return applyParamsToScript(getVestingCompiledCode(), []);
}

export function getVestingScript(): PlutusScript {
  return { code: getVestingScriptCbor(), version: 'V3' };
}

export function getVestingScriptAddress(): string {
  const networkId = CARDANO_NETWORK === 'mainnet' ? 1 : 0;
  return resolvePlutusScriptAddress(getVestingScript(), networkId);
}

function fieldBytes(value: string): string {
  return value.startsWith('0x') ? value.slice(2) : value;
}

export function buildVestingId(params: {
  issuerVkh: string;
  beneficiaryVkh: string;
  startTime: number;
  totalAmount: number;
  vestingPeriodMs: number;
  releaseIntervalMs: number;
}): string {
  const payload: Data = {
    alternative: 0,
    fields: [
      params.issuerVkh,
      params.beneficiaryVkh,
      params.startTime,
      params.totalAmount,
      params.vestingPeriodMs,
      params.releaseIntervalMs,
    ],
  };
  return resolveDataHash(payload);
}

export function buildVestingDatum(fields: VestingDatumFields): Data {
  return {
    alternative: 0,
    fields: [
      fieldBytes(fields.vestingId),
      fields.issuerVkh,
      fields.beneficiaryVkh,
      fields.totalAmount,
      fields.startTime,
      fields.vestingPeriodMs,
      fields.releaseIntervalMs,
      fields.claimedAmount,
    ],
  };
}

export function buildClaimRedeemer(amountLovelace: number): Data {
  return {
    alternative: 0,
    fields: [VESTING_CLAIM_ACTION, amountLovelace],
  };
}

export function buildCancelRedeemer(): Data {
  return {
    alternative: 0,
    fields: [VESTING_CANCEL_ACTION, 0],
  };
}

export function normalizeVkh(vkh: string): string {
  return vkh.replace(/^0x/i, '').toLowerCase();
}

function readIntField(field: unknown): number | undefined {
  if (typeof field === 'number') return field;
  if (typeof field === 'bigint') return Number(field);
  if (typeof field === 'string' && field !== '' && !Number.isNaN(Number(field))) return Number(field);
  if (field && typeof field === 'object') {
    const anyField = field as { int?: number | string; fields?: unknown[] };
    if (anyField.int !== undefined) return Number(anyField.int);
  }
  return undefined;
}

function readBytesField(field: unknown): string | undefined {
  if (typeof field === 'string') return normalizeVkh(field);
  if (field && typeof field === 'object') {
    const anyField = field as { bytes?: string; hex?: string; value?: string };
    const raw = anyField.bytes ?? anyField.hex ?? anyField.value;
    return raw ? normalizeVkh(raw) : undefined;
  }
  return undefined;
}

function unwrapDatumPayload(datum: unknown): { fields?: unknown[] } | null {
  if (!datum || typeof datum !== 'object') return null;

  const root = datum as {
    alternative?: number;
    constructor?: number;
    fields?: unknown[];
    value?: { alternative?: number; constructor?: number; fields?: unknown[] };
  };

  if (Array.isArray(root.fields)) return root;
  if (root.value && Array.isArray(root.value.fields)) return root.value;
  return null;
}

export function parseVestingDatumInline(inlineDatum: unknown): VestingDatumFields | null {
  const payload = unwrapDatumPayload(inlineDatum);
  if (!payload) return null;

  const fields = payload.fields;
  if (!Array.isArray(fields) || fields.length < 8) return null;

  const vestingId = readBytesField(fields[0]);
  const issuerVkh = readBytesField(fields[1]);
  const beneficiaryVkh = readBytesField(fields[2]);
  const totalAmount = readIntField(fields[3]);
  const startTime = readIntField(fields[4]);
  const vestingPeriodMs = readIntField(fields[5]);
  const releaseIntervalMs = readIntField(fields[6]);
  const claimedAmount = readIntField(fields[7]);

  if (
    !vestingId ||
    !issuerVkh ||
    !beneficiaryVkh ||
    totalAmount === undefined ||
    startTime === undefined ||
    vestingPeriodMs === undefined ||
    releaseIntervalMs === undefined ||
    claimedAmount === undefined
  ) {
    return null;
  }

  return {
    vestingId: normalizeVkh(vestingId),
    issuerVkh: normalizeVkh(issuerVkh),
    beneficiaryVkh: normalizeVkh(beneficiaryVkh),
    totalAmount,
    startTime,
    vestingPeriodMs,
    releaseIntervalMs,
    claimedAmount,
  };
}

export async function unixMsToAbsoluteSlot(unixMs: number): Promise<number> {
  const base = KOIOS_API_BASE.startsWith('http')
    ? KOIOS_API_BASE
    : `${window.location.origin}${KOIOS_API_BASE}`;

  const res = await fetch(`${base}/tip`, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error('Failed to fetch chain tip for slot conversion');
  const tip = (await res.json()) as Array<{ abs_slot?: number; block_time?: number }>;
  const row = tip[0];
  if (!row?.abs_slot || !row.block_time) throw new Error('Invalid tip response from Koios');

  const deltaMs = unixMs - row.block_time * 1000;
  return Math.max(1, row.abs_slot + Math.floor(deltaMs / 1000));
}

export function resolvePaymentKeyHashFromAddress(address: string): string {
  return resolvePaymentKeyHash(address);
}
