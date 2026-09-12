import { paymentInstructionContract } from "./contract";
import { normalizeMoney } from "./normalize";
import type { PaymentInstruction } from "./types";

const dollarAmountPattern = /\$\s*([\d,]+(?:\.\d{1,2})?)/i;
const suffixedAmountPattern = /\b([\d,]+(?:\.\d{1,2})?)\s*(?:dollars?|usd)\b/i;
const spokenAmountPattern = /\b((?:(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|and)[\s-]+)+)dollars?\b/i;
const invoicePattern = /\bINV\b[-\s]?([A-Z0-9]{1,12})\b/i;

function findAllowed(text: string, values: readonly string[]): string | undefined {
  const lower = text.toLowerCase();
  return values.find((value) => lower.includes(value.toLowerCase()));
}

function extractAmount(text: string) {
  const dollar = text.match(dollarAmountPattern);
  if (dollar) return normalizeMoney(dollar[1]) ?? undefined;

  const suffixed = text.match(suffixedAmountPattern);
  if (suffixed) return normalizeMoney(suffixed[1]) ?? undefined;

  const spoken = text.match(spokenAmountPattern);
  if (spoken) return normalizeMoney(spoken[1]) ?? undefined;

  return undefined;
}

export function extractPaymentInstruction(text: string): PaymentInstruction {
  const vendor = findAllowed(text, paymentInstructionContract.vendors);
  const costCenter = findAllowed(text, paymentInstructionContract.costCenters);

  const invoiceMatch = text.match(invoicePattern);
  const invoiceId = invoiceMatch ? `INV-${invoiceMatch[1].toUpperCase()}` : undefined;
  const amount = extractAmount(text);

  const nextFriday = /\bnext\s+friday\b/i.test(text) ? "next Friday" : undefined;
  const friday = !nextFriday && /\bfriday\b/i.test(text) ? "Friday" : undefined;
  const dueDate = nextFriday ?? friday;

  return { vendor, amount, invoiceId, costCenter, dueDate };
}
