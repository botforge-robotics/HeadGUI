import { useRef, useState, useCallback, useEffect, useMemo } from "react";
import { useThree } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { ROBOT_LIMITS } from "../robotLimits";
import { useRobotStore } from "../store/robotStore";
import type { RobotOrientation } from "../types";
import type { ThreeEvent } from "@react-three/fiber";

const RADIUS = 0.92;
const PITCH_RADIUS = 1.08;
const TUBE_RADIUS = 0.028;
const HIT_TUBE_RADIUS = 0.11;
const HIT_THUMB_RADIUS = 0.16;

// Match joint_yaw origin from URDF + 4 cm up in scene (group position y = -GIZMO_CENTER.y)
const GIZMO_CENTER = { x: 0.021, y: 0.604, z: 0.055 };

function getRadius(ring: RingAxis): number {
  return ring === "pitch" ? PITCH_RADIUS : RADIUS;
}
const ARC_SEGMENTS = 48;
const THUMB_RADIUS = 0.06;
const { roll: ROLL_LIM, pitch: PITCH_LIM, yaw: YAW_LIM } = ROBOT_LIMITS;

function clampRoll(v: number) {
  return Math.min(ROLL_LIM.max, Math.max(ROLL_LIM.min, v));
}
function clampPitch(v: number) {
  return Math.min(PITCH_LIM.max, Math.max(PITCH_LIM.min, v));
}
function clampYaw(v: number) {
  return Math.min(YAW_LIM.max, Math.max(YAW_LIM.min, v));
}

/** Clamp angle to the visible arc range for each ring so drag/click never flips to opposite side. */
function clampAngleToArc(ring: RingAxis, angleDeg: number): number {
  if (ring === "yaw")
    return Math.min(YAW_LIM.max, Math.max(YAW_LIM.min, angleDeg));
  if (ring === "pitch")
    return Math.min(PITCH_LIM.max, Math.max(PITCH_LIM.min, angleDeg));
  return Math.min(ROLL_LIM.max, Math.max(ROLL_LIM.min, angleDeg));
}

type RingAxis = "yaw" | "pitch" | "roll";

function getAngleOnRing(ring: RingAxis, point: THREE.Vector3): number {
  const y = point.y + GIZMO_CENTER.y;
  switch (ring) {
    case "yaw":
      return Math.atan2(-point.z, point.x) * (180 / Math.PI);
    case "pitch":
      return Math.atan2(y, point.x) * (180 / Math.PI);
    case "roll":
      return Math.atan2(point.z, y) * (180 / Math.PI);
    default:
      return 0;
  }
}

function getOrientationFromRingAngle(
  ring: RingAxis,
  angle: number,
  current: RobotOrientation,
): RobotOrientation {
  switch (ring) {
    case "yaw":
      return { ...current, yaw: clampYaw(-angle) };
    case "pitch":
      return { ...current, pitch: clampPitch(-angle) };
    case "roll":
      return { ...current, roll: clampRoll(-angle) };
    default:
      return current;
  }
}

function angleToPos(
  ring: RingAxis,
  angleDeg: number,
): [number, number, number] {
  const r = getRadius(ring);
  const rad = (angleDeg * Math.PI) / 180;
  switch (ring) {
    case "yaw":
      return [r * Math.sin(rad), 0, r * Math.cos(rad)];
    case "pitch":
      return [r * Math.cos(rad), r * Math.sin(rad), 0];
    case "roll":
      return [0, r * Math.cos(rad), r * Math.sin(rad)];
    default:
      return [0, 0, 0];
  }
}

class ArcCurve extends THREE.Curve<THREE.Vector3> {
  ring: RingAxis;
  start: number;
  end: number;
  constructor(ring: RingAxis) {
    super();
    this.ring = ring;
    const degToRad = Math.PI / 180;
    if (ring === "yaw") {
      this.start = YAW_LIM.min * degToRad;
      this.end = YAW_LIM.max * degToRad;
    } else if (ring === "pitch") {
      this.start = PITCH_LIM.min * degToRad;
      this.end = PITCH_LIM.max * degToRad;
    } else {
      this.start = ROLL_LIM.min * degToRad;
      this.end = ROLL_LIM.max * degToRad;
    }
  }
  getPoint(t: number) {
    const angle = this.start + (this.end - this.start) * t;
    const r = getRadius(this.ring);
    let x = 0,
      y = 0,
      z = 0;
    switch (this.ring) {
      case "yaw":
        x = r * Math.sin(angle);
        z = r * Math.cos(angle);
        break;
      case "pitch":
        x = r * Math.cos(angle);
        y = r * Math.sin(angle);
        break;
      case "roll":
        y = r * Math.cos(angle);
        z = r * Math.sin(angle);
        break;
    }
    return new THREE.Vector3(x, y, z);
  }
}

export default function SpatialRPYGizmo() {
  const { camera, gl } = useThree();
  const { targetOrientation, setTargetOrientation, setGizmoDragging } =
    useRobotStore();
  const { roll, pitch, yaw } = targetOrientation;
  const [drag, setDrag] = useState<{
    ring: RingAxis;
    startAngle: number;
    startOrientation: RobotOrientation;
    pointerId: number;
  } | null>(null);

  const raycaster = useRef(new THREE.Raycaster());
  const mouse = useRef(new THREE.Vector2());
  const planeYaw = useRef(
    new THREE.Plane(new THREE.Vector3(0, 1, 0), GIZMO_CENTER.y),
  );
  const planePitch = useRef(
    new THREE.Plane(new THREE.Vector3(1, 0, 0), -GIZMO_CENTER.x),
  );
  const planeRoll = useRef(
    new THREE.Plane(new THREE.Vector3(0, 0, 1), -GIZMO_CENTER.z),
  );
  const planeForRing = (ring: RingAxis) =>
    ring === "yaw"
      ? planeYaw.current
      : ring === "pitch"
        ? planeRoll.current
        : planePitch.current;
  const intersect = useRef(new THREE.Vector3());

  const getMouseNDC = useCallback(
    (clientX: number, clientY: number) => {
      const canvas = gl.domElement;
      const rect = canvas.getBoundingClientRect();
      mouse.current.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      mouse.current.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    },
    [gl],
  );

  const getAngleOnPlane = useCallback(
    (ring: RingAxis): number | null => {
      raycaster.current.setFromCamera(mouse.current, camera);
      const plane = planeForRing(ring);
      if (raycaster.current.ray.intersectPlane(plane, intersect.current)) {
        return getAngleOnRing(ring, intersect.current);
      }
      return null;
    },
    [camera],
  );

  const handlePointerDown = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      const ring = (e.object as THREE.Mesh).userData?.ring as
        | RingAxis
        | undefined;
      if (!ring) return;
      gl.domElement.setPointerCapture(e.pointerId);
      setGizmoDragging(true);
      const rawAngle = getAngleOnRing(ring, e.point);
      const startAngle = clampAngleToArc(ring, rawAngle);
      setDrag({
        ring,
        startAngle,
        startOrientation: { roll, pitch, yaw },
        pointerId: e.pointerId,
      });
    },
    [gl, roll, pitch, yaw, setGizmoDragging],
  );

  const handlePointerMove = useCallback(
    (e: ThreeEvent<PointerEvent> | PointerEvent) => {
      if (!drag) return;
      getMouseNDC(e.clientX, e.clientY);
      const rawAngle = getAngleOnPlane(drag.ring);
      if (rawAngle === null) return;
      const currentAngle = clampAngleToArc(drag.ring, rawAngle);
      // Use cursor angle directly so value never flips (no delta-from-start)
      const next = getOrientationFromRingAngle(
        drag.ring,
        currentAngle,
        drag.startOrientation,
      );
      setTargetOrientation(next);
    },
    [drag, getMouseNDC, getAngleOnPlane, setTargetOrientation],
  );

  const handlePointerUp = useCallback(
    (e: ThreeEvent<PointerEvent> | PointerEvent) => {
      gl.domElement.releasePointerCapture(e.pointerId);
      setGizmoDragging(false);
      setDrag(null);
    },
    [gl, setGizmoDragging],
  );

  useEffect(() => {
    if (!drag) return;
    const el = gl.domElement;
    el.addEventListener("pointermove", handlePointerMove);
    el.addEventListener("pointerup", handlePointerUp);
    return () => {
      el.removeEventListener("pointermove", handlePointerMove);
      el.removeEventListener("pointerup", handlePointerUp);
      setGizmoDragging(false);
      try {
        el.releasePointerCapture(drag.pointerId);
      } catch (_) {}
    };
  }, [drag, gl, handlePointerMove, handlePointerUp, setGizmoDragging]);

  const ringColor = (axis: RingAxis) =>
    axis === "yaw" ? "#e11d48" : axis === "pitch" ? "#22c55e" : "#3b82f6";
  const ringOpacity = 0.6;

  const yawCurve = useMemo(() => new ArcCurve("yaw"), []);
  const pitchCurve = useMemo(() => new ArcCurve("pitch"), []);
  const rollCurve = useMemo(() => new ArcCurve("roll"), []);

  const axes: {
    ring: RingAxis;
    curve: THREE.Curve<THREE.Vector3>;
    rotation: [number, number, number];
  }[] = [
    { ring: "yaw", curve: yawCurve, rotation: [0, Math.PI / 2, 0] },
    { ring: "pitch", curve: pitchCurve, rotation: [0, 0, 0] },
    { ring: "roll", curve: rollCurve, rotation: [0, 0, 0] },
  ];

  return (
    <group position={[GIZMO_CENTER.x, -GIZMO_CENTER.y, GIZMO_CENTER.z]}>
      {axes.map(({ ring, curve, rotation }) => {
        const value = ring === "yaw" ? yaw : ring === "pitch" ? pitch : roll;
        const thumbAngle = -value;
        const [tx, ty, tz] = angleToPos(ring, thumbAngle);
        return (
          <group key={ring} rotation={rotation as [number, number, number]}>
            {/* Partial arc */}
            <mesh
              userData={{ ring }}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
            >
              <tubeGeometry
                args={[curve, ARC_SEGMENTS, TUBE_RADIUS, 8, false]}
              />
              <meshBasicMaterial
                color={ringColor(ring)}
                transparent
                opacity={ringOpacity}
                depthWrite={false}
                side={THREE.DoubleSide}
              />
            </mesh>
            {/* Invisible hit area so orbit controls don't steal drag */}
            <mesh
              userData={{ ring }}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
            >
              <tubeGeometry
                args={[curve, ARC_SEGMENTS, HIT_TUBE_RADIUS, 8, false]}
              />
              <meshBasicMaterial transparent opacity={0} depthWrite={false} />
            </mesh>
            {/* Line from center to thumb */}
            <line>
              <bufferGeometry>
                <bufferAttribute
                  attach="attributes-position"
                  args={[new Float32Array([0, 0, 0, tx, ty, tz]), 3]}
                />
              </bufferGeometry>
              <lineBasicMaterial
                color={ringColor(ring)}
                transparent
                opacity={0.7}
                depthWrite={false}
              />
            </line>
            {/* Thumb */}
            <mesh
              position={[tx, ty, tz]}
              userData={{ ring }}
              onPointerDown={handlePointerDown}
            >
              <sphereGeometry args={[THUMB_RADIUS, 16, 12]} />
              <meshBasicMaterial
                color={ringColor(ring)}
                transparent
                opacity={0.95}
                depthWrite={false}
              />
            </mesh>
            <mesh
              position={[tx, ty, tz]}
              userData={{ ring }}
              onPointerDown={handlePointerDown}
            >
              <sphereGeometry args={[HIT_THUMB_RADIUS, 16, 12]} />
              <meshBasicMaterial transparent opacity={0} depthWrite={false} />
            </mesh>
            {/* Value label */}
            <Html
              position={[tx * 1.15, ty * 1.15, tz * 1.15]}
              center
              style={{
                pointerEvents: "none",
                userSelect: "none",
                color: ringColor(ring),
                fontFamily: "monospace",
                fontSize: "15px",
                fontWeight: "bold",
                whiteSpace: "nowrap",
                textShadow: "0 0 4px rgba(0,0,0,0.8)",
              }}
            >
              {value.toFixed(0)}°
            </Html>
          </group>
        );
      })}
    </group>
  );
}
