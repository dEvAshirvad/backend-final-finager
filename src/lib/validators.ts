/**
 * GSTIN checksum validation (Luhn mod 36)
 * 15th character is checksum of first 14
 */
const GSTIN_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

function gstinCharValue(c: string): number {
  const i = GSTIN_CHARS.indexOf(c.toUpperCase());
  return i >= 0 ? i : -1;
}

export function validateGstinChecksum(gstin: string): boolean {
  if (!gstin || gstin.length !== 15) return false;
  const s = gstin.toUpperCase();
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const v = gstinCharValue(s[i]!);
    if (v < 0) return false;
    const factor = i % 2 === 0 ? 1 : 2;
    const prod = v * factor;
    sum += Math.floor(prod / 36) + (prod % 36);
  }
  const rem = sum % 36;
  const check = (36 - rem) % 36;
  return gstinCharValue(s[14]!) === check;
}

/**
 * PAN checksum: 5th character (index 4) is derived from first 4 letters and last 5 chars
 * Simplified: validate format only; full checksum requires official algorithm
 */
export function validatePanFormat(pan: string): boolean {
  if (!pan || pan.length !== 10) return false;
  return /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(pan.toUpperCase());
}
