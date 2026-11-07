const MARKER = 0xff
const SOI = 0xd8
const EOI = 0xd9
const SOS = 0xda
const COM = 0xfe
const APP0 = 0xe0
const APP15 = 0xef
// Baseline and progressive Huffman frames: what a browser's canvas writes.
const FRAMES = new Set([0xc0, 0xc1, 0xc2])

/** What became of an uploaded photo: the JPEG without its metadata, or
 * refused (R-PROF-6). */
export type PhotoOutcome =
  { result: 'clean'; jpeg: Buffer } | { result: 'refused' }

/** The size a photo must keep to: its bytes and the widest square side. */
export interface PhotoLimits {
  photoMaxBytes: number
  photoSidePx: number
}

interface Segment {
  marker: number
  start: number
  end: number
}

function segmentAt(jpeg: Buffer, start: number): Segment | null {
  if (start + 4 > jpeg.length || jpeg[start] !== MARKER) return null
  const marker = jpeg[start + 1] ?? 0
  const end = start + 2 + jpeg.readUInt16BE(start + 2)
  return end <= jpeg.length ? { marker, start, end } : null
}

function squareSide(jpeg: Buffer, frame: Segment): number | null {
  if (frame.end - frame.start < 9) return null
  const height = jpeg.readUInt16BE(frame.start + 5)
  const width = jpeg.readUInt16BE(frame.start + 7)
  return width === height && width > 0 ? width : null
}

const isMetadata = (marker: number): boolean =>
  marker === COM || (marker > APP0 && marker <= APP15)

const RST0 = 0xd0
const RST7 = 0xd7

// Scan data ends at the first marker that is neither a stuffed 0xFF00 nor a
// restart marker.
function scanEnd(jpeg: Buffer, from: number): number {
  for (let at = from; at + 1 < jpeg.length; at++) {
    if (jpeg[at] !== MARKER) continue
    const next = jpeg[at + 1] ?? 0
    if (next !== 0 && (next < RST0 || next > RST7)) return at
    at++
  }
  return jpeg.length
}

function pieceAt(jpeg: Buffer, at: number): Segment | null {
  const segment = segmentAt(jpeg, at)
  if (segment?.marker !== SOS) return segment
  return { ...segment, end: scanEnd(jpeg, segment.end) }
}

// Every segment between SOI and an EOI that ends the file, each scan with
// its data; null for anything cut short or carrying bytes after the end.
function allSegments(jpeg: Buffer): Segment[] | null {
  const segments: Segment[] = []
  let at = 2
  while (at + 1 < jpeg.length) {
    if (jpeg[at] === MARKER && jpeg[at + 1] === MARKER) {
      at++
      continue
    }
    if (jpeg[at] === MARKER && jpeg[at + 1] === EOI)
      return at + 2 === jpeg.length ? segments : null
    const piece = pieceAt(jpeg, at)
    if (piece === null) return null
    segments.push(piece)
    at = piece.end
  }
  return null
}

function isJpegWithin(jpeg: Buffer, maxBytes: number): boolean {
  return (
    jpeg.length >= 4 &&
    jpeg.length <= maxBytes &&
    jpeg[0] === MARKER &&
    jpeg[1] === SOI
  )
}

function fitsSquare(
  jpeg: Buffer,
  segments: Segment[],
  maxSide: number,
): boolean {
  const frame = segments.find((s) => FRAMES.has(s.marker))
  const side = frame === undefined ? null : squareSide(jpeg, frame)
  const scanned = segments.some((s) => s.marker === SOS)
  return scanned && side !== null && side <= maxSide
}

function withoutMetadata(jpeg: Buffer, segments: Segment[]): Buffer {
  const kept = segments
    .filter((s) => !isMetadata(s.marker))
    .map((s) => jpeg.subarray(s.start, s.end))
  return Buffer.concat([
    jpeg.subarray(0, 2),
    ...kept,
    jpeg.subarray(jpeg.length - 2),
  ])
}

/** Keeps an uploaded photo only if it is a whole JPEG, square, no wider than
 * `photoSidePx` and no larger than `photoMaxBytes`, and drops every APP1–15
 * and comment segment anywhere in it, where EXIF, GPS and XMP live
 * (ADR 0066). */
export function cleanPhoto(jpeg: Buffer, limits: PhotoLimits): PhotoOutcome {
  if (!isJpegWithin(jpeg, limits.photoMaxBytes)) return { result: 'refused' }
  const segments = allSegments(jpeg)
  if (segments === null || !fitsSquare(jpeg, segments, limits.photoSidePx))
    return { result: 'refused' }
  return { result: 'clean', jpeg: withoutMetadata(jpeg, segments) }
}

/** A member's photo as the store keeps it. */
export interface StoredPhoto {
  jpeg: Buffer
  updatedAt: Date
}

/** Where profile photos are kept (`member_photos`, design §2). */
export interface PhotoStore {
  get(memberId: string): Promise<StoredPhoto | null>
  set(memberId: string, jpeg: Buffer): Promise<void>
  remove(memberId: string): Promise<void>
}

/** The member's own photo: read, replaced once cleaned, or removed
 * (R-PROF-6). */
export interface PhotoService {
  own(memberId: string): Promise<StoredPhoto | null>
  replace(memberId: string, upload: Buffer): Promise<'saved' | 'refused'>
  remove(memberId: string): Promise<void>
}

/** The photo service over a store, judged against the limits in force. */
export function createPhotoService(deps: {
  store: PhotoStore
  limits: () => PhotoLimits
}): PhotoService {
  return {
    own: (memberId) => deps.store.get(memberId),
    replace: async (memberId, upload) => {
      const outcome = cleanPhoto(upload, deps.limits())
      if (outcome.result === 'refused') return 'refused'
      await deps.store.set(memberId, outcome.jpeg)
      return 'saved'
    },
    remove: (memberId) => deps.store.remove(memberId),
  }
}
