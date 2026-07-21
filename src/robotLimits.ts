import type { RobotOrientation } from "./types";

/** Playback and timeline “set speed” steps: matches firmware SPEED 5–100%. */
export const SPEED_UI_MIN = 5;
export const SPEED_UI_MAX = 100;
export const SPEED_UI_DEFAULT = 25;

export const ROBOT_LIMITS = {
  roll: { min: -25, max: 25 },
  pitch: { min: -25, max: 25 },
  yaw: { min: -90, max: 90 },
} as const;

/** Safety cone: √(roll² + pitch²) ≤ SAFETY_CONE_DEG when both axes are active */
export const SAFETY_CONE_DEG = 25;

/** Below this (deg), the other RP axis is treated as zero — single-axis slider/gizmo moves skip the cone */
const AXIS_COUPLE_EPS = 0.5;

export function clampOrientation(o: RobotOrientation): RobotOrientation {
  let roll = Math.min(
    ROBOT_LIMITS.roll.max,
    Math.max(ROBOT_LIMITS.roll.min, o.roll),
  );
  let pitch = Math.min(
    ROBOT_LIMITS.pitch.max,
    Math.max(ROBOT_LIMITS.pitch.min, o.pitch),
  );
  const yaw = Math.min(
    ROBOT_LIMITS.yaw.max,
    Math.max(ROBOT_LIMITS.yaw.min, o.yaw),
  );

  const rollActive = Math.abs(roll) > AXIS_COUPLE_EPS;
  const pitchActive = Math.abs(pitch) > AXIS_COUPLE_EPS;
  if (rollActive && pitchActive) {
    const mag = Math.sqrt(roll * roll + pitch * pitch);
    if (mag > SAFETY_CONE_DEG) {
      const scale = SAFETY_CONE_DEG / mag;
      roll *= scale;
      pitch *= scale;
    }
  }

  roll = Math.min(ROBOT_LIMITS.roll.max, Math.max(ROBOT_LIMITS.roll.min, roll));
  pitch = Math.min(
    ROBOT_LIMITS.pitch.max,
    Math.max(ROBOT_LIMITS.pitch.min, pitch),
  );

  return { roll, pitch, yaw };
}
