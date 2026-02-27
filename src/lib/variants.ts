import crypto from 'node:crypto';

export function generateVariantCombinations(variants: Record<string, string[]>) {
  const keys = Object.keys(variants || {});
  if (keys.length === 0) return [];
  let result: string[][] = [[]];
  for (const key of keys) {
    const vals = variants[key] || [];
    const newRes: string[][] = [];
    for (const r of result) {
      for (const v of vals) {
        newRes.push([...r, v]);
      }
    }
    result = newRes;
  }
  return result;
}

export function formatVariantCombo(parts: string[]) {
  return parts.join('-');
}

/** Deterministic short SKU suffix. Includes orgId when provided for cross-org uniqueness. */
export function generateSkuCode(name: string, variantCombo: string, orgId?: string) {
  const base = String(name || 'PRD').toUpperCase().replace(/\s+/g, '-');
  const hash = crypto.createHash('sha1').update(`${orgId ?? ''}|${base}|${variantCombo}`).digest('hex');
  const suffix = hash.slice(0, 8).toUpperCase();
  return `${base}-${variantCombo}-${suffix}`;
}

