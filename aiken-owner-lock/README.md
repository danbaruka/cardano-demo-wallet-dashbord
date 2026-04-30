## Aiken owner-lock demo (preprod)

This folder contains a minimal Aiken spending validator used by the dashboard demo:

- Funds can be locked at the script address.
- Funds can only be unlocked if the spending transaction is signed by the owner (pubkey hash stored in the datum).

### Build

Generate the `plutus.json` blueprint:

```bash
aiken build
```

### Output

After building, `plutus.json` is produced at the project root. The frontend consumes the validator’s `compiledCode` (CBOR hex) from that file.

