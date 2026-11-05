import { describe, expect, it } from "vitest";
import { clampCropOffset, cropGeometry } from "@/lib/image-crop";

const frame = { frameWidth: 400, frameHeight: 252 }; // 1.586:1 card frame

describe("crop geometry", () => {
  it("covers the frame at zoom 1 for a landscape photo", () => {
    const g = cropGeometry({ ...frame, imageWidth: 4000, imageHeight: 3000, zoom: 1, rotation: 0 });
    expect(g.scale).toBeCloseTo(0.1, 5); // 400 / 4000 is the binding edge
    expect(g.maxY).toBeGreaterThan(0); // 300 px tall → spilling vertically
    expect(g.maxX).toBeCloseTo(0, 5); // exactly flush horizontally
  });

  it("covers the frame for a portrait photo", () => {
    const g = cropGeometry({ ...frame, imageWidth: 3000, imageHeight: 4000, zoom: 1, rotation: 0 });
    expect(g.scale).toBeCloseTo(400 / 3000, 5); // width is the binding edge
    expect(g.maxX).toBeCloseTo(0, 5);
    expect(g.maxY).toBeGreaterThan(0);
  });

  it("still covers the frame after a quarter turn", () => {
    const upright = cropGeometry({ ...frame, imageWidth: 4000, imageHeight: 3000, zoom: 1, rotation: 0 });
    const turned = cropGeometry({ ...frame, imageWidth: 4000, imageHeight: 3000, zoom: 1, rotation: 90 });

    // Rotating makes the photo taller than the frame, so it must zoom in enough
    // to keep both edges covered — never leaving a blank strip.
    expect(turned.maxX).toBeCloseTo(0, 5);
    expect(turned.maxY).toBeGreaterThan(upright.maxY);
    expect(turned.scale).toBeGreaterThanOrEqual(upright.scale);
  });

  it("accepts a full 360-degree rotation as upright", () => {
    const upright = cropGeometry({ ...frame, imageWidth: 4000, imageHeight: 3000, zoom: 1, rotation: 0 });
    const spun = cropGeometry({ ...frame, imageWidth: 4000, imageHeight: 3000, zoom: 1, rotation: 360 });
    expect(spun.scale).toBeCloseTo(upright.scale, 5);
    expect(spun.maxY).toBeCloseTo(upright.maxY, 5);
  });

  it("grows the pan range as the member zooms in", () => {
    const near = cropGeometry({ ...frame, imageWidth: 4000, imageHeight: 3000, zoom: 1, rotation: 0 });
    const far = cropGeometry({ ...frame, imageWidth: 4000, imageHeight: 3000, zoom: 2, rotation: 0 });
    expect(far.maxY).toBeGreaterThan(near.maxY);
    expect(far.scale).toBeCloseTo(near.scale * 2, 5);
  });

  it("never reports negative pan limits", () => {
    const g = cropGeometry({ ...frame, imageWidth: 400, imageHeight: 252, zoom: 1, rotation: 0 });
    expect(g.maxX).toBe(0);
    expect(g.maxY).toBe(0);
  });

  it("treats a missing image as a neutral geometry", () => {
    expect(cropGeometry({ ...frame, imageWidth: 0, imageHeight: 0, zoom: 1, rotation: 0 })).toEqual({
      scale: 1,
      baseScale: 1,
      maxX: 0,
      maxY: 0,
    });
  });
});

describe("offset clamping", () => {
  const geometry = { scale: 0.1, baseScale: 0.1, maxX: 0, maxY: 24 };

  it("stops the photo leaving a blank edge", () => {
    expect(clampCropOffset({ x: 500, y: 500 }, geometry)).toEqual({ x: 0, y: 24 });
    expect(clampCropOffset({ x: -500, y: -500 }, geometry)).toEqual({ x: 0, y: -24 });
  });

  it("leaves a legal offset untouched", () => {
    expect(clampCropOffset({ x: 0, y: 10 }, geometry)).toEqual({ x: 0, y: 10 });
  });
});
