/** Where another member's photo is read, by the key their cards carry
 * (R-PROF-7, ADR 0067). */
export const sharedPhotoPath = (key: string): string =>
  `/api/photos/${encodeURIComponent(key)}`
