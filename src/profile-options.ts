/** The sectors a member picks from (R-ONB-2, design §2). Shared with the
 * client, so the form and the server check offer the same list (R-CFG-2). */
export const sectors = [
  'Agency & consulting',
  'Construction',
  'Education',
  'Energy & utilities',
  'Financial services',
  'Food & agriculture',
  'Government & public sector',
  'Healthcare',
  'Hospitality',
  'Industrial services',
  'Logistics',
  'Manufacturing',
  'Media & creative',
  'Nonprofit',
  'Retail',
  'Software & technology',
  'Telecom',
  'Other',
] as const

export type Sector = (typeof sectors)[number]

/** The company size bands a member picks from, stored by key and shown by
 * label (R-ONB-2, design §2). */
export const companySizes = [
  { key: '1-10', label: '1–10 employees' },
  { key: '11-50', label: '11–50 employees' },
  { key: '51-250', label: '51–250 employees' },
  { key: '251-1000', label: '251–1,000 employees' },
  { key: '1001+', label: '1,001+ employees' },
] as const

export type CompanySize = (typeof companySizes)[number]['key']

export const companySizeKeys = companySizes.map((size) => size.key) as [
  CompanySize,
  ...CompanySize[],
]

/** How a stored size reads on a card, or null for none or an unknown key. */
export function companySizeLabel(key: string | null): string | null {
  return companySizes.find((size) => size.key === key)?.label ?? null
}

/** A stored value as a form's pick: blank when it is not on the list, so the
 * form never sends back a value it cannot show. */
export function pickedOrBlank(
  value: string | null,
  choices: readonly string[],
): string {
  return value !== null && choices.includes(value) ? value : ''
}
