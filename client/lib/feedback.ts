/** A pre-filled feedback mail naming the screen it came from (R-FB-1). The
 * screen is given by route name, never its address, so no id reaches the
 * mail. */
export function feedbackMailto(to: string, screen: string): string {
  const subject = 'Rebel Match — feedback'
  const body = `What happened:\n\nWhat I expected:\n\nScreen: ${screen}\n`
  return `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}
