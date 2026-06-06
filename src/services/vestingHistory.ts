import { KOIOS_API_BASE } from '../config';
import type { KoiosTransaction } from './koios';
import { parseVestingDatumInline } from './vesting';
import type { VestingTxEvent } from '../types/vesting';

async function koiosPost<T>(path: string, body: unknown): Promise<T> {
  const base = KOIOS_API_BASE.startsWith('http') ? KOIOS_API_BASE : `${window.location.origin}${KOIOS_API_BASE}`;
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Koios error: ${res.statusText}`);
  return res.json() as Promise<T>;
}

function datumSourceFromIo(io: { inline_datum?: unknown }): unknown {
  if (!io.inline_datum || typeof io.inline_datum !== 'object') return io.inline_datum ?? null;
  const inline = io.inline_datum as { value?: unknown };
  return inline.value ?? io.inline_datum;
}

function outputDatumFields(output: KoiosTransaction['outputs'][number]): ReturnType<typeof parseVestingDatumInline> {
  return parseVestingDatumInline(datumSourceFromIo(output));
}

function classifyVestingTx(
  tx: KoiosTransaction,
  scriptAddress: string,
  vestingId: string,
  issuerVkh: string,
  beneficiaryVkh: string,
): VestingTxEvent | null {
  const scriptOutputs = tx.outputs.filter((o) => o.payment_addr?.bech32 === scriptAddress);
  const scriptInputs = tx.inputs.filter((i) => i.payment_addr?.bech32 === scriptAddress);

  const touchesVesting = [...scriptOutputs, ...scriptInputs].some((io) => {
    const datum = 'inline_datum' in io ? outputDatumFields(io as KoiosTransaction['outputs'][number]) : null;
    return datum?.vestingId === vestingId;
  });

  if (!touchesVesting) return null;

  const timestamp = (tx.tx_timestamp ?? 0) * 1000;

  if (scriptInputs.length === 0 && scriptOutputs.length > 0) {
    const lockOutput = scriptOutputs.find((o) => outputDatumFields(o)?.vestingId === vestingId);
    const amount = lockOutput ? parseInt(lockOutput.value || '0', 10) : 0;
    return {
      type: 'lock',
      txHash: tx.tx_hash,
      timestamp,
      amountLovelace: amount,
      role: 'issuer',
      blockHeight: tx.block_height,
    };
  }

  const hasScriptOutput = scriptOutputs.some((o) => outputDatumFields(o)?.vestingId === vestingId);
  if (scriptInputs.length > 0 && !hasScriptOutput) {
    const inputDatum = scriptInputs
      .map((i) => parseVestingDatumInline(datumSourceFromIo(i as { inline_datum?: unknown })))
      .find((d) => d?.vestingId === vestingId);
    const toIssuer = tx.outputs
      .filter((o) => outputDatumFields(o)?.issuerVkh === issuerVkh || o.payment_addr?.cred === issuerVkh)
      .reduce((sum, o) => sum + parseInt(o.value || '0', 10), 0);

    if (toIssuer > 0 || inputDatum) {
      return {
        type: 'cancel',
        txHash: tx.tx_hash,
        timestamp,
        amountLovelace: toIssuer,
        role: 'issuer',
        blockHeight: tx.block_height,
      };
    }
  }

  if (scriptInputs.length > 0) {
    const before =
      scriptInputs
        .map((i) => parseVestingDatumInline(datumSourceFromIo(i as { inline_datum?: unknown })))
        .find((d) => d?.vestingId === vestingId)?.claimedAmount ?? 0;
    const after =
      scriptOutputs
        .map((o) => outputDatumFields(o))
        .find((d) => d?.vestingId === vestingId)?.claimedAmount ?? before;

    const claimedDelta = Math.max(0, after - before);
    const toBeneficiary = tx.outputs.reduce((sum, o) => {
      if (o.payment_addr?.cred === beneficiaryVkh) {
        return sum + parseInt(o.value || '0', 10);
      }
      return sum;
    }, 0);

    return {
      type: 'claim',
      txHash: tx.tx_hash,
      timestamp,
      amountLovelace: claimedDelta > 0 ? claimedDelta : toBeneficiary,
      role: 'beneficiary',
      blockHeight: tx.block_height,
    };
  }

  return null;
}

export async function fetchVestingHistory(
  scriptAddress: string,
  vestingId: string,
  issuerVkh: string,
  beneficiaryVkh: string,
): Promise<VestingTxEvent[]> {
  const txList = await koiosPost<Array<{ tx_hash: string; block_time?: number }>>('/address_txs', {
    _addresses: [scriptAddress],
  });

  if (!txList.length) return [];

  const hashes = txList.slice(0, 50).map((t) => t.tx_hash);
  const txs = await koiosPost<KoiosTransaction[]>('/tx_info', {
    _tx_hashes: hashes,
    _inputs: true,
    _metadata: false,
    _assets: false,
    _withdrawals: false,
    _certs: false,
    _scripts: false,
    _bytecode: false,
  });

  const events = txs
    .map((tx) => classifyVestingTx(tx, scriptAddress, vestingId, issuerVkh, beneficiaryVkh))
    .filter((e): e is VestingTxEvent => e !== null)
    .sort((a, b) => b.timestamp - a.timestamp);

  return events;
}
