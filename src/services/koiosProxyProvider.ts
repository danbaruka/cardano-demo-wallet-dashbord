import { KOIOS_API_BASE } from '../config';

type KoiosTip = Array<{ epoch_no: number }>;

type KoiosEpochParams = Array<{
  epoch_no: number;
  min_fee_a: number;
  min_fee_b: number;
  max_block_size: number;
  max_tx_size: number;
  max_bh_size: number;
  key_deposit: string;
  pool_deposit: string;
  min_pool_cost: string;
  price_mem: number;
  price_step: number;
  coins_per_utxo_size?: string;
  collateral_percent?: number;
  max_collateral_inputs?: number;
  max_tx_ex_mem?: string;
  max_tx_ex_steps?: string;
  max_block_ex_mem?: string;
  max_block_ex_steps?: string;
  max_val_size?: number;
  decentralisation?: number;
}>;

type KoiosTxInfoResponse = Array<{
  tx_hash: string;
  block_hash: string;
  tx_block_index: number;
  absolute_slot: number;
  tx_size: number;
  fee: string;
  deposit: string;
  invalid_before?: number | null;
  invalid_after?: number | null;
  outputs: Array<{
    tx_hash: string;
    tx_index: number;
    value: string;
    payment_addr: { bech32: string };
    datum_hash?: string | null;
    inline_datum?: any;
    asset_list?: Array<{ policy_id: string; asset_name: string; quantity: string }>;
  }>;
}>;

type MeshProtocolParameters = {
  coinsPerUtxoSize: number;
  collateralPercent: number;
  decentralisation: number;
  epoch: number;
  keyDeposit: number;
  maxBlockExMem: string;
  maxBlockExSteps: string;
  maxBlockHeaderSize: number;
  maxBlockSize: number;
  maxCollateralInputs: number;
  maxTxExMem: string;
  maxTxExSteps: string;
  maxTxSize: number;
  maxValSize: number;
  minFeeA: number;
  minFeeB: number;
  minPoolCost: string;
  poolDeposit: number;
  priceMem: number;
  priceStep: number;
  minFeeRefScriptCostPerByte: number;
};

type MeshTxInfo = {
  block: string;
  deposit: string;
  fees: string;
  hash: string;
  index: number;
  invalidAfter: string;
  invalidBefore: string;
  slot: string;
  size: number;
};

type MeshAsset = { unit: string; quantity: string };
type MeshUtxo = {
  input: { txHash: string; outputIndex: number };
  output: { address: string; amount: MeshAsset[]; dataHash?: string; plutusData?: string };
};

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
  if (!res.ok) {
    throw new Error(text || `Koios error (${res.status})`);
  }
  return JSON.parse(text) as T;
}

async function koiosGet<T>(path: string): Promise<T> {
  const url = `${absoluteBaseUrl()}${path.startsWith('/') ? path : `/${path}`}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(text || `Koios error (${res.status})`);
  }
  return JSON.parse(text) as T;
}

export class KoiosProxyProvider {
  // MeshTxBuilder expects an IFetcher-like object. We only implement what the
  // builder needs for our flows; the rest are stubbed.

  async fetchProtocolParameters(epoch = Number.NaN): Promise<MeshProtocolParameters> {
    if (Number.isNaN(epoch)) {
      const tip = await koiosGet<KoiosTip>('/tip');
      epoch = tip[0]?.epoch_no;
    }

    // Koios supports both GET with query and POST; POST avoids any query/CORS quirks via proxy.
    const params = await koiosPost<KoiosEpochParams>('/epoch_params', { _epoch_no: epoch });
    const p = params[0] ?? (await koiosPost<KoiosEpochParams>('/epoch_params', {}))[0];
    if (!p) throw new Error('Koios epoch_params returned empty response');

    return {
      coinsPerUtxoSize: Number(p.coins_per_utxo_size ?? '4310'),
      collateralPercent: p.collateral_percent ?? 150,
      decentralisation: p.decentralisation ?? 0,
      epoch: p.epoch_no,
      keyDeposit: Number(p.key_deposit),
      maxBlockExMem: p.max_block_ex_mem ?? '0',
      maxBlockExSteps: p.max_block_ex_steps ?? '0',
      maxBlockHeaderSize: p.max_bh_size,
      maxBlockSize: p.max_block_size,
      maxCollateralInputs: p.max_collateral_inputs ?? 3,
      maxTxExMem: p.max_tx_ex_mem ?? '0',
      maxTxExSteps: p.max_tx_ex_steps ?? '0',
      maxTxSize: p.max_tx_size,
      maxValSize: p.max_val_size ?? 0,
      minFeeA: p.min_fee_a,
      minFeeB: p.min_fee_b,
      minPoolCost: p.min_pool_cost,
      poolDeposit: Number(p.pool_deposit),
      priceMem: p.price_mem,
      priceStep: p.price_step,
      // Koios epoch_params doesn't currently include this field; use a safe default.
      // MeshTxBuilder requires it in Protocol shape.
      minFeeRefScriptCostPerByte: 0,
    };
  }

  async fetchTxInfo(hash: string): Promise<MeshTxInfo> {
    const data = await koiosPost<KoiosTxInfoResponse>('/tx_info', { _tx_hashes: [hash] });
    const tx = data[0];
    if (!tx) throw new Error('Koios tx_info returned empty response');
    return {
      block: tx.block_hash,
      deposit: tx.deposit,
      fees: tx.fee,
      hash: tx.tx_hash,
      index: tx.tx_block_index,
      invalidAfter: (tx.invalid_after ?? '').toString(),
      invalidBefore: (tx.invalid_before ?? '').toString(),
      slot: tx.absolute_slot.toString(),
      size: tx.tx_size,
    };
  }

  async fetchUTxOs(hash: string, index?: number): Promise<MeshUtxo[]> {
    const data = await koiosPost<KoiosTxInfoResponse>('/tx_info', {
      _tx_hashes: [hash],
      _assets: true,
      _scripts: true,
      _bytecode: true,
    });

    const tx = data[0];
    if (!tx) return [];

    const utxos = tx.outputs.map((o): MeshUtxo => {
      const amount: MeshAsset[] = [{ unit: 'lovelace', quantity: o.value }];
      for (const a of o.asset_list ?? []) {
        amount.push({ unit: `${a.policy_id}${a.asset_name}`, quantity: a.quantity });
      }
      return {
        input: { txHash: o.tx_hash, outputIndex: o.tx_index },
        output: {
          address: o.payment_addr?.bech32,
          amount,
          dataHash: o.datum_hash ?? undefined,
          // Koios inline_datum is JSON; Mesh expects CBOR hex when using plutusData.
          plutusData: undefined,
        },
      };
    });

    return typeof index === 'number' ? utxos.filter((u) => u.input.outputIndex === index) : utxos;
  }

  // ---- Stubs (not used by this demo) ----
  async fetchAccountInfo(_address: string): Promise<any> {
    throw new Error('Not implemented');
  }
  async fetchAddressUTxOs(_address: string, _asset?: string): Promise<any[]> {
    return [];
  }
  async fetchAddressTxs(_address: string, _options?: any): Promise<any[]> {
    return [];
  }
  async fetchAssetAddresses(_asset: string): Promise<any[]> {
    return [];
  }
  async fetchAssetMetadata(_asset: string): Promise<any> {
    throw new Error('Not implemented');
  }
  async fetchBlockInfo(_hash: string): Promise<any> {
    throw new Error('Not implemented');
  }
  async fetchCollectionAssets(_policyId: string, _cursor?: number): Promise<any> {
    return { assets: [], next: null };
  }
  async fetchGovernanceProposal(_txHash: string, _certIndex: number): Promise<any> {
    throw new Error('Not implemented');
  }
  async get(_url: string): Promise<any> {
    throw new Error('Not implemented');
  }
  async post(_url: string, _body: any, _headers?: any): Promise<any> {
    throw new Error('Not implemented');
  }
  onTxConfirmed(_txHash: string, _callback: () => void, _limit?: number): void {
    throw new Error('Not implemented');
  }
  async submitTx(_tx: string): Promise<string> {
    throw new Error('Not implemented');
  }
}

