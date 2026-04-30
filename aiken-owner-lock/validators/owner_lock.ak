use aiken/collection/list
use aiken/crypto.{VerificationKeyHash}
use cardano/transaction.{OutputReference, Transaction}

/// Datum contains the owner's verification key hash (payment key hash).
pub type Datum {
  owner: VerificationKeyHash,
}

validator owner_lock {
  spend(datum: Option<Datum>, _redeemer: Data, _utxo: OutputReference, self: Transaction) {
    expect Some(d) = datum
    list.has(self.extra_signatories, d.owner)
  }

  else(_) {
    fail
  }
}
