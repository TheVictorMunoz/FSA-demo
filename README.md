# Flare Smart Accounts Demo

Minimal end-to-end TypeScript demo showing the full
**XRPL-signed intent → Flare Smart Account execution** loop on Coston2 (Flare Testnet).

## What this demo does

```
XRPL TX #1  ──►  Operator XRPL address
    Memo = encoded FXRPCollateralReservationInstruction
         │
         │  Operator decodes memo, calls reserveCollateral() on Flare
         ▼
Flare EVENT: CollateralReserved  (carries paymentAddress + paymentReference)
         │
XRPL TX #2  ──►  FAssets agent vault XRPL address
    Memo = paymentReference from CollateralReserved event
         │
         │  FAssets operator proves payment via FDC attestation
         ▼
Flare EVENT: MintingExecuted
    → FXRP minted to your personal smart account on Coston2
```

Both XRPL transaction hashes and both Flare events are printed to the console.

---

## Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| Node.js | 20+ | `node --version` |
| pnpm | 8+ | `npm i -g pnpm` |
| XRPL Testnet wallet | — | Fund at https://faucet.altnet.rippletest.net/accounts |

Your XRPL wallet needs:
- **20 XRP** account reserve
- **5+ XRP** for minting fees (instruction fee + collateral payment)

---

## Setup

```bash
# 1. Enter the project directory
cd flare-smart-accounts-demo

# 2. Install dependencies
pnpm install

# 3. Create your .env file
cp .env.example .env
```

Edit `.env` and fill in your values:

```dotenv
# Your XRPL Testnet wallet seed (fund at https://faucet.altnet.rippletest.net/)
XRPL_SEED="sYourSeedHere"

# XRPL Testnet WebSocket RPC (public, no key needed)
XRPL_TESTNET_RPC_URL="wss://s.altnet.rippletest.net:51233/" 

# Coston2 HTTP RPC (public endpoint — no key needed for low traffic)
COSTON2_RPC_URL="https://coston2-api.flare.network/ext/C/rpc"
```

---

## Run the demo

### Step 0 — Verify setup (optional but recommended)

```bash
pnpm check
```

Prints your personal account address, FXRP balance, and the list of agent
vault IDs. Confirm that at least one agent vault is listed. The demo uses
`agentVaultId: 1` by default; change `INSTRUCTION.agentVaultId` in
`src/demo.ts` if needed.

### Step 1 — Run the happy path

```bash
pnpm demo
```

Expected output:

```
=== Flare Smart Accounts Demo (Coston2) ===
XRPL address    : rYourXrplAddress
Personal account: 0xYourPersonalAccountAddress
FXRP balance (before): 0 UBA (= 0 FXRP)

[Step 1] Sending collateral-reservation instruction via XRPL
  Operator XRPL address : rEyj8nsHLdgt79KJWzXR5BgF7ZbaohbXwq
  Instruction fee (XRP)  : 0.001
  Encoded instruction    : 0001...

  XRPL TX #1 hash: ABCDEF1234567890...

[Step 2] Waiting for CollateralReserved on Coston2…
  (Operator must process the XRPL tx and submit to Flare — ~30–90 s)

  CollateralReserved event received!
  Flare tx hash            : 0xabc...
  collateralReservationId  : 42
  paymentAddress (XRPL)    : rAgentVaultAddress
  paymentReference         : 0x464c5200...
  valueUBA                 : 1000000
  feeUBA                   : 2000

[Step 3] Sending mint payment to FAssets agent vault
  Agent vault XRPL address: rAgentVaultAddress
  Amount (XRP)            : 1.002

  XRPL TX #2 hash: 123456ABCDEF...

[Step 4] Waiting for MintingExecuted on Coston2…
  (FDC attestation round takes ~90 s; full minting may take 3–5 min)

  MintingExecuted event received!
  Flare tx hash: 0xdef...

=== Demo complete ===
MintingExecuted Flare tx : 0xdef...
FXRP balance (after)     : 1000000 UBA (= 1 FXRP)
FXRP minted              : 1000000 UBA (= 1 FXRP)

Run `pnpm check` to see full account state and vault balances.
```

Total wall-clock time: **3–7 minutes** (dominated by FDC attestation).

### Step 2 — Confirm the result

```bash
pnpm check
```

You should see your FXRP balance has increased.

---

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `XRPL_SEED` | Yes | XRPL Testnet wallet seed (e.g. `sEd...`) |
| `XRPL_TESTNET_RPC_URL` | Yes | WebSocket URL for XRPL Testnet |
| `COSTON2_RPC_URL` | No | Coston2 HTTP RPC; defaults to the public endpoint |

---

## Project structure

```
src/
  demo.ts          # Main demo: instruction TX + mint TX + event watchers
  check.ts         # Read-only state snapshot (run before and after demo)
  utils/
    client.ts                  # viem publicClient (Coston2 / flareTestnet)
    xrpl.ts                    # sendXrplPayment helper
    flare-contract-registry.ts # getContractAddressByName via on-chain registry
    smart-accounts.ts          # MasterAccountController reads + MASTER_ACCOUNT_CONTROLLER_ADDRESS
    fassets.ts                 # FXRP balance / decimals helpers
    event-types.ts             # Typed viem event log types
```

---

## Architecture overview

```
Your XRPL Wallet
      │
      │  Payment (fee XRP + encoded instruction in memo)
      ▼
Operator XRPL Address  (rEyj8nsHLdgt79KJWzXR5BgF7ZbaohbXwq on testnet)
      │
      │  Reads memo, decodes FXRPCollateralReservationInstruction
      │  Calls MasterAccountController.executeInstruction() on Coston2
      ▼
MasterAccountController (0x434936d4...)  ← Coston2 diamond proxy
      │
      │  Calls AssetManagerFXRP.reserveCollateral()
      ▼
AssetManagerFXRP  ← emits CollateralReserved(minter=personalAccount, ...)
      │
      │  You read paymentAddress + paymentReference from the event
      ▼
Your XRPL Wallet
      │
      │  Payment (XRP amount + paymentReference in memo) to agent vault
      ▼
FAssets Agent Vault (XRPL)
      │
      │  FAssets operator proves XRP payment via FDC Payment attestation
      ▼
AssetManagerFXRP  ← emits MintingExecuted
      │
      ▼
Personal Smart Account (Coston2) receives FXRP
```

---

## Troubleshooting

### "XRPL_SEED is not set"
Copy `.env.example` to `.env` and fill in your values.

### XRPL TX #1 fails with `tecNO_DST`
The operator XRPL address has no account — the address was fetched from the
contract but may not be activated on testnet. Re-run `pnpm check` and verify
the operator address shown matches `rEyj8nsHLdgt79KJWzXR5BgF7ZbaohbXwq`.

### XRPL TX #1 fails with `tecINSUFFICIENT_FUNDS`
Your wallet does not have enough XRP. Fund it at
https://faucet.altnet.rippletest.net/accounts

### Timed out waiting for `CollateralReserved`
- The operator processes XRPL transactions periodically. Wait 2–3 minutes and
  re-run.
- Verify `agentVaultId` is valid: run `pnpm check` and check the agent vaults
  list. Change `INSTRUCTION.agentVaultId` in `src/demo.ts` to match.
- Check the XRPL TX on https://testnet.xrpl.org using TX #1 hash.

### Timed out waiting for `MintingExecuted`
- FDC attestation rounds take ~90 s, plus operator processing time.
- Wait 5–10 minutes, then run `pnpm check` — the balance may already have
  updated (the event watcher only catches live events, not historical ones).

### RPC errors / rate limiting
Add your Flare API key to `COSTON2_RPC_URL`:
```
COSTON2_RPC_URL="https://coston2-api.flare.network/ext/C/rpc?x-apikey=YOUR_KEY"
```
Get a free key at https://dev.flare.network/

### TypeScript errors
`tsx` transpiles without type-checking, so TypeScript errors do not block
execution. If you see type errors, they are cosmetic and won't affect the
runtime behaviour of the demo.

---

## Key contracts on Coston2

| Name | Address |
|------|---------|
| MasterAccountController | `0x434936d47503353f06750Db1A444DBDC5F0AD37c` |
| Flare Contract Registry | `0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019` |

All other addresses (AssetManagerFXRP, Relay, etc.) are resolved dynamically
from the registry at runtime.

---

## Resources

- [Flare Developer Hub](https://dev.flare.network/)
- [FAssets documentation](https://dev.flare.network/fassets/overview)
- [XRPL Testnet faucet](https://faucet.altnet.rippletest.net/accounts)
- [Coston2 block explorer](https://coston2.testnet.flarescan.com/)
- [XRPL Testnet explorer](https://testnet.xrpl.org/)
