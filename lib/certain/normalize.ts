const NUMBER_WORDS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50,
  sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};

export function wordsToNumber(input: string): number | null {
  const numeric = Number(input.replace(/[$,]/g, "").trim());
  if (Number.isFinite(numeric)) return numeric;

  const tokens = input
    .toLowerCase()
    .replace(/\b(?:dollars?|usd|and)\b|,/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  let total = 0;
  let current = 0;
  let sawNumber = false;

  for (const token of tokens) {
    if (token === "hundred") {
      current = Math.max(1, current) * 100;
      sawNumber = true;
      continue;
    }
    if (token === "thousand") {
      total += Math.max(1, current) * 1000;
      current = 0;
      sawNumber = true;
      continue;
    }
    const value = NUMBER_WORDS[token];
    if (value === undefined) return null;
    current += value;
    sawNumber = true;
  }

  return sawNumber ? total + current : null;
}

export function normalizeMoney(input: string): { amount: number; currency: "USD" } | null {
  const amount = wordsToNumber(input);
  return amount === null ? null : { amount, currency: "USD" };
}

export function canonicalString(input: string): string {
  return input.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}
