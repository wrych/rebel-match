/** The challenge the server signs; the client passes it to the widget as is. */
export type Challenge = Record<string, unknown>

/** Solves a human check in a widget placed in `host`, returning the payload to
 * send back, or null when it could not be solved (R-NFR-8, ADR 0029). The
 * widget loads only when a check is asked for, so nobody else downloads it.
 * Its interaction signature is off: the check is proof of work alone, and
 * nothing about how the visitor moves is collected. */
export async function solveHumanCheck(
  host: HTMLElement,
  challenge: Challenge,
): Promise<string | null> {
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
    humanInteractionSignature: false,
  })
  try {
    return (await widget.verify())?.payload ?? null
  } catch {
    return null
  }
}
