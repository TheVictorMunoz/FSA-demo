import type { Log, AbiEvent } from "viem";
import { coston2 } from "@flarenetwork/flare-wagmi-periphery-package";

// Helper that extracts the viem Log type for a named event from an ABI array.
// The `strict: false` tsconfig means we don't need perfect ABI typing here.
type EventLog<TAbi extends readonly unknown[], TEventName extends string> = Log<
  bigint,
  number,
  false,
  Extract<TAbi[number], { type: "event"; name: TEventName }> & AbiEvent,
  true
>;

// ── FAssets AssetManager events ──────────────────────────────────────────────

/**
 * Emitted by AssetManagerFXRP when the operator reserves collateral on behalf
 * of your personal account (Step 2 in demo.ts).
 *
 * Key fields:
 *   minter              — your personal account address on Coston2
 *   collateralReservationId — used to match the later MintingExecuted event
 *   paymentAddress      — XRPL address to send the mint payment to
 *   paymentReference    — hex string to include as the XRPL memo
 *   valueUBA            — amount of FXRP to be minted (in drops)
 *   feeUBA              — minting fee (in drops)
 */
export type CollateralReservedEventType = EventLog<
  typeof coston2.iAssetManagerAbi,
  "CollateralReserved"
>;

/**
 * Emitted by AssetManagerFXRP once the XRP mint payment has been proved on
 * Flare via FDC attestation and FXRP is minted to the personal account
 * (Step 4 in demo.ts).
 */
export type MintingExecutedEventType = EventLog<
  typeof coston2.iAssetManagerAbi,
  "MintingExecuted"
>;

// ── MasterAccountController events ───────────────────────────────────────────

/** Emitted when FXRP is transferred out of a personal account. */
export type FxrpTransferredEventType = EventLog<
  typeof coston2.iMasterAccountControllerAbi,
  "FXrpTransferred"
>;
