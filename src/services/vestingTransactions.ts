import { MeshTxBuilder, resolvePaymentKeyHash } from '@meshsdk/core';
import type { BrowserWallet, IWallet } from '@meshsdk/core';

import type { ClaimVestingParams, CreateVestingParams } from '../types/vesting';
import { KoiosProxyProvider } from './koiosProxyProvider';
import { patchScriptIntegrityHash } from './scriptIntegrityPatch';
import {
  buildCancelRedeemer,
  buildClaimRedeemer,
  buildVestingDatum,
  buildVestingId,
  getVestingScript,
  getVestingScriptAddress,
  normalizeVkh,
  unixMsToAbsoluteSlot,
} from './vesting';
import { claimableLovelace } from './vestingMath';
import {
  fetchVestingUtxoByRef,
  fetchWalletAddresses,
  isWalletBeneficiary,
  isWalletIssuer,
  walletVkhSet,
} from './vestingUtxos';
import type { VestingUtxo } from '../types/vesting';

function getKoiosProvider(): KoiosProxyProvider {
  return new KoiosProxyProvider();
}

async function resolveBeneficiaryAddress(
  wallet: BrowserWallet | IWallet,
  utxo: VestingUtxo,
): Promise<string> {
  const addresses = await fetchWalletAddresses(wallet);
  const beneficiaryVkhs = walletVkhSet(addresses);
  if (!beneficiaryVkhs.has(normalizeVkh(utxo.beneficiaryVkh))) {
    throw new Error('Connected wallet is not the beneficiary for this vesting.');
  }

  for (const addr of addresses) {
    if (normalizeVkh(resolvePaymentKeyHash(addr)) === normalizeVkh(utxo.beneficiaryVkh)) {
      return addr;
    }
  }

  return addresses[0];
}

async function resolveIssuerAddress(
  wallet: BrowserWallet | IWallet,
  utxo: VestingUtxo,
): Promise<string> {
  const addresses = await fetchWalletAddresses(wallet);
  const issuerVkhs = walletVkhSet(addresses);
  if (!issuerVkhs.has(normalizeVkh(utxo.issuerVkh))) {
    throw new Error('Connected wallet is not the issuer for this vesting.');
  }

  for (const addr of addresses) {
    if (normalizeVkh(resolvePaymentKeyHash(addr)) === normalizeVkh(utxo.issuerVkh)) {
      return addr;
    }
  }

  return addresses[0];
}

export async function createVestingLock(
  wallet: BrowserWallet | IWallet,
  params: CreateVestingParams,
): Promise<string> {
  const provider = getKoiosProvider();
  const utxos = await wallet.getUtxos();
  const changeAddress = await wallet.getChangeAddress();
  const issuerAddress = (await wallet.getUsedAddresses())[0] ?? changeAddress;
  const issuerVkh = resolvePaymentKeyHash(issuerAddress);
  const beneficiaryVkh = resolvePaymentKeyHash(params.beneficiaryAddress);
  const startTime = params.startTimeMs ?? Date.now();

  const vestingId = buildVestingId({
    issuerVkh,
    beneficiaryVkh,
    startTime,
    totalAmount: params.totalLovelace,
    vestingPeriodMs: params.vestingPeriodMs,
    releaseIntervalMs: params.releaseIntervalMs,
  });

  const datum = buildVestingDatum({
    vestingId,
    issuerVkh,
    beneficiaryVkh,
    totalAmount: params.totalLovelace,
    startTime,
    vestingPeriodMs: params.vestingPeriodMs,
    releaseIntervalMs: params.releaseIntervalMs,
    claimedAmount: 0,
  });

  const scriptAddress = getVestingScriptAddress();
  const txBuilder = new MeshTxBuilder({ fetcher: provider as any });

  const unsignedTx = await txBuilder
    .txOut(scriptAddress, [{ unit: 'lovelace', quantity: params.totalLovelace.toString() }])
    .txOutInlineDatumValue(datum)
    .changeAddress(changeAddress)
    .selectUtxosFrom(utxos)
    .complete();

  const signedTx = await wallet.signTx(unsignedTx);
  return await wallet.submitTx(signedTx);
}

export async function claimVestedAda(
  wallet: BrowserWallet | IWallet,
  params: ClaimVestingParams,
): Promise<string> {
  const provider = getKoiosProvider();
  const utxos = await wallet.getUtxos();
  const changeAddress = await wallet.getChangeAddress();

  const collateral = await wallet.getCollateral();
  if (!collateral || collateral.length === 0) {
    throw new Error('No collateral available. Set collateral in your wallet.');
  }

  const parsed = await fetchVestingUtxoByRef(params.utxo.tx_hash, params.utxo.tx_index);
  if (!parsed) throw new Error('Vesting UTxO not found (it may already be spent).');

  const walletAddresses = await fetchWalletAddresses(wallet);
  if (!isWalletBeneficiary(parsed, walletAddresses)) {
    throw new Error('Connected wallet is not the beneficiary for this vesting.');
  }

  const beneficiaryAddress = await resolveBeneficiaryAddress(wallet, parsed);
  const beneficiaryVkh = resolvePaymentKeyHash(beneficiaryAddress);

  const maxClaimable = claimableLovelace(parsed);
  if (params.amountLovelace <= 0) throw new Error('Claim amount must be positive.');
  if (params.amountLovelace > maxClaimable) {
    throw new Error(`Claim amount exceeds claimable balance (${maxClaimable} lovelace).`);
  }

  const scriptAddress = getVestingScriptAddress();
  const script = getVestingScript();
  const inputLovelace = parsed.lovelace;
  const newClaimed = parsed.claimedAmount + params.amountLovelace;
  const remainingVesting = parsed.totalAmount - newClaimed;
  const remainingLovelace = inputLovelace - params.amountLovelace;

  if (params.amountLovelace > inputLovelace) throw new Error('Claim amount exceeds UTxO balance.');

  const redeemer = buildClaimRedeemer(params.amountLovelace);
  const invalidBeforeSlot = await unixMsToAbsoluteSlot(Date.now());

  const txBuilder = new MeshTxBuilder({ fetcher: provider as any });
  txBuilder
    .spendingPlutusScriptV3()
    .txIn(
      params.utxo.tx_hash,
      params.utxo.tx_index,
      [{ unit: 'lovelace', quantity: inputLovelace.toString() }],
      scriptAddress,
    )
    .txInInlineDatumPresent()
    .txInRedeemerValue(redeemer)
    .txInScript(script.code)
    .requiredSignerHash(beneficiaryVkh)
    .invalidBefore(invalidBeforeSlot)
    .txOut(beneficiaryAddress, [{ unit: 'lovelace', quantity: params.amountLovelace.toString() }]);

  if (remainingVesting > 0) {
    const continuationDatum = buildVestingDatum({
      ...parsed,
      claimedAmount: newClaimed,
    });
    txBuilder
      .txOut(scriptAddress, [{ unit: 'lovelace', quantity: remainingLovelace.toString() }])
      .txOutInlineDatumValue(continuationDatum);
  }

  const unsignedTx = await txBuilder
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

export async function cancelVesting(
  wallet: BrowserWallet | IWallet,
  utxo: Pick<VestingUtxo, 'tx_hash' | 'tx_index'>,
): Promise<string> {
  const provider = getKoiosProvider();
  const utxos = await wallet.getUtxos();
  const changeAddress = await wallet.getChangeAddress();

  const collateral = await wallet.getCollateral();
  if (!collateral || collateral.length === 0) {
    throw new Error('No collateral available. Set collateral in your wallet.');
  }

  const parsed = await fetchVestingUtxoByRef(utxo.tx_hash, utxo.tx_index);
  if (!parsed) throw new Error('Vesting UTxO not found (it may already be spent).');

  const walletAddresses = await fetchWalletAddresses(wallet);
  if (!isWalletIssuer(parsed, walletAddresses)) {
    throw new Error('Connected wallet is not the issuer for this vesting.');
  }

  const issuerAddress = await resolveIssuerAddress(wallet, parsed);
  const issuerVkh = resolvePaymentKeyHash(issuerAddress);

  const scriptAddress = getVestingScriptAddress();
  const script = getVestingScript();
  const redeemer = buildCancelRedeemer();
  const txBuilder = new MeshTxBuilder({ fetcher: provider as any });

  const unsignedTx = await txBuilder
    .spendingPlutusScriptV3()
    .txIn(
      utxo.tx_hash,
      utxo.tx_index,
      [{ unit: 'lovelace', quantity: parsed.lovelace.toString() }],
      scriptAddress,
    )
    .txInInlineDatumPresent()
    .txInRedeemerValue(redeemer)
    .txInScript(script.code)
    .txOut(issuerAddress, [{ unit: 'lovelace', quantity: parsed.lovelace.toString() }])
    .requiredSignerHash(issuerVkh)
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
