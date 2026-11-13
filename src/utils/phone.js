export function normalizePhone(input) {
  return (input || "").replace(/\D/g, "");
}

export function formatPhoneDisplay(input) {
  const digits = normalizePhone(input);
  if (digits.length !== 10) return input;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}
