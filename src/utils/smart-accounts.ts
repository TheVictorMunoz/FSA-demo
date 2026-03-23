import { fromHex, type Address } from "viem";
import { coston2 } from "@flarenetwork/flare-wagmi-periphery-package";
import { publicClient } from "./client";
import { getContractAddressByName } from "./flare-contract-registry";
import { dropsToXrp } from "xrpl";

/**
 * The MasterAccountController diamond proxy deployed on Coston2.
 * Hard-coded here for use in synchronous contexts (e.g. event watchers where
 * we cannot await). Source: deployment/deploys/coston2.json in
 * flare-smart-accounts-main.
 */
export const MASTER_ACCOUNT_CONTROLLER_ADDRESS =
  "0x434936d47503353f06750Db1A444DBDC5F0AD37c" as Address;

/**
 * Fetches the MasterAccountController address dynamically from the Flare
 * Contract Registry. Matches MASTER_ACCOUNT_CONTROLLER_ADDRESS in practice
 * but is the canonical on-chain source of truth.
 */
export async function getMasterAccountControllerAddress(): Promise<Address> {
  return getContractAddressByName("MasterAccountController");
}

/**
 * Returns the XRPL addresses that the operator is monitoring for instruction
 * payments. Send your XRPL instruction payment to addresses[0].
 */
export async function getOperatorXrplAddresses(): Promise<string[]> {
  const result = await publicClient.readContract({
    address: await getMasterAccountControllerAddress(),
    abi: coston2.iMasterAccountControllerAbi,
    functionName: "getXrplProviderWallets",
    args: [],
  });
  return result as string[];
}

/**
 * Returns the Coston2 personal smart account address bound to an XRPL
 * address. Returns the zero address if no account exists yet — the operator
 * creates one automatically when it processes your first instruction.
 */
export async function getPersonalAccountAddress(
  xrplAddress: string
): Promise<Address> {
  const addr = await publicClient.readContract({
    address: await getMasterAccountControllerAddress(),
    abi: coston2.iMasterAccountControllerAbi,
    functionName: "getPersonalAccount",
    args: [xrplAddress],
  });
  return addr as Address;
}

export type Vault = { id: bigint; address: Address; type: number };

/** Returns ERC-4626 vaults registered in the smart accounts system. */
export async function getVaults(): Promise<Vault[]> {
  const raw = (await publicClient.readContract({
    address: await getMasterAccountControllerAddress(),
    abi: coston2.iMasterAccountControllerAbi,
    functionName: "getVaults",
    args: [],
  })) as [bigint[], string[], number[]];

  return raw[0].map((id, i) => ({
    id,
    address: raw[1][i]! as Address,
    type: raw[2][i]!,
  }));
}

export type AgentVault = { id: bigint; address: Address };

/**
 * Returns FAssets agent vaults registered in the system.
 * The agentVaultId field in your instruction must match one of these IDs.
 */
export async function getAgentVaults(): Promise<AgentVault[]> {
  const raw = (await publicClient.readContract({
    address: await getMasterAccountControllerAddress(),
    abi: coston2.iMasterAccountControllerAbi,
    functionName: "getAgentVaults",
    args: [],
  })) as [bigint[], string[]];

  return raw[0].map((id, i) => ({
    id,
    address: raw[1][i]! as Address,
  }));
}

/**
 * Returns the XRP instruction fee (as a number, e.g. 0.001)
 * that must be included as the XRPL payment amount when sending an instruction.
 *
 * The fee is keyed by the instruction type ID encoded in the first 2 bytes
 * of the encoded instruction hex string.
 */
export async function getInstructionFee(encodedInstruction: string): Promise<number> {
  // First 2 bytes (4 hex chars after "0x") = instruction type ID
  const instructionIdHex = encodedInstruction.slice(0, 4) as `0x${string}`;
  const instructionId = fromHex(instructionIdHex, "bigint");

  const feeDrops = await publicClient.readContract({
    address: await getMasterAccountControllerAddress(),
    abi: coston2.iMasterAccountControllerAbi,
    functionName: "getInstructionFee",
    args: [instructionId],
  });

  // dropsToXrp(number) → number: converts XRP drops to XRP units
  return dropsToXrp(Number(feeDrops));
}
