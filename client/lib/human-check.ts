/** The challenge the server signs; the client passes it to the widget as is. */
export type Challenge = Record<string, unknown>

/** Solves a human check in a widget placed in `host`: the payload to send
 * back, or null when it could not be solved (R-NFR-8, ADR 0029). */
export async function solveHumanCheck(
  host: HTMLElement,
  challenge: Challenge,
): Promise<string | null> {
  // Loaded only when a check is asked for, so nobody else downloads it.
  await import('altcha')
  const widget = document.createElement('altcha-widget')
  // Its methods exist only once it has loaded in the page.
  const loaded = new Promise((resolve) => {
    widget.addEventListener('load', resolve, { once: true })
  })
  host.replaceChildren(widget)
  await loaded
  await widget.configure({
    challenge: challenge as never,
    auto: 'off',
    hideFooter: true,
    // Proof of work alone: nothing about how the visitor moves is collected.
    humanInteractionSignature: false,
  })
  try {
    return (await widget.verify())?.payload ?? null
  } catch {
    return null
  }
}
