/**
 * demo.ts — Flare Smart Accounts end-to-end demo
 *
 * Demonstrates the core "intent → proof → execution" loop:
 *
 *   ┌──────────────────────────────────────────────────────────────────────┐
 *   │  INTENT                                                              │
 *   │  XRPL TX #1 ──► Operator's XRPL address                            │
 *   │  Payment amount = instruction fee (XRP)                             │
 *   │  Memo         = encoded FXRPCollateralReservationInstruction        │
 *   │                                                                      │
 *   │       Operator decodes memo, calls reserveCollateral() on Flare     │
 *   │                         ↓                                           │
 *   │  PROOF (Step 1)                                                      │
 *   │  Flare EVENT: CollateralReserved on AssetManagerFXRP                │
 *   │  → carries paymentAddress (XRPL agent vault) and paymentReference   │
 *   │                                                                      │
 *   │  EXECUTION TRIGGER                                                   │
 *   │  XRPL TX #2 ──► Agent vault XRPL address (paymentAddress)          │
 *   │  Amount = valueUBA + feeUBA (in XRP)                                │
 *   │  Memo   = paymentReference (hex, from CollateralReserved event)     │
 *   │                                                                      │
 *   │       FAssets operator proves payment on-chain via FDC attestation  │
 *   │                         ↓                                           │
 *   │  PROOF (Step 2)                                                      │
 *   │  Flare EVENT: MintingExecuted on AssetManagerFXRP                   │
 *   │  → FXRP minted to your personal smart account on Coston2            │
 *   └──────────────────────────────────────────────────────────────────────┘
 *
 * Required .env keys:
 *   XRPL_SEED            — XRPL Testnet wallet seed
 *   XRPL_TESTNET_RPC_URL — WebSocket URL for XRPL Testnet
 *   COSTON2_RPC_URL      — (optional) HTTP RPC for Coston2
 */

import { Client, dropsToXrp, Wallet } from "xrpl";
import { FXRPCollateralReservationInstruction } from "@flarenetwork/smart-accounts-encoder";
import { coston2 } from "@flarenetwork/flare-wagmi-periphery-package";
import { publicClient } from "./utils/client";
import { sendXrplPayment } from "./utils/xrpl";
import {
  getInstructionFee,
  getOperatorXrplAddresses,
  getPersonalAccountAddress,
} from "./utils/smart-accounts";
import type { CollateralReservedEventType } from "./utils/event-types";
import { getContractAddressByName } from "./utils/flare-contract-registry";
import { getFxrpBalance, getFxrpDecimals } from "./utils/fassets";

// ── Instruction parameters ───────────────────────────────────────────────────
// walletId    : 0 = your primary XRPL wallet (index into the operator's list)
// value       : 1 = mint 1 lot of FXRP (minimum; 1 lot ≈ 1 XRP worth of FXRP)
// agentVaultId: 1 = first registered FAssets agent vault
//   Run `pnpm check` first to confirm available agent vault IDs.
const INSTRUCTION = { walletId: 0, value: 1, agentVaultId: 1 } as const;

// ── Step 1 & 2: send instruction → wait for CollateralReserved ───────────────

async function step1_sendInstruction(
  xrplClient: Client,
  xrplWallet: Wallet,
  personalAccountAddress: string
): Promise<CollateralReservedEventType> {
  // Build and encode the instruction. The encoded hex goes into the XRPL memo.
  const instruction = new FXRPCollateralReservationInstruction(INSTRUCTION);
  const encoded = instruction.encode(); // e.g. "0x0001000000..."

  // Fetch the operator's XRPL address from the on-chain registry.
  // This is the destination for instruction payments.
  const operatorAddress = (await getOperatorXrplAddresses())[0]!;

  // Fetch the instruction fee (in XRP) from the MasterAccountController.
  // Derived from the instruction type ID in the first 2 bytes of `encoded`.
  const fee = await getInstructionFee(encoded);

  console.log("\n[Step 1] Sending collateral-reservation instruction via XRPL");
  console.log("  Operator XRPL address :", operatorAddress);
  console.log("  Instruction fee (XRP)  :", fee);
  console.log("  Encoded instruction    :", encoded.slice(2)); // strip "0x"

  // ── XRPL TX #1 ──────────────────────────────────────────────────────────
  // This is the "intent" transaction. The operator monitors the operator
  // address on XRPL and acts on any payment whose memo it recognises.
  const tx1 = await sendXrplPayment({
    destination: operatorAddress,
    amount: fee,
    // The memo carries the ABI-encoded instruction. The operator decodes this
    // to know what action to take (here: reserve collateral for FXRP minting).
    memos: [{ Memo: { MemoData: encoded.slice(2) } }],
    wallet: xrplWallet,
    client: xrplClient,
  });

  console.log("\n  XRPL TX #1 hash:", tx1.result.hash);
  if ((tx1.result.meta as any)?.TransactionResult !== "tesSUCCESS") {
    throw new Error(
      `XRPL TX #1 failed: ${(tx1.result.meta as any)?.TransactionResult}`
    );
  }

  // ── Wait for CollateralReserved on Flare ────────────────────────────────
  // The operator sees TX #1, verifies it, then calls reserveCollateral() on
  // the FAssets AssetManagerFXRP contract. That contract emits CollateralReserved.
  // We watch for the event whose `minter` matches our personal account.
  console.log("\n[Step 2] Waiting for CollateralReserved on Coston2…");
  console.log("  (Operator must process the XRPL tx and submit to Flare — ~30–90 s)");

  const assetManagerAddress = await getContractAddressByName("AssetManagerFXRP");

  return new Promise<CollateralReservedEventType>((resolve, reject) => {
    // Safety timeout: if no event arrives in 10 min, bail out.
    const timeout = setTimeout(() => {
      unwatch();
      reject(
        new Error(
          "Timed out waiting for CollateralReserved.\n" +
            "Possible causes:\n" +
            "  • The operator has not processed your XRPL tx yet (try again later).\n" +
            "  • agentVaultId=" +
            INSTRUCTION.agentVaultId +
            " is not registered — run `pnpm check`.\n" +
            "  • The XRPL TX was rejected (check the hash on https://testnet.xrpl.org)."
        )
      );
    }, 10 * 60 * 1000);

    const unwatch = publicClient.watchContractEvent({
      address: assetManagerAddress,
      abi: coston2.iAssetManagerAbi,
      eventName: "CollateralReserved",
      onLogs: (logs) => {
        for (const log of logs) {
          const typed = log as CollateralReservedEventType;
          // Filter: only our personal account's reservation
          if (
            typed.args.minter?.toLowerCase() !==
            personalAccountAddress.toLowerCase()
          )
            continue;

          clearTimeout(timeout);
          unwatch();

          console.log("\n  CollateralReserved event received!");
          console.log("  Flare tx hash            :", typed.transactionHash);
          console.log("  collateralReservationId  :", typed.args.collateralReservationId?.toString());
          console.log("  paymentAddress (XRPL)    :", typed.args.paymentAddress);
          console.log("  paymentReference         :", typed.args.paymentReference);
          console.log("  valueUBA                 :", typed.args.valueUBA?.toString());
          console.log("  feeUBA                   :", typed.args.feeUBA?.toString());

          resolve(typed);
          break;
        }
      },
    });
  });
}

// ── Step 3 & 4: send mint payment → wait for MintingExecuted ─────────────────

async function step3_sendMintPayment(
  collateralReserved: CollateralReservedEventType,
  xrplClient: Client,
  xrplWallet: Wallet
): Promise<string> {
  const { valueUBA, feeUBA, paymentAddress, paymentReference, collateralReservationId } =
    collateralReserved.args;

  // Total XRP to send = value + fee (both in drops → convert to XRP string)
  const amountXrp = dropsToXrp((valueUBA! + feeUBA!).toString());

  console.log("\n[Step 3] Sending mint payment to FAssets agent vault");
  console.log("  Agent vault XRPL address:", paymentAddress);
  console.log("  Amount (XRP)            :", amountXrp);

  // ── XRPL TX #2 ──────────────────────────────────────────────────────────
  // This is the actual XRP transfer that backs the FXRP to be minted.
  // The paymentReference (a 32-byte hex string from CollateralReserved) is
  // placed in the memo exactly as received, so the FAssets system can match
  // this payment to the reservation in Step 1.
  const tx2 = await sendXrplPayment({
    destination: paymentAddress!,
    amount: amountXrp,
    memos: [{ Memo: { MemoData: paymentReference!.slice(2) } }],
    wallet: xrplWallet,
    client: xrplClient,
  });

  console.log("\n  XRPL TX #2 hash:", tx2.result.hash);
  if ((tx2.result.meta as any)?.TransactionResult !== "tesSUCCESS") {
    throw new Error(
      `XRPL TX #2 failed: ${(tx2.result.meta as any)?.TransactionResult}`
    );
  }

  // ── Wait for MintingExecuted on Flare ───────────────────────────────────
  // The FAssets operator observes TX #2 on XRPL, then submits a Payment
  // attestation request to Flare's FDC. After the attestation round finalises
  // (~90 s), it calls executeDeposit() on AssetManagerFXRP, which emits
  // MintingExecuted and mints FXRP to your personal account.
  console.log("\n[Step 4] Waiting for MintingExecuted on Coston2…");
  console.log(
    "  (FDC attestation round takes ~90 s; full minting may take 3–5 min)"
  );

  const assetManagerAddress = await getContractAddressByName("AssetManagerFXRP");

  return new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(() => {
      unwatch();
      reject(
        new Error(
          "Timed out waiting for MintingExecuted.\n" +
            "The FDC attestation may still be in-flight. " +
            "Check the FAssets explorer or run `pnpm check` in a few minutes."
        )
      );
    }, 15 * 60 * 1000);

    const unwatch = publicClient.watchContractEvent({
      address: assetManagerAddress,
      abi: coston2.iAssetManagerAbi,
      eventName: "MintingExecuted",
      onLogs: (logs) => {
        for (const log of logs) {
          // Match by collateralReservationId so we don't react to other mints
          if (
            (log.args as any).collateralReservationId !== collateralReservationId
          )
            continue;

          clearTimeout(timeout);
          unwatch();

          console.log("\n  MintingExecuted event received!");
          console.log("  Flare tx hash:", log.transactionHash);

          resolve(log.transactionHash ?? "");
          break;
        }
      },
    });
  });
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  // Validate required env vars up-front for clear error messages
  if (!process.env.XRPL_SEED)
    throw new Error(
      "XRPL_SEED is not set.\nCopy .env.example to .env and fill in your values."
    );
  if (!process.env.XRPL_TESTNET_RPC_URL)
    throw new Error(
      "XRPL_TESTNET_RPC_URL is not set.\nCopy .env.example to .env and fill in your values."
    );

  const xrplClient = new Client(process.env.XRPL_TESTNET_RPC_URL);
  const xrplWallet = Wallet.fromSeed(process.env.XRPL_SEED);

  console.log("=== Flare Smart Accounts Demo (Coston2) ===");
  console.log("XRPL address    :", xrplWallet.address);

  // Your personal smart account on Coston2 is deterministically derived from
  // your XRPL address by the MasterAccountController.
  const personalAccount = await getPersonalAccountAddress(xrplWallet.address);
  console.log("Personal account:", personalAccount);

  if (personalAccount === "0x0000000000000000000000000000000000000000") {
    console.log(
      "\nNote: no personal account yet for this XRPL address.\n" +
        "It will be created automatically when the operator processes your first instruction."
    );
  }

  const decimals = await getFxrpDecimals();
  const balanceBefore = await getFxrpBalance(personalAccount);
  console.log(
    `FXRP balance (before): ${balanceBefore} UBA (= ${Number(balanceBefore) / 10 ** decimals} FXRP)`
  );

  // ── Step 1+2: XRPL instruction TX → CollateralReserved on Flare ──────────
  const collateralReservedEvent = await step1_sendInstruction(
    xrplClient,
    xrplWallet,
    personalAccount
  );

  // ── Step 3+4: XRPL mint payment TX → MintingExecuted on Flare ────────────
  const mintingTxHash = await step3_sendMintPayment(
    collateralReservedEvent,
    xrplClient,
    xrplWallet
  );

  // ── Final state ───────────────────────────────────────────────────────────
  const balanceAfter = await getFxrpBalance(personalAccount);
  const minted = balanceAfter - balanceBefore;

  console.log("\n=== Demo complete ===");
  console.log(`MintingExecuted Flare tx : ${mintingTxHash}`);
  console.log(
    `FXRP balance (after)     : ${balanceAfter} UBA (= ${Number(balanceAfter) / 10 ** decimals} FXRP)`
  );
  console.log(
    `FXRP minted              : ${minted} UBA (= ${Number(minted) / 10 ** decimals} FXRP)`
  );
  console.log("\nRun `pnpm check` to see full account state and vault balances.");
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
