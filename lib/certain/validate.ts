import { paymentInstructionContract as contract } from "./contract";
import { isFutureDate } from "./dates";
import { extractPaymentInstruction } from "./extract";
import { PREACCEPTED_PAYMENT_SPEC, comparePaymentSpecification, type PaymentSpecification } from "./specification";
import type { ContractEvaluation, FieldEvaluation, TranscriptEvidence } from "./types";

function fieldConfidence(transcript: TranscriptEvidence, value?: string): number | undefined {
  if (!value || !transcript.words?.length) return transcript.confidence;
  const needle = value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/);
  const matching = transcript.words.filter((word) => needle.includes(word.text.toLowerCase().replace(/[^a-z0-9]/g, "")));
  if (!matching.length) return transcript.confidence;
  return Math.min(...matching.map((word) => word.confidence));
}

export function evaluatePaymentInstruction(
  transcript: TranscriptEvidence,
  options: { referenceTime?: Date | string | number; specification?: PaymentSpecification; requireChallenge?: boolean } = {},
): ContractEvaluation {
  const referenceTime = options.referenceTime ?? new Date();
  const data = extractPaymentInstruction(transcript.text, { referenceTime });
  const fields: FieldEvaluation[] = [];

  const vendorViolations = data.vendor ? [] : ["Vendor is missing or not in the allowed vendor set."];
  const vendorConfidence = fieldConfidence(transcript, data.vendor);
  fields.push({
    field: "vendor",
    value: data.vendor,
    rule: contract.vendor.verification,
    status: vendorViolations.length ? "blocked" : vendorConfidence !== undefined && vendorConfidence < contract.vendor.confidenceThreshold ? "requires_verification" : "accepted",
    evidence: data.vendor ? [`allowed_set:${data.vendor}`, ...(vendorConfidence !== undefined ? [`confidence:${vendorConfidence.toFixed(3)}`] : [])] : [],
    violations: vendorViolations,
  });

  const amountViolations: string[] = [];
  if (!data.amount) amountViolations.push("Amount is missing.");
  if (data.amount && data.amount.amount > contract.amount.max) amountViolations.push(`Amount exceeds contract maximum of ${contract.amount.max} USD.`);
  fields.push({
    field: "amount",
    value: data.amount,
    rule: contract.amount.verification,
    status: amountViolations.length ? "blocked" : "requires_verification",
    evidence: data.amount ? [`numeric_bound:<=${contract.amount.max}`, `currency:${data.amount.currency}`] : [],
    violations: amountViolations,
  });

  const invoiceViolations: string[] = [];
  if (!data.invoiceId) invoiceViolations.push("Invoice ID is missing.");
  else if (!contract.invoiceId.pattern.test(data.invoiceId)) invoiceViolations.push("Invoice ID does not match /^INV-\\d{5}$/.");
  fields.push({
    field: "invoiceId",
    value: data.invoiceId,
    rule: contract.invoiceId.verification,
    status: invoiceViolations.length ? "blocked" : "requires_verification",
    evidence: data.invoiceId ? ["pattern:/^INV-\\d{5}$/"] : [],
    violations: invoiceViolations,
  });

  const costViolations = data.costCenter ? [] : ["Cost center is missing or not allowed."];
  fields.push({ field: "costCenter", value: data.costCenter, rule: contract.costCenter.verification, status: costViolations.length ? "blocked" : "accepted", evidence: data.costCenter ? [`allowed_set:${data.costCenter}`] : [], violations: costViolations });

  const dateViolations: string[] = [];
  if (!data.dueDate) dateViolations.push("Due date is missing or unsupported by the bounded demo parser.");
  else if (contract.dueDate.futureOnly && !isFutureDate(data.dueDate, referenceTime))
    dateViolations.push(`Due date ${data.dueDate.iso} is not in the future.`);
  fields.push({ field: "dueDate", value: data.dueDate, rule: contract.dueDate.verification, status: dateViolations.length ? "blocked" : "accepted", evidence: data.dueDate ? [`canonical_date:${data.dueDate.iso}`, "temporal_constraint:future_only"] : [], violations: dateViolations });

  const violations = fields.flatMap((field) => field.violations);
  const specification = comparePaymentSpecification(options.specification ?? PREACCEPTED_PAYMENT_SPEC, data);
  if (specification.status === "MISMATCH") {
    violations.push(`Preaccepted specification ${specification.specificationId} does not match.`);
  }
  const status = violations.length ? "blocked" : fields.some((field) => field.status === "requires_verification") ? "requires_verification" : "accepted";

  return {
    contractId: contract.id,
    contractVersion: contract.version,
    status,
    transcript,
    specification,
    challengeRequired: options.requireChallenge ?? false,
    fields,
    violations,
  };
}
