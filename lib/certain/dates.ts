/**
 * Deterministic relative-date normalization for the bounded payment demo.
 *
 * Supported inputs (case-insensitive, matched as whole phrases):
 * - "today"
 * - "tomorrow" (optional trailing "morning")
 * - "next <weekday>" — first <weekday> strictly after the reference date
 * - bare "<weekday>" — first <weekday> on or after the reference date
 *
 * All arithmetic is done in UTC so results are identical regardless of the
 * machine timezone. Callers inject `referenceTime`; production defaults to
 * the current time while tests must pass a fixed timestamp.
 */
const WEEKDAYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

export type DueDate = {
  raw: string;
  /** Canonical calendar date in YYYY-MM-DD (UTC). */
  iso: string;
};

function toUtcMidnight(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function isoOf(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

export function resolveDueDate(
  text: string,
  referenceTime: Date | string | number = new Date(),
): DueDate | undefined {
  const reference = toUtcMidnight(new Date(referenceTime));
  const weekdayAlternation = WEEKDAYS.join("|");

  const nextMatch = text.match(new RegExp(`\\bnext\\s+(${weekdayAlternation})\\b`, "i"));
  if (nextMatch) {
    const target = WEEKDAYS.indexOf(nextMatch[1].toLowerCase() as (typeof WEEKDAYS)[number]);
    const delta = ((target - reference.getUTCDay() + 7) % 7) || 7;
    return { raw: nextMatch[0], iso: isoOf(addDays(reference, delta)) };
  }

  const bareMatch = text.match(new RegExp(`\\b(${weekdayAlternation})\\b`, "i"));
  if (bareMatch) {
    const target = WEEKDAYS.indexOf(bareMatch[1].toLowerCase() as (typeof WEEKDAYS)[number]);
    const delta = (target - reference.getUTCDay() + 7) % 7;
    return { raw: bareMatch[0], iso: isoOf(addDays(reference, delta)) };
  }

  const tomorrowMatch = text.match(/\btomorrow(?:\s+morning)?\b/i);
  if (tomorrowMatch) {
    return { raw: tomorrowMatch[0], iso: isoOf(addDays(reference, 1)) };
  }

  const todayMatch = text.match(/\btoday\b/i);
  if (todayMatch) {
    return { raw: todayMatch[0], iso: isoOf(reference) };
  }

  return undefined;
}

/** True when the canonical date is strictly after the reference calendar date. */
export function isFutureDate(due: DueDate, referenceTime: Date | string | number = new Date()): boolean {
  const reference = toUtcMidnight(new Date(referenceTime));
  return due.iso > isoOf(reference);
}
