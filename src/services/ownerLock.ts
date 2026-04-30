import {
  applyParamsToScript,
  resolvePaymentKeyHash,
  resolvePlutusScriptAddress,
} from '@meshsdk/core';
import type { Data, PlutusScript } from '@meshsdk/core';

import { CARDANO_NETWORK } from '../config';
import ownerLockBlueprint from '../contracts/ownerLock/plutus.json';

type AikenBlueprint = {
  preamble?: { plutusVersion?: string };
  validators: Array<{
    title: string;
    compiledCode: string;
    hash: string;
  }>;
};

const blueprint = ownerLockBlueprint as unknown as AikenBlueprint;

export function getOwnerLockCompiledCode(): string {
  const v = blueprint.validators.find((x) => x.title.endsWith('.spend')) ?? blueprint.validators[0];
  if (!v?.compiledCode) throw new Error('OwnerLock blueprint missing compiledCode');
  return v.compiledCode;
}

export function getOwnerLockScriptHash(): string {
  const v = blueprint.validators.find((x) => x.title.endsWith('.spend')) ?? blueprint.validators[0];
  if (!v?.hash) throw new Error('OwnerLock blueprint missing hash');
  return v.hash;
}

export function getOwnerLockScriptCbor(): string {
  return applyParamsToScript(getOwnerLockCompiledCode(), []);
}

export function getOwnerLockScript(): PlutusScript {
  return { code: getOwnerLockScriptCbor(), version: 'V3' };
}

export function getOwnerLockScriptAddress(): string {
  const networkId = CARDANO_NETWORK === 'mainnet' ? 1 : 0;
  return resolvePlutusScriptAddress(getOwnerLockScript(), networkId);
}

export function buildOwnerLockDatum(ownerAddress: string): Data {
  // Aiken Datum { owner: VerificationKeyHash } => constructor index 0, fields [ownerPkh]
  return {
    alternative: 0,
    fields: [resolvePaymentKeyHash(ownerAddress)],
  };
}

