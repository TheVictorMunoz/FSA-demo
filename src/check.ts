/**
 * check.ts — Read-only state snapshot for a Flare Smart Account
 *
 * Prints:
 *   • Your XRPL address and its linked Coston2 personal account
 *   • FXRP balance of the personal account
 *   • Operator XRPL addresses (where demo.ts sends instruction payments)
 *   • Registered ERC-4626 vaults (for deposits/withdrawals)
 *   • Registered FAssets agent vaults (used in the mint instruction)
 *
 * Run this before demo.ts to verify your setup, and after to confirm the
 * FXRP balance has increased.
 *
 * Required .env keys: XRPL_SEED
 */

import { Wallet } from "xrpl";
import {
  getAgentVaults,
  getOperatorXrplAddresses,
  getPersonalAccountAddress,
  getVaults,
} from "./utils/smart-accounts";
import { getFxrpBalance, getFxrpDecimals } from "./utils/fassets";

async function main() {
  if (!process.env.XRPL_SEED)
    throw new Error(
      "XRPL_SEED is not set.\nCopy .env.example to .env and fill in your XRPL seed."
    );

  const xrplWallet = Wallet.fromSeed(process.env.XRPL_SEED);

  console.log("=== Flare Smart Accounts — State Check (Coston2) ===\n");
  console.log("XRPL address          :", xrplWallet.address);

  // ── Operator addresses ────────────────────────────────────────────────────
  // These are the XRPL addresses the operator monitors for instruction payments.
  // demo.ts sends XRPL TX #1 to operators[0].
  const operators = await getOperatorXrplAddresses();
  console.log("Operator XRPL addr(s) :", operators);

  // ── Personal account ──────────────────────────────────────────────────────
  // The Coston2 smart contract address bound to your XRPL address.
  // Created automatically on first instruction; zero address if none yet.
  const personalAccount = await getPersonalAccountAddress(xrplWallet.address);
  console.log("Personal account addr :", personalAccount);

  const ZERO = "0x0000000000000000000000000000000000000000";
  if (personalAccount === ZERO) {
    console.log(
      "\n  No personal account found for this XRPL address.\n" +
        "  It is created automatically when the operator processes your first instruction.\n" +
        "  Run `pnpm demo` to trigger account creation."
    );
  } else {
    // ── FXRP balance ──────────────────────────────────────────────────────
    const decimals = await getFxrpDecimals();
    const balance = await getFxrpBalance(personalAccount);
    console.log(
      `FXRP balance          : ${balance} UBA` +
        (balance > 0n
          ? ` (= ${Number(balance) / 10 ** decimals} FXRP)`
          : " (no FXRP yet — run `pnpm demo` to mint)")
    );
  }

  // ── ERC-4626 vaults ───────────────────────────────────────────────────────
  const vaults = await getVaults();
  console.log(`\nRegistered vaults (${vaults.length}):`);
  if (vaults.length === 0) {
    console.log("  (none)");
  } else {
    for (const v of vaults) {
      console.log(`  id=${v.id}  type=${v.type}  address=${v.address}`);
    }
  }

  // ── FAssets agent vaults ──────────────────────────────────────────────────
  // The agentVaultId in the mint instruction must match one of these IDs.
  // demo.ts uses agentVaultId=1 by default.
  const agentVaults = await getAgentVaults();
  console.log(`\nAgent vaults (${agentVaults.length}):`);
  if (agentVaults.length === 0) {
    console.log(
      "  (none registered yet)\n" +
        "  The system requires at least one agent vault to mint FXRP.\n" +
        "  Contact the Flare team if this is empty on testnet."
    );
  } else {
    for (const av of agentVaults) {
      console.log(`  id=${av.id}  address=${av.address}`);
    }
    console.log(`\n  demo.ts uses agentVaultId=${1} — adjust INSTRUCTION.agentVaultId in demo.ts if needed.`);
  }
}

void main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error(
      "\nError:",
      err instanceof Error ? err.message : String(err)
    );
    process.exit(1);
  });
