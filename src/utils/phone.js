/** 10-digit US number: drops a leading 1 (+1 country code) and anything after (extensions). */
export function normalizePhone(input) {
  let d = String(input || "").replace(/\D/g, "");
  if (d.length >= 11 && d.startsWith("1")) d = d.slice(1);
  return d.slice(0, 10);
}

export function formatPhoneDisplay(input) {
  const digits = normalizePhone(input);
  if (digits.length !== 10) return input;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}
