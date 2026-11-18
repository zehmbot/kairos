import { FpsSchema } from "../shared/types.ts";

/** The frame rates offered as one-click choices. Any other rate goes in "Other". */
export const FRAME_RATES = [
  { fps: 24, label: "Film look" },
  { fps: 30, label: "Standard" },
  { fps: 60, label: "Smooth" },
] as const;

export function isPresetRate(fps: number): boolean {
  return FRAME_RATES.some((rate) => rate.fps === fps);
}

/** Reads a frame rate typed by the user. */
export function parseFrameRate(
  text: string,
): { ok: true; fps: number } | { ok: false; error: string } {
  const trimmed = text.trim().replace(",", ".");
  if (trimmed === "") return { ok: false, error: "Type a frame rate." };
  const parsed = FpsSchema.safeParse(Number(trimmed));
  return parsed.success
    ? { ok: true, fps: parsed.data }
    : { ok: false, error: parsed.error.issues[0]?.message ?? "This frame rate can't be used." };
}
