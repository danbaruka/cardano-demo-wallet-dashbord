import type { VestingScheduleInput, VestingSchedulePreview } from '../types/vesting';

export function numTranches(vestingPeriodMs: number, releaseIntervalMs: number): number {
  return Math.floor(vestingPeriodMs / releaseIntervalMs);
}

export function trancheAmount(totalLovelace: number, tranches: number): number {
  return Math.floor(totalLovelace / tranches);
}

export function validateSchedule(input: VestingScheduleInput): VestingSchedulePreview {
  const { totalLovelace, vestingPeriodMs, releaseIntervalMs } = input;

  if (totalLovelace <= 0) {
    return { numTranches: 0, trancheLovelace: 0, isValid: false, validationError: 'Total amount must be positive' };
  }
  if (vestingPeriodMs <= 0 || releaseIntervalMs <= 0) {
    return { numTranches: 0, trancheLovelace: 0, isValid: false, validationError: 'Period and interval must be positive' };
  }
  if (vestingPeriodMs % releaseIntervalMs !== 0) {
    return {
      numTranches: 0,
      trancheLovelace: 0,
      isValid: false,
      validationError: 'Vesting period must be evenly divisible by release interval',
    };
  }

  const tranches = numTranches(vestingPeriodMs, releaseIntervalMs);
  const per = trancheAmount(totalLovelace, tranches);

  if (per * tranches !== totalLovelace) {
    return {
      numTranches: tranches,
      trancheLovelace: per,
      isValid: false,
      validationError: 'Total amount must divide evenly across tranches',
    };
  }

  return { numTranches: tranches, trancheLovelace: per, isValid: true };
}

export function vestedTotalLovelace(
  startTimeMs: number,
  totalLovelace: number,
  vestingPeriodMs: number,
  releaseIntervalMs: number,
  nowMs: number = Date.now(),
): number {
  const elapsed = nowMs - startTimeMs;
  if (elapsed < 0) return 0;

  const tranches = numTranches(vestingPeriodMs, releaseIntervalMs);
  const per = trancheAmount(totalLovelace, tranches);
  const completedRaw = Math.floor(elapsed / releaseIntervalMs);
  const completed = Math.min(completedRaw, tranches);
  return completed * per;
}

export function claimableLovelace(
  datum: {
    startTime: number;
    totalAmount: number;
    vestingPeriodMs: number;
    releaseIntervalMs: number;
    claimedAmount: number;
  },
  nowMs: number = Date.now(),
): number {
  const vested = vestedTotalLovelace(
    datum.startTime,
    datum.totalAmount,
    datum.vestingPeriodMs,
    datum.releaseIntervalMs,
    nowMs,
  );
  return Math.max(0, vested - datum.claimedAmount);
}

export function nextUnlockTimeMs(
  startTimeMs: number,
  vestingPeriodMs: number,
  releaseIntervalMs: number,
  nowMs: number = Date.now(),
): number | undefined {
  const elapsed = nowMs - startTimeMs;
  if (elapsed >= vestingPeriodMs) return undefined;
  if (elapsed < 0) return startTimeMs + releaseIntervalMs;

  const tranches = numTranches(vestingPeriodMs, releaseIntervalMs);
  const completedRaw = Math.floor(elapsed / releaseIntervalMs);
  if (completedRaw >= tranches) return undefined;

  return startTimeMs + (completedRaw + 1) * releaseIntervalMs;
}

export function getVestingStatus(
  totalAmount: number,
  claimedAmount: number,
  startTimeMs: number,
  vestingPeriodMs: number,
  hasUtxo: boolean,
): 'active' | 'completed' | 'cancelled' {
  if (!hasUtxo) {
    return claimedAmount >= totalAmount ? 'completed' : 'cancelled';
  }
  if (claimedAmount >= totalAmount) return 'completed';
  if (Date.now() >= startTimeMs + vestingPeriodMs && claimableLovelace({
    startTime: startTimeMs,
    totalAmount,
    vestingPeriodMs,
    releaseIntervalMs: 1,
    claimedAmount,
  }) === 0 && claimedAmount < totalAmount) {
    return 'active';
  }
  return 'active';
}

export function buildTrancheTimeline(
  startTimeMs: number,
  totalLovelace: number,
  vestingPeriodMs: number,
  releaseIntervalMs: number,
  claimedAmount: number,
  nowMs: number = Date.now(),
): Array<{ index: number; unlockAt: number; amountLovelace: number; state: 'past' | 'current' | 'future' }> {
  const tranches = numTranches(vestingPeriodMs, releaseIntervalMs);
  const per = trancheAmount(totalLovelace, tranches);
  const vested = vestedTotalLovelace(startTimeMs, totalLovelace, vestingPeriodMs, releaseIntervalMs, nowMs);

  return Array.from({ length: tranches }, (_, index) => {
    const unlockAt = startTimeMs + (index + 1) * releaseIntervalMs;
    const cumulative = (index + 1) * per;
    let state: 'past' | 'current' | 'future' = 'future';
    if (cumulative <= claimedAmount) state = 'past';
    else if (cumulative <= vested) state = 'current';
    return { index: index + 1, unlockAt, amountLovelace: per, state };
  });
}
