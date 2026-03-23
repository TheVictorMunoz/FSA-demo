import { Client, Wallet, xrpToDrops } from "xrpl";
import type { Memo } from "xrpl";

export type SendXrplPaymentInput = {
  destination: string;
  // Accepts string (e.g. "1.5" from dropsToXrp) or number
  amount: number | string;
  memos: Memo[];
  wallet: Wallet;
  client: Client;
};

/**
 * Submits a signed XRPL Payment transaction and waits for validation.
 * Connects the client if needed, then disconnects after submission.
 */
export async function sendXrplPayment({
  destination,
  amount,
  memos,
  wallet,
  client,
}: SendXrplPaymentInput) {
  await client.connect();

  const prepared = await client.autofill({
    TransactionType: "Payment",
    Account: wallet.address,
    Amount: xrpToDrops(amount),
    Destination: destination,
    Memos: memos,
  });

  const signed = wallet.sign(prepared);
  const result = await client.submitAndWait(signed.tx_blob);

  await client.disconnect();

  return result;
}
