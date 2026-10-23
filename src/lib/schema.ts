import { z } from "zod";

export const chains = ["ethereum", "base", "arbitrum", "robinhood"] as const;
export const chainSchema = z.enum(chains);
export const addressSchema = z
  .string()
  .trim()
  .regex(/^0x[a-fA-F0-9]{40}$/, "Enter a valid EVM wallet address.");
export function parseWallets(text: string): string[] {
  const items = [
    ...new Set(
      text
        .split(/[\s,;]+/)
        .map((item) => item.trim())
        .filter(Boolean)
        .map((item) => item.toLowerCase()),
    ),
  ];
  if (!items.length) throw new Error("Enter at least one EVM wallet address.");
  if (items.length > 100)
    throw new Error("Use at most 100 wallet addresses per scan.");
  for (const item of items)
    if (!addressSchema.safeParse(item).success)
      throw new Error(`Invalid wallet address: ${item.slice(0, 16)}…`);
  return items;
}
export const eventSchema = z.object({
  id: z.string().trim().min(1).max(160),
  date: z.iso.datetime({ offset: true }),
  chain: chainSchema,
  wallet: addressSchema,
  collection: z.string().trim().min(1).max(120),
  contract: z
    .string()
    .trim()
    .regex(/^0x[a-fA-F0-9]{40}$/)
    .optional(),
  tokenId: z.string().trim().min(1).max(100),
  /** Public image metadata is optional; never used for PnL calculations. */
  imageUrl: z.string().url().max(1800).optional(),
  type: z.enum(["buy", "mint", "sell"]),
  amountEth: z.string().regex(/^\d+(\.\d{1,18})?$/),
  feeEth: z.string().regex(/^\d+(\.\d{1,18})?$/),
  /** False means the provider did not expose transaction costs; feeEth is an accounting placeholder only. */
  feeKnown: z.boolean().optional(),
  txHash: z
    .string()
    .trim()
    .regex(/^0x[a-fA-F0-9]{64}$/)
    .optional(),
});
export const eventsSchema = z.array(eventSchema).max(10000);
export type TradeEvent = z.infer<typeof eventSchema>;
export type Chain = z.infer<typeof chainSchema>;
