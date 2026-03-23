import { publicClient } from "./client";
import { coston2 } from "@flarenetwork/flare-wagmi-periphery-package";
import type { Address } from "viem";

// The Flare Contract Registry is a stable, well-known address on every Flare
// network. It resolves named system contracts (e.g. "AssetManagerFXRP") to
// their current deployment addresses, so we never need to hard-code those.
const REGISTRY_ADDRESS = "0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019" as Address;

export async function getContractAddressByName(name: string): Promise<Address> {
  const addr = await publicClient.readContract({
    address: REGISTRY_ADDRESS,
    abi: coston2.iFlareContractRegistryAbi,
    functionName: "getContractAddressByName",
    args: [name],
  });
  return addr as Address;
}
