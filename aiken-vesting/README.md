## Aiken vesting demo (preprod)

Step-release vesting contract used by the dashboard demo:

- An **issuer** locks ADA at the script address with schedule parameters in the inline datum.
- The **beneficiary** claims vested ADA over time (equal tranches every release interval).
- The **issuer** may **cancel** and recover the remaining locked balance.

### Datum fields

| Field | Description |
|-------|-------------|
| `vesting_id` | Stable id (blake2b hash of lock parameters) for frontend history |
| `issuer` | Issuer payment key hash |
| `beneficiary` | Beneficiary payment key hash |
| `total_amount` | Total vesting amount in lovelace |
| `start_time` | POSIX ms when vesting starts |
| `vesting_period_ms` | Total vesting duration |
| `release_interval_ms` | Release interval between tranches |
| `claimed_amount` | Cumulative claimed lovelace |

### Build

```bash
aiken check
aiken build
```

Copy the blueprint to the frontend:

```bash
cp plutus.json ../src/contracts/vesting/plutus.json
```

Or from the repo root:

```bash
npm run aiken:vesting
```

### Deploy

No separate deploy step: the script address is derived client-side from `plutus.json`. The first lock transaction funds the contract.
