import {
  SPEED_UI_MAX,
  SPEED_UI_MIN,
} from "./robotLimits";

/**
 * Slider shows the same % sent to firmware (SPEED 5–100).
 */
export const SPEED_UI_DISPLAY_FACTOR = 1;

export const SPEED_UI_DISPLAY_MIN = SPEED_UI_MIN * SPEED_UI_DISPLAY_FACTOR;
export const SPEED_UI_DISPLAY_MAX = SPEED_UI_MAX * SPEED_UI_DISPLAY_FACTOR;
export const SPEED_UI_DISPLAY_STEP = 5 * SPEED_UI_DISPLAY_FACTOR; // matches internal step=5

export function speedInternalToDisplay(speedPercent: number): number {
  return speedPercent * SPEED_UI_DISPLAY_FACTOR;
}

export function speedDisplayToInternal(speedPercentDisplay: number): number {
  return Math.round(speedPercentDisplay / SPEED_UI_DISPLAY_FACTOR);
}

export function clampSpeedDisplayToInternal(
  speedPercentDisplay: number,
): number {
  const internal = speedDisplayToInternal(speedPercentDisplay);
  return Math.max(SPEED_UI_MIN, Math.min(SPEED_UI_MAX, internal));
}

