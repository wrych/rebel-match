/** The sectors a member picks from, stored by key and shown by label
 * (R-ONB-2, design §2). Shared with the client, so the form and the server
 * check offer the same list (R-CFG-2); seeds copy it into `sectors`. */
export const sectors = [
  { key: 'agency-consulting', label: 'Agency & consulting' },
  { key: 'construction', label: 'Construction' },
  { key: 'education', label: 'Education' },
  { key: 'energy-utilities', label: 'Energy & utilities' },
  { key: 'financial-services', label: 'Financial services' },
  { key: 'food-agriculture', label: 'Food & agriculture' },
  { key: 'government', label: 'Government & public sector' },
  { key: 'healthcare', label: 'Healthcare' },
  { key: 'hospitality', label: 'Hospitality' },
  { key: 'industrial-services', label: 'Industrial services' },
  { key: 'logistics', label: 'Logistics' },
  { key: 'manufacturing', label: 'Manufacturing' },
  { key: 'media-creative', label: 'Media & creative' },
  { key: 'nonprofit', label: 'Nonprofit' },
  { key: 'retail', label: 'Retail' },
  { key: 'software-technology', label: 'Software & technology' },
  { key: 'telecom', label: 'Telecom' },
  { key: 'other', label: 'Other' },
] as const

export type Sector = (typeof sectors)[number]['key']

export const sectorKeys = sectors.map((sector) => sector.key) as [
  Sector,
  ...Sector[],
]

/** The company size bands a member picks from, stored by key and shown by
 * label (R-ONB-2, design §2); seeds copy it into `company_sizes`. */
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

/** A stored value as a form's pick: blank when it is not on the list, so the
 * form never sends back a value it cannot show. */
export function pickedOrBlank(
  value: string | null,
  choices: readonly string[],
): string {
  return value !== null && choices.includes(value) ? value : ''
}
