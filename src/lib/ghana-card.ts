// Ghana Card Validation Utilities

export const GHANA_CARD_REGEX = /^GHA-[0-9]{9}-[0-9]$/;

/**
 * Validates the format of a Ghana Card PIN.
 * Expected format: GHA-XXXXXXXXX-X (e.g. GHA-123456789-0)
 */
export function validateGhanaCardFormat(pin: string): boolean {
  if (!pin) return false;
  return GHANA_CARD_REGEX.test(pin.trim().toUpperCase());
}

/**
 * Normalizes a user input string to match Ghana Card format
 * Returns a formatted string like GHA-123456789-0
 */
export function formatGhanaCardInput(input: string): string {
  // Remove all non-alphanumeric characters
  const clean = input.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  
  if (clean.length === 0) return '';
  
  let formatted = clean;
  
  // Auto-prefix GHA if user starts typing numbers
  if (clean.length > 0 && /^[0-9]/.test(clean)) {
    formatted = 'GHA' + clean;
  }
  
  // Format as GHA-XXXXXXXXX-X
  if (formatted.length > 3 && formatted.length <= 12) {
    formatted = formatted.slice(0, 3) + '-' + formatted.slice(3);
  } else if (formatted.length > 12) {
    formatted = formatted.slice(0, 3) + '-' + formatted.slice(3, 12) + '-' + formatted.slice(12, 13);
  }
  
  return formatted;
}
