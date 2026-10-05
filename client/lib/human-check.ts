/** The challenge the server signs; the client passes it to the widget as is. */
export type Challenge = Record<string, unknown>

// The widget's build for a strict Content-Security-Policy: its styles come as
// a stylesheet and its worker as a script file from this origin, where the
// default build injects a <style> and starts workers from blob: URLs, both of
// which the policy refuses (ADR 0034).
async function loadWidget(): Promise<void> {
  const [{ default: Pbkdf2Worker }] = await Promise.all([
    import('altcha/workers/pbkdf2?worker'),
    import('altcha/external'),
    import('altcha/altcha.css'),
  ])
  for (const hash of ['SHA-256', 'SHA-384', 'SHA-512'])
    globalThis.$altcha.algorithms.set(
      `PBKDF2/${hash}`,
      () => new Pbkdf2Worker(),
    )
}

/** Solves a human check in a widget placed in `host`: the payload to send
 * back, or null when it could not be solved (R-NFR-8, ADR 0029). */
export async function solveHumanCheck(
  host: HTMLElement,
  challenge: Challenge,
): Promise<string | null> {
  // Loaded only when a check is asked for, so nobody else downloads it.
  await loadWidget()
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
