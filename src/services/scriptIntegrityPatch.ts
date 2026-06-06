import { Serialization } from '@cardano-sdk/core';
import * as Crypto from '@cardano-sdk/crypto';
import { HexBlob } from '@cardano-sdk/util';

import { KOIOS_API_BASE } from '../config';

type KoiosCostModels = {
  PlutusV1?: number[];
  PlutusV2?: number[];
  PlutusV3?: number[];
};

type KoiosEpochParams = Array<{
  epoch_no: number;
  cost_models?: KoiosCostModels | null;
}>;

type KoiosTip = Array<{ epoch_no: number }>;

const CBOR_EMPTY_MAP = new Uint8Array([160]);

function absoluteBaseUrl(): string {
  if (KOIOS_API_BASE.startsWith('http')) return KOIOS_API_BASE;
  return `${window.location.origin}${KOIOS_API_BASE}`;
}

async function koiosPost<T>(path: string, body: unknown): Promise<T> {
  const url = `${absoluteBaseUrl()}${path.startsWith('/') ? path : `/${path}`}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(text || `Koios error (${res.status})`);
  return JSON.parse(text) as T;
}

async function koiosGet<T>(path: string): Promise<T> {
  const url = `${absoluteBaseUrl()}${path.startsWith('/') ? path : `/${path}`}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  const text = await res.text();
  if (!res.ok) throw new Error(text || `Koios error (${res.status})`);
  return JSON.parse(text) as T;
}

let cachedCostModels: KoiosCostModels | null = null;
let cachedCostModelsEpoch = -1;

export async function fetchKoiosCostModels(): Promise<KoiosCostModels> {
  const tip = await koiosGet<KoiosTip>('/tip');
  const epoch = tip[0]?.epoch_no;
  if (!epoch) throw new Error('Koios tip missing epoch_no');

  if (cachedCostModels && cachedCostModelsEpoch === epoch) {
    return cachedCostModels;
  }

  const params = await koiosPost<KoiosEpochParams>('/epoch_params', { _epoch_no: epoch });
  let costModels = params[0]?.cost_models ?? null;

  if (!costModels?.PlutusV3) {
    const recent = await koiosGet<KoiosEpochParams>(`/epoch_params?limit=5`);
    costModels =
      [...recent].reverse().find((row) => row.cost_models?.PlutusV3)?.cost_models ?? costModels;
  }

  if (!costModels?.PlutusV3) {
    throw new Error('Koios epoch_params did not return PlutusV3 cost models.');
  }

  cachedCostModels = costModels;
  cachedCostModelsEpoch = epoch;
  return costModels;
}

function hashScriptData(
  costModels: Serialization.Costmdls,
  redeemers: Serialization.Redeemers,
  datums?: { size(): number; toCbor(): string },
): Crypto.Hash32ByteBase16 | undefined {
  const writer = new Serialization.CborWriter();

  if (datums && datums.size() > 0 && (!redeemers || redeemers.size() === 0)) {
    writer.writeEncodedValue(CBOR_EMPTY_MAP);
    writer.writeEncodedValue(Buffer.from(datums.toCbor(), 'hex'));
    writer.writeEncodedValue(CBOR_EMPTY_MAP);
  } else {
    if (!redeemers || redeemers.size() === 0) return undefined;
    writer.writeEncodedValue(Buffer.from(redeemers.toCbor(), 'hex'));
    if (datums && datums.size() > 0) {
      writer.writeEncodedValue(Buffer.from(datums.toCbor(), 'hex'));
    }
    writer.writeEncodedValue(Buffer.from(costModels.languageViewsEncoding(), 'hex'));
  }

  return Crypto.Hash32ByteBase16.fromHexBlob(
    HexBlob.fromBytes(
      Crypto.blake2b(Crypto.blake2b.BYTES).update(writer.encode()).digest(),
    ),
  );
}

function buildCostmdls(
  witness: Serialization.TransactionWitnessSet,
  costModels: KoiosCostModels,
): Serialization.Costmdls {
  const result = new Serialization.Costmdls();

  const v1 = witness.plutusV1Scripts();
  const v2 = witness.plutusV2Scripts();
  const v3 = witness.plutusV3Scripts();

  if (v1 && v1.size() > 0 && costModels.PlutusV1) {
    result.insert(Serialization.CostModel.newPlutusV1(costModels.PlutusV1));
  }
  if (v2 && v2.size() > 0 && costModels.PlutusV2) {
    result.insert(Serialization.CostModel.newPlutusV2(costModels.PlutusV2));
  }
  if (v3 && v3.size() > 0 && costModels.PlutusV3) {
    result.insert(Serialization.CostModel.newPlutusV3(costModels.PlutusV3));
  }

  return result;
}

/**
 * Mesh hardcodes legacy Plutus cost models when computing script_data_hash.
 * On Conway preprod the live epoch params differ (350 vs 297 PlutusV3 costs),
 * which triggers PPViewHashesDontMatch at submission time.
 */
export async function patchScriptIntegrityHash(unsignedTxHex: string): Promise<string> {
  const tx = Serialization.Transaction.fromCbor(unsignedTxHex as unknown as Serialization.TxCBOR);
  const witness = tx.witnessSet();
  const redeemers = witness.redeemers();

  if (!redeemers || redeemers.size() === 0) {
    return unsignedTxHex;
  }

  const koiosCostModels = await fetchKoiosCostModels();
  const costmdls = buildCostmdls(witness, koiosCostModels);
  const datums = witness.plutusData();
  const scriptDataHash = hashScriptData(
    costmdls,
    redeemers,
    datums && datums.size() > 0 ? datums : undefined,
  );

  if (!scriptDataHash) {
    return unsignedTxHex;
  }

  const patched = tx.clone();
  const body = patched.body();
  body.setScriptDataHash(scriptDataHash);
  patched.setBody(body);
  return patched.toCbor();
}
