import { z } from 'zod'

/** A display name: trimmed, never blank (R-ONB-2, R-PROF-1). */
export function displayName(max: number): z.ZodType<string> {
  return z.string().trim().min(1).max(max)
}

/** An optional profile text; a blank one is a field left out. */
export function optionalText(max: number): z.ZodType<string | undefined> {
  return z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => (value === '' ? undefined : value))
}
