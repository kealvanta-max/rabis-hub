/**
 * Normalises Ghanaian phone numbers to the +233XXXXXXXXX format used for MoMo.
 * Accepts "0504701032", "233504701032", "+233 50 470 1032", "050 470 1032".
 */
export function normalizeGhanaPhone(input: string): string {
  const digits = (input || "").replace(/[^\d+]/g, "");

  if (digits.startsWith("+233")) return `+${digits.slice(1).replace(/\D/g, "")}`;
  if (digits.startsWith("233")) return `+${digits.replace(/\D/g, "")}`;
  if (digits.startsWith("0")) return `+233${digits.slice(1).replace(/\D/g, "")}`;

  return digits.startsWith("+") ? digits : `+233${digits}`;
}

export function isValidGhanaPhone(input: string): boolean {
  return /^\+233\d{9}$/.test(normalizeGhanaPhone(input));
}

export function formatGhanaPhone(input: string): string {
  const normalized = normalizeGhanaPhone(input);
  const match = /^\+233(\d{2})(\d{3})(\d{4})$/.exec(normalized);
  return match ? `+233 ${match[1]} ${match[2]} ${match[3]}` : input;
}
