use aiken/interval.{Finite, Interval, between}
use vesting/types.{VestingDatum}

pub fn num_tranches(vesting_period_ms: Int, release_interval_ms: Int) -> Int {
  vesting_period_ms / release_interval_ms
}

pub fn tranche_amount(total_amount: Int, tranches: Int) -> Int {
  total_amount / tranches
}

pub fn is_valid_schedule(datum: VestingDatum) -> Bool {
  and {
    datum.total_amount > 0,
    datum.vesting_period_ms > 0,
    datum.release_interval_ms > 0,
    datum.claimed_amount >= 0,
    datum.claimed_amount <= datum.total_amount,
    datum.vesting_period_ms % datum.release_interval_ms == 0,
    tranche_amount(
        datum.total_amount,
        num_tranches(datum.vesting_period_ms, datum.release_interval_ms),
      )
      * num_tranches(datum.vesting_period_ms, datum.release_interval_ms) == datum.total_amount,
  }
}

pub fn vested_total(datum: VestingDatum, validity_range: Interval) -> Int {
  when validity_range.lower_bound.bound_type is {
    Finite(now) -> {
      let elapsed = now - datum.start_time
      if elapsed < 0 {
        0
      } else {
        let tranches =
          num_tranches(datum.vesting_period_ms, datum.release_interval_ms)
        let per = tranche_amount(datum.total_amount, tranches)
        let completed_raw = elapsed / datum.release_interval_ms
        let completed =
          if completed_raw > tranches {
            tranches
          } else {
            completed_raw
          }
        completed * per
      }
    }
    _ -> 0
  }
}

pub fn claimable(datum: VestingDatum, validity_range: Interval) -> Int {
  let vested = vested_total(datum, validity_range)
  if vested > datum.claimed_amount {
    vested - datum.claimed_amount
  } else {
    0
  }
}

test num_tranches_divides_evenly() {
  num_tranches(10_000, 1_000) == 10
}

test tranche_amount_even_split() {
  tranche_amount(100_000_000, 10) == 10_000_000
}

test nothing_vested_before_start() {
  let datum =
    VestingDatum {
      vesting_id: #"",
      issuer: #"aa",
      beneficiary: #"bb",
      total_amount: 100,
      start_time: 1_000,
      vesting_period_ms: 10_000,
      release_interval_ms: 1_000,
      claimed_amount: 0,
    }

  let range = between(500, 2_000)

  vested_total(datum, range) == 0
}

test one_tranche_after_first_interval() {
  let datum =
    VestingDatum {
      vesting_id: #"",
      issuer: #"aa",
      beneficiary: #"bb",
      total_amount: 100,
      start_time: 0,
      vesting_period_ms: 10_000,
      release_interval_ms: 1_000,
      claimed_amount: 0,
    }

  let range = between(1_000, 2_000)

  vested_total(datum, range) == 10
}

test fully_vested_after_period() {
  let datum =
    VestingDatum {
      vesting_id: #"",
      issuer: #"aa",
      beneficiary: #"bb",
      total_amount: 100,
      start_time: 0,
      vesting_period_ms: 10_000,
      release_interval_ms: 1_000,
      claimed_amount: 0,
    }

  let range = between(10_000, 11_000)

  vested_total(datum, range) == 100
}

test claimable_subtracts_claimed() {
  let datum =
    VestingDatum {
      vesting_id: #"",
      issuer: #"aa",
      beneficiary: #"bb",
      total_amount: 100,
      start_time: 0,
      vesting_period_ms: 10_000,
      release_interval_ms: 1_000,
      claimed_amount: 30,
    }

  let range = between(5_000, 6_000)

  claimable(datum, range) == 20
}

test is_valid_schedule_rejects_uneven_split() {
  let datum =
    VestingDatum {
      vesting_id: #"",
      issuer: #"aa",
      beneficiary: #"bb",
      total_amount: 101,
      start_time: 0,
      vesting_period_ms: 10_000,
      release_interval_ms: 1_000,
      claimed_amount: 0,
    }

  is_valid_schedule(datum) == False
}
