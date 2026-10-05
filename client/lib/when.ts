const format = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
})

/** An instant as a host reads it, in their own time zone: "8 Nov, 09:00".
 * The `<time datetime>` beside it keeps the exact value. */
export function when(iso: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? iso : format.format(date)
}

const dayFormat = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

/** The day of an instant, in the reader's own time zone: "4 November 2026". */
export function day(iso: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? iso : dayFormat.format(date)
}
