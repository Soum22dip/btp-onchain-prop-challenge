// =============================================================================
// Setl8 Backend — Decimal Serialization Utility
//
// Converts Prisma Decimal objects to numbers for JSON serialization.
// Decimal fields: Attempt, Position, PayoutRequest, PayoutBatch, AttemptSnapshot
// =============================================================================

/**
 * Recursively converts all Prisma Decimal objects to numbers.
 * Handles nested objects, arrays, and preserves all other types.
 */
export function serializeDecimals<T extends Record<string, any>>(obj: T): T {
  if (obj === null || obj === undefined) {
    return obj;
  }

  // Handle arrays
  if (Array.isArray(obj)) {
    return obj.map((item: any) => serializeDecimals(item)) as any;
  }

  // Handle objects
  if (typeof obj === 'object') {
    const result = { ...obj };
    for (const key in result) {
      const val = result[key];
      if (val === null || val === undefined) continue;

      // Check if it's a Decimal object (has toNumber method)
      if (typeof val === 'object' && typeof val.toNumber === 'function') {
        (result as any)[key] = val.toNumber();
      }
      // Recursively handle nested objects
      else if (typeof val === 'object' && !Array.isArray(val) && (val as any).constructor !== Date) {
        (result as any)[key] = serializeDecimals(val);
      }
      // Recursively handle arrays
      else if (Array.isArray(val)) {
        (result as any)[key] = val.map((item: any) =>
          typeof item === 'object' && item !== null && (item as any).constructor !== Date
            ? serializeDecimals(item)
            : item
        );
      }
    }
    return result;
  }

  return obj;
}
