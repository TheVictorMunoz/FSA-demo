import { createPublicClient, http } from "viem";
import { flareTestnet } from "viem/chains";

// "flareTestnet" in viem = Coston2 testnet, chain ID 114.
// Override the endpoint with COSTON2_RPC_URL in .env; the default public
// endpoint works fine but has lower rate limits.
const rpcUrl =
  process.env.COSTON2_RPC_URL ?? "https://coston2-api.flare.network/ext/C/rpc";

export const publicClient = createPublicClient({
  chain: flareTestnet,
  transport: http(rpcUrl),
});
