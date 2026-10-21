"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { useAnimations, useGLTF } from "@react-three/drei";
import { Suspense, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";
import { Snailfish, tidy } from "./Ocean";

/** Slowly turns whatever is inside, so you can see the animal from every side. */
function Spin({ children, scale = 1 }: { children: React.ReactNode; scale?: number }) {
  const g = useRef<THREE.Group>(null!);
  useFrame(({ clock }) => {
    g.current.rotation.y = clock.elapsedTime * 0.6;
  });
  return (
    <group ref={g} scale={scale}>
      {children}
    </group>
  );
}

function Jelly() {
  const dome = useRef<THREE.Group>(null!);
  useFrame(({ clock }) => {
    dome.current.scale.y = 1 + Math.sin(clock.elapsedTime * 2) * 0.12;
  });
  return (
    <group ref={dome} position={[0, 0.2, 0]}>
      <mesh>
        <sphereGeometry args={[0.8, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshBasicMaterial color="#c78bff" transparent opacity={0.6} side={THREE.DoubleSide} />
      </mesh>
      {[-0.4, -0.15, 0.15, 0.4].map((x) => (
        <mesh key={x} position={[x, -0.6, 0]}>
          <cylinderGeometry args={[0.025, 0.025, 1.2, 6]} />
          <meshBasicMaterial color="#e2b8ff" transparent opacity={0.6} />
        </mesh>
      ))}
    </group>
  );
}

/** A .glb animal, resized to fit the frame and spinning, with its own swim animation. */
function GlbModel({ file }: { file: string }) {
  const { scene, animations } = useGLTF(file);
  const spin = useRef<THREE.Group>(null!);

  const clone = useMemo(() => {
    const c = SkeletonUtils.clone(scene);
    tidy(c);
    return c;
  }, [scene]);

  const { actions } = useAnimations(animations, clone);

  const fit = useMemo(() => {
    const box = new THREE.Box3().setFromObject(clone);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const k = 2.4 / Math.max(size.x, size.y, size.z, 0.001);
    return { k, pos: center.multiplyScalar(-k) };
  }, [clone]);

  useEffect(() => {
    const names = Object.keys(actions);
    const name = names.find((n) => /swim|fly|move|idle|loop/i.test(n)) ?? names[0];
    const a = name ? actions[name] : null;
    if (a) a.reset().play();
    return () => {
      a?.stop();
    };
  }, [actions]);

  useFrame(({ clock }) => {
    spin.current.rotation.y = clock.elapsedTime * 0.6;
  });

  return (
    <group ref={spin}>
      <group scale={fit.k} position={fit.pos}>
        <primitive object={clone} />
      </group>
    </group>
  );
}

export default function Viewer({
  file,
  proc,
  accent,
}: {
  file?: string;
  proc?:  "snailfish" | "jelly";
  accent: string;
}) {
  return (
    <Canvas camera={{ position: [0, 0.5, 6.2], fov: 35 }} dpr={[1, 2]} gl={{ alpha: true }} style={{ background: "transparent" }}>
      <ambientLight intensity={1.1} />
      <directionalLight position={[3, 4, 5]} intensity={2.4} />
      <directionalLight position={[-4, 2, -4]} intensity={1.6} color={accent} />
            <Suspense fallback={null}>
        {file ? (
          <GlbModel file={file} />
        ) : proc === "snailfish" ? (
          <Spin scale={0.8}>
            <Snailfish />
          </Spin>
        ) : (
          <Spin scale={1.6}>
            <Jelly />
          </Spin>
        )}
      </Suspense>
    </Canvas>
  );
}