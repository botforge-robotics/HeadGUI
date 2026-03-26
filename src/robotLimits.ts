import type { RobotOrientation } from "./types";

export const ROBOT_LIMITS = {
  roll: { min: -30, max: 30 },
  pitch: { min: -30, max: 25 },
  yaw: { min: -90, max: 90 },
} as const;

/** Safety cone: √(roll² + pitch²) ≤ SAFETY_CONE_DEG */
export const SAFETY_CONE_DEG = 30;

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

  const mag = Math.sqrt(roll * roll + pitch * pitch);
  if (mag > SAFETY_CONE_DEG) {
    const scale = SAFETY_CONE_DEG / mag;
    roll *= scale;
    pitch *= scale;
  }

  roll = Math.min(ROBOT_LIMITS.roll.max, Math.max(ROBOT_LIMITS.roll.min, roll));
  pitch = Math.min(
    ROBOT_LIMITS.pitch.max,
    Math.max(ROBOT_LIMITS.pitch.min, pitch),
  );

  return { roll, pitch, yaw };
}
