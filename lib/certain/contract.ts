export const paymentInstructionContract = {
  id: "payment_instruction",
  version: "1",
  vendors: ["Acme Labs", "Northstar", "AssemblyAI"] as const,
  costCenters: ["Engineering", "Growth", "Operations"] as const,
  amount: {
    currency: "USD" as const,
    max: 25_000,
    verification: "repeat_match" as const,
  },
  invoiceId: {
    pattern: /^INV-[0-9]{5}$/,
    verification: "required" as const,
  },
  vendor: {
    verification: "on_uncertainty" as const,
    confidenceThreshold: 0.9,
  },
  dueDate: {
    futureOnly: true,
    verification: "none" as const,
  },
  costCenter: {
    verification: "none" as const,
  },
};
