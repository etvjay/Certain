import { paymentInstructionContract } from "./contract";
import { normalizeMoney } from "./normalize";
import type { PaymentInstruction } from "./types";

const amountPattern = /(?:\$\s*)?([\d,]+(?:\.\d{1,2})?)\s*(?:dollars?|usd)?/i;
const invoicePattern = /\bINV[-\s]?([A-Z0-9]{1,12})\b/i;

function findAllowed(text: string, values: readonly string[]): string | undefined {
  const lower = text.toLowerCase();
  return values.find((value) => lower.includes(value.toLowerCase()));
}

export function extractPaymentInstruction(text: string): PaymentInstruction {
  const vendor = findAllowed(text, paymentInstructionContract.vendors);
  const costCenter = findAllowed(text, paymentInstructionContract.costCenters);

  const invoiceMatch = text.match(invoicePattern);
  const invoiceId = invoiceMatch ? `INV-${invoiceMatch[1].toUpperCase()}` : undefined;

  const amountMatch = text.match(amountPattern);
  const amount = amountMatch ? normalizeMoney(amountMatch[1]) ?? undefined : undefined;

  const nextFriday = /\bnext\s+friday\b/i.test(text) ? "next Friday" : undefined;
  const friday = !nextFriday && /\bfriday\b/i.test(text) ? "Friday" : undefined;
  const dueDate = nextFriday ?? friday;

  return { vendor, amount, invoiceId, costCenter, dueDate };
}
