import { type Address, erc20Abi } from "viem";
import { coston2 } from "@flarenetwork/flare-wagmi-periphery-package";
import { publicClient } from "./client";
import { getContractAddressByName } from "./flare-contract-registry";

async function getAssetManagerFXRPAddress(): Promise<Address> {
  return getContractAddressByName("AssetManagerFXRP");
}

/** Returns the ERC-20 address of the FXRP token on Coston2. */
async function getFxrpAddress(): Promise<Address> {
  const assetManager = await getAssetManagerFXRPAddress();
  const addr = await publicClient.readContract({
    address: assetManager,
    abi: coston2.iAssetManagerAbi,
    functionName: "fAsset",
  });
  return addr as Address;
}

/** Returns the FXRP balance of an address in UBA (Underlying Base Amount). */
export async function getFxrpBalance(address: Address): Promise<bigint> {
  const fxrp = await getFxrpAddress();
  return publicClient.readContract({
    address: fxrp,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [address],
  });
}

/** Returns the decimal places for FXRP (typically 6 for XRP-backed assets). */
export async function getFxrpDecimals(): Promise<number> {
  const fxrp = await getFxrpAddress();
  return publicClient.readContract({
    address: fxrp,
    abi: erc20Abi,
    functionName: "decimals",
  });
}
