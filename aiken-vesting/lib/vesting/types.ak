use aiken/crypto.{VerificationKeyHash}

pub type VestingDatum {
  vesting_id: ByteArray,
  issuer: VerificationKeyHash,
  beneficiary: VerificationKeyHash,
  total_amount: Int,
  start_time: Int,
  vesting_period_ms: Int,
  release_interval_ms: Int,
  claimed_amount: Int,
}

/// Redeemer tag: 0 = Claim, 1 = Cancel. `amount` is used for Claim only.
pub type VestingRedeemer {
  action: Int,
  amount: Int,
}
