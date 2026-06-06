import { MeshTxBuilder, resolvePaymentKeyHash } from '@meshsdk/core';
import type { BrowserWallet, IWallet } from '@meshsdk/core';

import { buildOwnerLockDatum, getOwnerLockScript, getOwnerLockScriptAddress } from './ownerLock';
import type { OwnerLockedUtxo } from './ownerLockUtxos';
import { fetchAddressUtxos } from './koios';
import { KoiosProxyProvider } from './koiosProxyProvider';
import { patchScriptIntegrityHash } from './scriptIntegrityPatch';

function getKoiosProvider(): KoiosProxyProvider {
  // A small Koios fetcher that uses KOIOS_API_BASE (/api/koios in dev)
  // and does NOT send any Authorization header (KoiosProvider(baseUrl) does).
  return new KoiosProxyProvider();
}

export async function lockAdaToOwnerScript(
  wallet: BrowserWallet | IWallet,
  amountLovelace: string,
): Promise<string> {
  const provider = getKoiosProvider();

  const utxos = await wallet.getUtxos();
  const changeAddress = await wallet.getChangeAddress();
  const ownerAddress = (await wallet.getUsedAddresses())[0] ?? changeAddress;

  const scriptAddress = getOwnerLockScriptAddress();
  const datum = buildOwnerLockDatum(ownerAddress);

  const txBuilder = new MeshTxBuilder({ fetcher: provider as any });

  const unsignedTx = await txBuilder
    .txOut(scriptAddress, [{ unit: 'lovelace', quantity: amountLovelace }])
    .txOutInlineDatumValue(datum)
    .changeAddress(changeAddress)
    .selectUtxosFrom(utxos)
    .complete();

  const signedTx = await wallet.signTx(unsignedTx);
  return await wallet.submitTx(signedTx);
}

export async function unlockAdaFromOwnerScript(
  wallet: BrowserWallet | IWallet,
  lockedUtxo: Pick<OwnerLockedUtxo, 'tx_hash' | 'tx_index'>,
): Promise<string> {
  const utxos = await wallet.getUtxos();
  const changeAddress = await wallet.getChangeAddress();
  const ownerAddress = (await wallet.getUsedAddresses())[0] ?? changeAddress;
  const ownerVkh = resolvePaymentKeyHash(ownerAddress);

  const collateral = await wallet.getCollateral();
  if (!collateral || collateral.length === 0) {
    throw new Error('No collateral available. Set collateral in your wallet.');
  }

  const scriptAddress = getOwnerLockScriptAddress();
  const script = getOwnerLockScript();

  // IMPORTANT: avoid direct Koios REST calls from browser (CORS).
  // Use our Koios service (Vite proxy via KOIOS_API_BASE) to locate the UTxO.
  const scriptUtxos = await fetchAddressUtxos(scriptAddress);
  const target = scriptUtxos.find((u) => u.tx_hash === lockedUtxo.tx_hash && u.tx_index === lockedUtxo.tx_index);
  if (!target) throw new Error('Locked UTxO not found (it may already be spent).');

  // We lock only lovelace in this demo.
  const targetAmount = [{ unit: 'lovelace', quantity: target.value }];

  const redeemer = { alternative: 0, fields: [] };

  const provider = getKoiosProvider();
  const txBuilder = new MeshTxBuilder({ fetcher: provider as any });

  const unsignedTx = await txBuilder
    .spendingPlutusScriptV3()
    .txIn(target.tx_hash, target.tx_index, targetAmount, scriptAddress)
    // The UTxO was created by our lock flow using txOutInlineDatumValue(...),
    // so the datum is inline on the output. Do NOT add a supplemental datum.
    .txInInlineDatumPresent()
    .txInRedeemerValue(redeemer)
    .txInScript(script.code)
    .txOut(changeAddress, targetAmount)
    .requiredSignerHash(ownerVkh)
    .txInCollateral(
      collateral[0].input.txHash,
      collateral[0].input.outputIndex,
      collateral[0].output.amount,
      collateral[0].output.address,
    )
    .changeAddress(changeAddress)
    .selectUtxosFrom(utxos)
    .complete();

  const patchedTx = await patchScriptIntegrityHash(unsignedTx);
  const signedTx = await wallet.signTx(patchedTx, true);
  return await wallet.submitTx(signedTx);
}

