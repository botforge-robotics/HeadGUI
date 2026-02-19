import { useRef, useEffect } from "react";
import { Canvas, useThree, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import URDFLoader from "urdf-loader";
import type { RobotOrientation } from "../types";

const THUMB_SKIN = "#c4956a";
const THUMB_BASE = "#141418";

function ThumbnailCamera() {
  const { camera } = useThree();
  useEffect(() => {
    camera.position.set(4, -0.6, 4.5);
    camera.lookAt(0, -1, 0);
    camera.updateProjectionMatrix();
  }, [camera]);
  return null;
}

function applyThumbMaterials(robot: any) {
  const getLinkName = (obj: any, root: any): string => {
    let p: any = obj;
    while (p && p !== root) {
      const name = (p.name || "").toLowerCase();
      if (name) return name;
      p = p.parent;
    }
    return (obj.parent?.name || obj.name || "").toLowerCase();
  };
  robot.traverse((child: any) => {
    if (child.isMesh) {
      child.castShadow = false;
      child.receiveShadow = false;
      const linkName = getLinkName(child, robot);
      const meshName = (child.name || "").toLowerCase();
      const isHead =
        linkName.includes("head_1") ||
        linkName.includes("head") ||
        meshName.includes("head");
      const isBase = linkName.includes("base") || meshName.includes("base");
      const useSkin = isHead && !isBase;
      child.material = new THREE.MeshStandardMaterial({
        color: useSkin ? THUMB_SKIN : THUMB_BASE,
        roughness: useSkin ? 0.92 : 0.55,
        metalness: useSkin ? 0.01 : 0.3,
        envMapIntensity: 0.1,
      });
    }
  });
}

function ThumbnailRobot({ orientation }: { orientation: RobotOrientation }) {
  const robotRef = useRef<any>(null);
  const materialReapplyFramesLeft = useRef(0);
  const { scene } = useThree();

  useEffect(() => {
    const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "") + "/";
    const loader = new URDFLoader();
    loader.packages = { meshes: `${base}meshes` };
    loader.load(
      `${base}urdf/Head_URDF.xacro`,
      (robot: any) => {
        robot.scale.set(5, 5, 5);
        robot.rotation.x = -Math.PI / 2;
        robot.position.set(0, -1.5, 0);
        applyThumbMaterials(robot);
        robotRef.current = robot;
        scene.add(robot);
        materialReapplyFramesLeft.current = 30;
      },
      undefined,
      (err: any) => console.warn("Thumbnail URDF load failed", err),
    );
    return () => {
      if (robotRef.current) scene.remove(robotRef.current);
    };
  }, [scene]);

  useFrame(() => {
    const robot = robotRef.current;
    if (robot && materialReapplyFramesLeft.current > 0) {
      applyThumbMaterials(robot);
      materialReapplyFramesLeft.current -= 1;
    }
    if (!robot?.joints) return;
    const rollRad = (-orientation.roll * Math.PI) / 180;
    const pitchRad = (orientation.pitch * Math.PI) / 180;
    const yawRad = (-orientation.yaw * Math.PI) / 180;
    if (robotRef.current.joints["joint_roll"])
      robotRef.current.joints["joint_roll"].setJointValue(rollRad);
    if (robotRef.current.joints["joint_pitch"])
      robotRef.current.joints["joint_pitch"].setJointValue(pitchRad);
    if (robotRef.current.joints["joint_yaw"])
      robotRef.current.joints["joint_yaw"].setJointValue(yawRad);
  });

  return null;
}

interface PoseThumbnailProps {
  orientation: RobotOrientation;
  className?: string;
}

export default function PoseThumbnail({
  orientation,
  className = "",
}: PoseThumbnailProps) {
  return (
    <div
      className={`aspect-square bg-zinc-900 rounded-lg overflow-hidden border border-zinc-700 ${className}`}
    >
      <Canvas
        camera={{ position: [4, -0.6, 4.5], fov: 38 }}
        gl={{ antialias: true, alpha: false }}
        dpr={[1, 1.5]}
      >
        <color attach="background" args={["#18181b"]} />
        <ThumbnailCamera />
        <ambientLight intensity={0.6} />
        <directionalLight position={[5, 5, 5]} intensity={0.8} />
        <ThumbnailRobot orientation={orientation} />
      </Canvas>
    </div>
  );
}
