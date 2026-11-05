/**
 * Crop geometry for the KYC photo cropper.
 *
 * Kept free of DOM and React so the maths can be unit-tested: a member must
 * never be able to drag, zoom or rotate a photo so far that a blank corner
 * sneaks into the exported crop.
 */

export interface CropGeometryInput {
  frameWidth: number;
  frameHeight: number;
  imageWidth: number;
  imageHeight: number;
  /** 1 = tightened to cover the frame, up to 4 = maximum zoom. */
  zoom: number;
  /** Degrees; the UI only ever passes multiples of 90. */
  rotation: number;
}

export interface CropGeometry {
  /** Scale applied to the image, in frame pixels. */
  scale: number;
  /** Scale that makes the image exactly cover the frame at zoom = 1. */
  baseScale: number;
  /** Maximum horizontal pan before an empty edge would show. */
  maxX: number;
  /** Maximum vertical pan before an empty edge would show. */
  maxY: number;
}

export interface CropOffset {
  x: number;
  y: number;
}

export const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export function cropGeometry({
  frameWidth,
  frameHeight,
  imageWidth,
  imageHeight,
  zoom,
  rotation,
}: CropGeometryInput): CropGeometry {
  if (!frameWidth || !frameHeight || !imageWidth || !imageHeight) {
    return { scale: 1, baseScale: 1, maxX: 0, maxY: 0 };
  }

  // A quarter turn swaps which side of the photo is horizontal. The cover
  // scale is derived from the *rotated* box, otherwise rotating a landscape
  // photo inside a landscape frame would expose blank edges at the sides.
  const quarterTurned = (((rotation % 360) + 360) % 360) % 180 !== 0;
  const naturalWidth = quarterTurned ? imageHeight : imageWidth;
  const naturalHeight = quarterTurned ? imageWidth : imageHeight;

  const baseScale = Math.max(frameWidth / naturalWidth, frameHeight / naturalHeight);
  const scale = baseScale * Math.max(1, zoom);
  const boxWidth = naturalWidth * scale;
  const boxHeight = naturalHeight * scale;

  return {
    scale,
    baseScale,
    maxX: Math.max(0, (boxWidth - frameWidth) / 2),
    maxY: Math.max(0, (boxHeight - frameHeight) / 2),
  };
}

/** Keeps the photo covering the frame after a drag, zoom or rotate. */
export function clampCropOffset(offset: CropOffset, geometry: CropGeometry): CropOffset {
  const x = clamp(offset.x, -geometry.maxX, geometry.maxX);
  const y = clamp(offset.y, -geometry.maxY, geometry.maxY);

  // Normalise negative zero so equality checks and CSS output stay boring.
  return { x: x === 0 ? 0 : x, y: y === 0 ? 0 : y };
}
