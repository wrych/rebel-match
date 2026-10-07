export interface ScrollSpot {
  left: number
  top: number
}

/** Where a screen opens: where the member left it on back or forward, at its
 * top when it is a new screen, and unmoved when only its query changed. */
export function scrollFor(
  toPath: string,
  fromPath: string,
  saved: ScrollSpot | null,
): ScrollSpot | false {
  if (saved !== null) return saved
  return toPath === fromPath ? false : { left: 0, top: 0 }
}
