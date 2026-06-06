export type TimeUnit = 'minutes' | 'hours' | 'days';

export interface VestingDatumFields {
  vestingId: string;
  issuerVkh: string;
  beneficiaryVkh: string;
  totalAmount: number;
  startTime: number;
  vestingPeriodMs: number;
  releaseIntervalMs: number;
  claimedAmount: number;
}

export interface VestingScheduleInput {
  totalLovelace: number;
  vestingPeriodMs: number;
  releaseIntervalMs: number;
}

export interface VestingSchedulePreview {
  numTranches: number;
  trancheLovelace: number;
  isValid: boolean;
  validationError?: string;
}

export interface VestingUtxo extends VestingDatumFields {
  tx_hash: string;
  tx_index: number;
  lovelace: number;
}

export type VestingStatus = 'active' | 'completed' | 'cancelled';

export type VestingTxEventType = 'lock' | 'claim' | 'cancel';

export interface VestingTxEvent {
  type: VestingTxEventType;
  txHash: string;
  timestamp: number;
  amountLovelace: number;
  role: 'issuer' | 'beneficiary' | 'system';
  blockHeight?: number;
}

export interface VestingBalances {
  total: number;
  claimed: number;
  claimableNow: number;
  remaining: number;
  lockedInUtxo: number;
  status: VestingStatus;
  nextUnlockAt?: number;
}

export interface CreateVestingParams {
  beneficiaryAddress: string;
  totalLovelace: number;
  vestingPeriodMs: number;
  releaseIntervalMs: number;
  startTimeMs?: number;
}

export interface ClaimVestingParams {
  utxo: Pick<VestingUtxo, 'tx_hash' | 'tx_index'>;
  amountLovelace: number;
}

export function toMilliseconds(value: number, unit: TimeUnit): number {
  switch (unit) {
    case 'minutes':
      return value * 60 * 1000;
    case 'hours':
      return value * 60 * 60 * 1000;
    case 'days':
      return value * 24 * 60 * 60 * 1000;
    default:
      return value;
  }
}

export function formatDurationMs(ms: number): string {
  if (ms % toMilliseconds(1, 'days') === 0) {
    return `${ms / toMilliseconds(1, 'days')} day(s)`;
  }
  if (ms % toMilliseconds(1, 'hours') === 0) {
    return `${ms / toMilliseconds(1, 'hours')} hour(s)`;
  }
  if (ms % toMilliseconds(1, 'minutes') === 0) {
    return `${ms / toMilliseconds(1, 'minutes')} minute(s)`;
  }
  return `${Math.round(ms / 1000)} second(s)`;
}
