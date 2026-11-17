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

/** The Corporate Rebels cells a member may belong to, stored by key and
 * shown by flag and label (R-PROF-9, design §2); seeds copy key and label
 * into `rebel_cells`. */
export const rebelCells = [
  { key: 'belgium', flag: '🇧🇪', label: 'Belgium' },
  { key: 'berlin', flag: '🐻', label: 'Berlin' },
  { key: 'france', flag: '🇫🇷', label: 'France' },
  { key: 'germany', flag: '🇩🇪', label: 'Germany' },
  {
    key: 'global',
    flag: '🌐',
    label: 'Global',
    note: 'no country cell',
  },
  { key: 'italy', flag: '🇮🇹', label: 'Italy' },
  { key: 'japan', flag: '🇯🇵', label: 'Japan' },
  { key: 'latin-america', flag: '🌎', label: 'Latin America' },
  { key: 'lithuania', flag: '🇱🇹', label: 'Lithuania' },
  { key: 'netherlands', flag: '🇳🇱', label: 'Netherlands' },
  { key: 'north-america', flag: '🇺🇸🇨🇦', label: 'North America' },
  { key: 'poland', flag: '🇵🇱', label: 'Poland' },
  { key: 'spain', flag: '🇪🇸', label: 'Spain' },
  { key: 'sweden', flag: '🇸🇪', label: 'Sweden' },
  { key: 'switzerland', flag: '🇨🇭', label: 'Switzerland' },
] as const

export type RebelCell = (typeof rebelCells)[number]['key']

export const rebelCellKeys = rebelCells.map((cell) => cell.key) as [
  RebelCell,
  ...RebelCell[],
]

/** A cell as the drop-down offers it: its flag, label and any note. */
export function cellChoice(cell: (typeof rebelCells)[number]): string {
  const note = 'note' in cell ? ` (${cell.note})` : ''
  return `${cell.flag} ${cell.label}${note}`
}

/** The cell a stored key names, or null for none or one off the list. */
export function cellOf(key: string | null): (typeof rebelCells)[number] | null {
  return rebelCells.find((cell) => cell.key === key) ?? null
}

/** How a cell is named to assistive technology, or blank without one. */
export function cellLabel(key: string | null): string {
  const cell = cellOf(key)
  return cell === null ? '' : `Rebel cell: ${cell.label}`
}

/** A stored value as a form's pick: blank when it is not on the list, so the
 * form never sends back a value it cannot show. */
export function pickedOrBlank(
  value: string | null,
  choices: readonly string[],
): string {
  return value !== null && choices.includes(value) ? value : ''
}
