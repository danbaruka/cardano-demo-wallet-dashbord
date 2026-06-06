use aiken/collection/list
use aiken/crypto.{VerificationKeyHash}
use cardano/address.{Script, VerificationKey}
use cardano/assets
use cardano/transaction.{
  Output, OutputReference, Transaction, find_script_outputs,
}
use vesting/schedule.{claimable, is_valid_schedule}
use vesting/types.{VestingDatum, VestingRedeemer}

const claim_action = 0

const cancel_action = 1

validator vesting {
  spend(
    datum: Option<VestingDatum>,
    redeemer: VestingRedeemer,
    own_ref: OutputReference,
    self: Transaction,
  ) {
    expect Some(d) = datum
    expect Some(spent_input) =
      list.find(self.inputs, fn(i) { i.output_reference == own_ref })
    expect Script(script_hash) = spent_input.output.address.payment_credential

    let input_lovelace = assets.lovelace_of(spent_input.output.value)
    let script_outputs = find_script_outputs(self.outputs, script_hash)

    if redeemer.action == claim_action {
      validate_claim(d, redeemer.amount, input_lovelace, script_outputs, self)
    } else if redeemer.action == cancel_action {
      validate_cancel(d, input_lovelace, script_outputs, self)
    } else {
      False
    }
  }

  else(_) {
    fail
  }
}

fn validate_claim(
  datum: VestingDatum,
  amount: Int,
  input_lovelace: Int,
  script_outputs: List<Output>,
  self: Transaction,
) -> Bool {
  let new_claimed = datum.claimed_amount + amount
  let remaining_locked = datum.total_amount - new_claimed
  let max_claim = claimable(datum, self.validity_range)

  and {
    is_valid_schedule(datum),
    list.has(self.extra_signatories, datum.beneficiary),
    amount > 0,
    amount <= max_claim,
    new_claimed <= datum.total_amount,
    lovelace_to_vkh(self.outputs, datum.beneficiary) >= amount,
    if remaining_locked > 0 {
      and {
        list.length(script_outputs) == 1,
        input_lovelace >= amount,
      }
    } else {
      and {
        list.is_empty(script_outputs),
        input_lovelace >= amount,
        new_claimed == datum.total_amount,
      }
    },
  }
}

fn validate_cancel(
  datum: VestingDatum,
  input_lovelace: Int,
  script_outputs: List<Output>,
  self: Transaction,
) -> Bool {
  and {
    is_valid_schedule(datum),
    list.has(self.extra_signatories, datum.issuer),
    list.is_empty(script_outputs),
    lovelace_to_vkh(self.outputs, datum.issuer) >= input_lovelace,
  }
}

fn lovelace_to_vkh(outputs: List<Output>, vkh: VerificationKeyHash) -> Int {
  list.foldl(
    outputs,
    0,
    fn(out, acc) {
      when out.address.payment_credential is {
        VerificationKey(pkh) ->
          if pkh == vkh {
            acc + assets.lovelace_of(out.value)
          } else {
            acc
          }
        _ -> acc
      }
    },
  )
}
