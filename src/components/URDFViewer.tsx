import { useRef, useEffect } from "react";
import { Canvas, useThree, useFrame } from "@react-three/fiber";
import { OrbitControls, Grid } from "@react-three/drei";
import * as THREE from "three";
import URDFLoader from "urdf-loader";
import { useRobotStore } from "../store/robotStore";
import type { RobotOrientation } from "../types";
import SpatialRPYGizmo from "./SpatialRPYGizmo";

interface URDFRobotProps {
  orientation: RobotOrientation;
}

function applyRobotMaterials(robot: any) {
  const getLinkName = (obj: any): string => {
    let p: any = obj;
    while (p && p !== robot) {
      const name = (p.name || "").toLowerCase();
      if (name) return name;
      p = p.parent;
    }
    return (obj.parent?.name || obj.name || "").toLowerCase();
  };
  robot.traverse((child: any) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
      const linkName = getLinkName(child);
      const meshName = (child.name || "").toLowerCase();
      const isHead =
        linkName.includes("head_1") ||
        linkName.includes("head") ||
        meshName.includes("head_1") ||
        meshName.includes("head");
      const isBase = linkName.includes("base") || meshName.includes("base");
      const useSkin = isHead && !isBase;
      child.material = new THREE.MeshStandardMaterial({
        color: useSkin ? "#c4956a" : "#141418",
        roughness: useSkin ? 0.92 : 0.55,
        metalness: useSkin ? 0.01 : 0.3,
        envMapIntensity: 0.1,
      });
    }
  });
}

function URDFRobot({ orientation }: URDFRobotProps) {
  const robotRef = useRef<any>(null);
  const materialReapplyFramesLeft = useRef(0);
  const { scene } = useThree();

  useEffect(() => {
    const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "") + "/";
    const loader = new URDFLoader();
    loader.packages = {
      meshes: `${base}meshes`,
    };

    loader.load(
      `${base}urdf/Head_URDF.xacro`,
      (robot: any) => {
        robot.scale.set(5, 5, 5);
        robot.rotation.x = -Math.PI / 2;
        robot.position.set(0, -1.5, 0);
        applyRobotMaterials(robot);
        robotRef.current = robot;
        scene.add(robot);
        materialReapplyFramesLeft.current = 90;
      },
      undefined,
      (error: any) => {
        console.error("Failed to load URDF:", error);
      },
    );

    return () => {
      if (robotRef.current) {
        scene.remove(robotRef.current);
      }
    };
  }, [scene]);

  useFrame(() => {
    const robot = robotRef.current;
    if (!robot) return;
    if (materialReapplyFramesLeft.current > 0) {
      applyRobotMaterials(robot);
      materialReapplyFramesLeft.current -= 1;
    }
    if (robot.joints) {
      const rollRad = (-orientation.roll * Math.PI) / 180;
      const pitchRad = (orientation.pitch * Math.PI) / 180;
      const yawRad = (-orientation.yaw * Math.PI) / 180;
      if (robot.joints["joint_roll"])
        robot.joints["joint_roll"].setJointValue(rollRad);
      if (robot.joints["joint_pitch"])
        robot.joints["joint_pitch"].setJointValue(pitchRad);
      if (robot.joints["joint_yaw"])
        robot.joints["joint_yaw"].setJointValue(yawRad);
    }
  });

  return null;
}

interface URDFViewerProps {
  roll: number;
  pitch: number;
  yaw: number;
}

function SceneContent({
  roll,
  pitch,
  yaw,
}: {
  roll: number;
  pitch: number;
  yaw: number;
}) {
  const isGizmoDragging = useRobotStore((s) => s.isGizmoDragging);
  return (
    <>
      <ambientLight intensity={0.5} />
      <directionalLight
        position={[6, 8, 5]}
        intensity={1.8}
        color="#ffffff"
        castShadow
        shadow-bias={-0.0002}
      />
      <pointLight position={[-4, 4, 4]} intensity={0.6} color="#ffffff" />
      <pointLight position={[4, 2, 4]} intensity={0.4} color="#fff8f0" />
      <Grid
        args={[20, 20]}
        cellSize={0.5}
        cellColor="#333"
        sectionSize={2.5}
        sectionColor="#555"
        fadeDistance={15}
        fadeStrength={1}
        position={[0, -2, 0]}
      />
      <OrbitControls
        target={[0, -1, 0]}
        enablePan
        enableZoom
        enableRotate={!isGizmoDragging}
        enableDamping
        dampingFactor={0.05}
        minDistance={2}
        maxDistance={10}
        maxPolarAngle={Math.PI / 1.4}
      />
      <URDFRobot orientation={{ roll, pitch, yaw }} />
      <SpatialRPYGizmo />
    </>
  );
}

export default function URDFViewer({ roll, pitch, yaw }: URDFViewerProps) {
  return (
    <div className="absolute inset-0 w-full h-full">
      <Canvas
        shadows
        camera={{ position: [4, -0.6, 4.5], fov: 38 }}
        gl={{
          antialias: true,
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.2,
          outputColorSpace: THREE.SRGBColorSpace,
        }}
      >
        <SceneContent roll={roll} pitch={pitch} yaw={yaw} />
      </Canvas>
    </div>
  );
}
