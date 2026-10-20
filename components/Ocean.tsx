"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { Clone, useAnimations, useGLTF } from "@react-three/drei";
import { Suspense, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

const HAZE = new THREE.Color("#62b8d9");
const ABYSS = new THREE.Color("#010812");
const SUN_DIR = new THREE.Vector3(0, 0.12, -1).normalize();

// Shared between all parts of the scene, updated once per frame in <Dive />
const shared = { p: 0, fog: new THREE.Color(HAZE) };

/** Scroll progress: 0 = surface, 1 = deepest. */
function getProgress() {
  const max = document.documentElement.scrollHeight - window.innerHeight;
  return max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/* ---------------------------------- SKY ---------------------------------- */
function Sky() {
  const uniforms = useMemo(
    () => ({
      uTop: { value: new THREE.Color("#0a3a68") },
      uFog: { value: new THREE.Color() },
      uSun: { value: SUN_DIR },
      uDark: { value: 0 },
    }),
    []
  );

  useFrame(() => {
    uniforms.uFog.value.copy(shared.fog);
    uniforms.uDark.value = Math.min(1, shared.p * 1.5);
  });

  return (
    <mesh renderOrder={-1}>
      <sphereGeometry args={[90, 32, 16]} />
      <shaderMaterial
        side={THREE.BackSide}
        depthWrite={false}
        fog={false}
        uniforms={uniforms}
        vertexShader={/* glsl */ `
          varying vec3 vDir;
          void main() {
            vDir = normalize(position);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }`}
        fragmentShader={/* glsl */ `
          uniform vec3 uTop; uniform vec3 uFog; uniform vec3 uSun; uniform float uDark;
          varying vec3 vDir;
          void main() {
            float h = clamp(vDir.y, 0.0, 1.0);
            vec3 col = mix(uFog, uTop, pow(h, 0.45));
            float s = max(dot(normalize(vDir), uSun), 0.0);
            col += vec3(1.0, 0.62, 0.3) * pow(s, 24.0) * 0.55;
            col += vec3(1.0, 0.85, 0.6) * pow(s, 300.0) * 0.8;
            col = mix(col, uFog, uDark);
            gl_FragColor = vec4(col, 1.0);
          }`}
      />
    </mesh>
  );
}

/* --------------------------------- OCEAN --------------------------------- */
function Waves() {
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uDeep: { value: new THREE.Color("#04304d") },
      uShallow: { value: new THREE.Color("#1aa3c9") },
      uSun: { value: SUN_DIR },
      uFog: { value: new THREE.Color() },
      uNear: { value: 25 },
      uFar: { value: 110 },
    }),
    []
  );

  useFrame(({ clock }) => {
    uniforms.uTime.value = clock.elapsedTime;
    uniforms.uFog.value.copy(shared.fog);
    uniforms.uNear.value = 25 - shared.p * 20;
    uniforms.uFar.value = 110 - shared.p * 85;
  });

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1, -60]}>
      <planeGeometry args={[220, 220, 256, 256]} />
      <shaderMaterial
        side={THREE.DoubleSide}
        uniforms={uniforms}
        vertexShader={/* glsl */ `
          uniform float uTime;
          varying vec3 vWorld; varying float vH; varying vec3 vN;
          float height(vec2 p, float t) {
            return sin(p.x * 0.5 + t) * 0.5
                 + sin(p.y * 0.7 + t * 1.3) * 0.35
                 + sin((p.x + p.y) * 0.3 + t * 0.7) * 0.5
                 + sin(p.x * 1.7 - p.y * 1.3 + t * 1.9) * 0.12;
          }
          void main() {
            vec2 p = position.xy;
            float h = height(p, uTime);
            float e = 0.15;
            float hx = height(p + vec2(e, 0.0), uTime) - h;
            float hy = height(p + vec2(0.0, e), uTime) - h;
            vec3 n = normalize(vec3(-hx / e, -hy / e, 1.0));
            vec4 wp = modelMatrix * vec4(p, h, 1.0);
            vWorld = wp.xyz; vH = h;
            vN = normalize(mat3(modelMatrix) * n);
            gl_Position = projectionMatrix * viewMatrix * wp;
          }`}
        fragmentShader={/* glsl */ `
          uniform vec3 uDeep; uniform vec3 uShallow; uniform vec3 uSun; uniform vec3 uFog;
          uniform float uNear; uniform float uFar;
          varying vec3 vWorld; varying float vH; varying vec3 vN;
          void main() {
            vec3 V = normalize(cameraPosition - vWorld);
            vec3 N = normalize(vN);
            vec3 col;
            if (gl_FrontFacing) {
              float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);
              col = mix(uDeep, uShallow, smoothstep(-1.0, 1.2, vH));
              col += fres * vec3(0.45, 0.75, 0.9);
              vec3 R = reflect(-uSun, N);
              col += pow(max(dot(R, V), 0.0), 80.0) * vec3(1.0, 0.8, 0.5) * 1.6;
              col = mix(col, vec3(1.0), smoothstep(0.85, 1.15, vH) * 0.45);
            } else {
              N = -N;
              float k = pow(max(dot(N, V), 0.0), 2.0);
              col = mix(uDeep * 0.7, vec3(0.55, 0.92, 1.0), k * 0.55);
            }
            float d = length(cameraPosition - vWorld);
            col = mix(col, uFog, smoothstep(uNear, uFar, d));
            gl_FragColor = vec4(col, 1.0);
          }`}
      />
    </mesh>
  );
}

/* ------------------------------- GOD RAYS -------------------------------- */
function Rays({ count = 9 }: { count?: number }) {
  const data = useMemo(
    () =>
      Array.from({ length: count }, () => ({
        x: (Math.random() - 0.5) * 26,
        z: -4 - Math.random() * 18,
        tilt: -0.25 + Math.random() * 0.2,
        yaw: Math.random() * Math.PI,
        w: 1.5 + Math.random() * 2.5,
      })),
    [count]
  );

  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        uniforms: { uOp: { value: 0 }, uTime: { value: 0 } },
        vertexShader: /* glsl */ `
          varying vec2 vUv; varying float vSeed;
          void main() {
            vUv = uv; vSeed = modelMatrix[3].x;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }`,
        fragmentShader: /* glsl */ `
          uniform float uOp; uniform float uTime;
          varying vec2 vUv; varying float vSeed;
          void main() {
            float edge = pow(1.0 - abs(vUv.x - 0.5) * 2.0, 2.0);
            float fade = pow(vUv.y, 1.5);
            float flick = 0.7 + 0.3 * sin(uTime * 0.6 + vSeed);
            gl_FragColor = vec4(vec3(0.7, 0.95, 1.0), edge * fade * uOp * flick);
          }`,
      }),
    []
  );

  useFrame(({ clock }) => {
    mat.uniforms.uTime.value = clock.elapsedTime;
    const p = shared.p;
    mat.uniforms.uOp.value = 0.4 * smooth(0.02, 0.25, p) * (1 - smooth(0.5, 0.9, p));
  });

  return (
    <>
      {data.map((d, i) => (
        <mesh key={i} position={[d.x, -10, d.z]} rotation={[0, d.yaw, d.tilt]} material={mat}>
          <planeGeometry args={[d.w, 22]} />
        </mesh>
      ))}
    </>
  );
}

/* --------------------------------- LIFE ---------------------------------- */
function Bubbles({ count = 220 }: { count?: number }) {
  const ref = useRef<THREE.Points>(null!);

  const positions = useMemo(() => {
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      arr[i * 3] = (Math.random() - 0.5) * 30;
      arr[i * 3 + 1] = -18 + Math.random() * 24;
      arr[i * 3 + 2] = (Math.random() - 0.5) * 20 - 5;
    }
    return arr;
  }, [count]);

  useFrame((_, dt) => {
    const p = ref.current.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < count; i++) {
      let y = p.getY(i) + dt * 0.5;
      if (y > 6) y = -18;
      p.setY(i, y);
    }
    p.needsUpdate = true;
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial size={0.08} color="#bff3ff" transparent opacity={0.7} sizeAttenuation />
    </points>
  );
}

function Jellies({ count = 14 }: { count?: number }) {
  const group = useRef<THREE.Group>(null!);

  const data = useMemo(
    () =>
      Array.from({ length: count }, () => ({
        x: (Math.random() - 0.5) * 18,
        y: -4 - Math.random() * 13,
        z: -2 - Math.random() * 14,
        s: 0.4 + Math.random() * 0.6,
        o: Math.random() * Math.PI * 2,
      })),
    [count]
  );

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    group.current.children.forEach((c, i) => {
      const d = data[i];
      c.position.y = d.y + Math.sin(t * 0.8 + d.o) * 0.6;
      c.scale.y = d.s * (1 + Math.sin(t * 2 + d.o) * 0.15);
    });
  });

  return (
    <group ref={group}>
      {data.map((d, i) => (
        <mesh key={i} position={[d.x, d.y, d.z]} scale={d.s}>
          <sphereGeometry args={[0.6, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshBasicMaterial color="#7df9ff" transparent opacity={0.5} side={THREE.DoubleSide} fog={false} />
        </mesh>
      ))}
    </group>
  );
}

/* --------------------- SEA CREATURES (your .glb models) ------------------- */
type Def = {
  file: string; // file in /public
  n: number; // how many
  s: number; // size
  yaw: number; // rotate if the model swims sideways / backwards
  c: [number, number, number]; // center of the swimming circle
  r: [number, number]; // min-max radius
  sp: number; // speed (negative = other direction)
};

const DEFS: Def[] = [
  { file: "/Fish1.glb", n: 8, s: 0.6, yaw: 0, c: [-7, -4, -8], r: [3, 6], sp: 0.35 },
  { file: "/Fish2.glb", n: 8, s: 0.6, yaw: 0, c: [6, -8, -12], r: [3, 6], sp: -0.28 },
  { file: "/Fish3.glb", n: 8, s: 0.6, yaw: 0, c: [-2, -12, -6], r: [3, 6], sp: 0.22 },
  { file: "/Dolphin.glb", n: 3, s: 1, yaw: 0, c: [0, -3, -12], r: [6, 9], sp: 0.4 },
  { file: "/Shark.glb", n: 2, s: 1.4, yaw: 0, c: [0, -11, -14], r: [8, 12], sp: -0.18 },
  { file: "/Manta.glb", n: 2, s: 1.5, yaw: 0, c: [0, -9, -16], r: [7, 11], sp: 0.12 },
  { file: "/Whale.glb", n: 1, s: 3, yaw: 0, c: [0, -8, -30], r: [24, 26], sp: 0.05 },
];

DEFS.forEach((d) => useGLTF.preload(d.file));

function Creature({ d }: { d: Def }) {
  const { scene, animations } = useGLTF(d.file);
  const move = useRef<THREE.Group>(null!);
  const model = useRef<THREE.Group>(null!);
  const { actions } = useAnimations(animations, model);

  const seed = useMemo(
    () => ({
      r: d.r[0] + Math.random() * (d.r[1] - d.r[0]),
      o: Math.random() * Math.PI * 2,
      yo: (Math.random() - 0.5) * 1.5,
    }),
    [d]
  );

  // play the model's built-in swimming animation
  useEffect(() => {
    const first = Object.values(actions)[0];
    if (first) {
      first.reset().play();
      first.time = Math.random() * first.getClip().duration;
    }
  }, [actions]);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const a = d.sp * t + seed.o * (d.n > 3 ? 0.2 : 1);
    move.current.position.set(
      d.c[0] + Math.cos(a) * seed.r,
      d.c[1] + seed.yo + Math.sin(t * 1.5 + seed.o) * 0.4,
      d.c[2] + Math.sin(a) * seed.r * 0.6
    );
    const vx = -Math.sin(a) * seed.r * d.sp;
    const vz = Math.cos(a) * seed.r * 0.6 * d.sp;
    move.current.rotation.y = Math.atan2(-vz, vx);
  });

  return (
    <group ref={move} scale={d.s}>
      <group ref={model} rotation={[0, d.yaw, 0]}>
        <Clone object={scene} />
      </group>
    </group>
  );
}

function Sea() {
  return (
    <>
      {DEFS.map((d) =>
        Array.from({ length: d.n }, (_, i) => <Creature key={d.file + i} d={d} />)
      )}
    </>
  );
}

/* ---------------------------- CAMERA + LIGHT ----------------------------- */
function Dive() {
  const sun = useRef<THREE.Group>(null!);
  const light = useRef<THREE.DirectionalLight>(null!);
  const ambient = useRef<THREE.AmbientLight>(null!);

  useFrame(({ camera, pointer, scene, clock }) => {
    const p = getProgress();
    shared.p = p;
    shared.fog.copy(HAZE).lerp(ABYSS, Math.min(1, p * 1.5));

    const fog = scene.fog as THREE.Fog | null;
    if (fog) {
      fog.color.copy(shared.fog);
      fog.far = 45 - p * 22;
    }

    const targetY = 1.5 - p * 16 + pointer.y * 0.5;
    camera.position.x += (pointer.x * 1.5 - camera.position.x) * 0.03;
    camera.position.y += (targetY - camera.position.y) * 0.05;
    camera.lookAt(0, camera.position.y - 1.5, -10);
    camera.rotateZ(Math.sin(clock.elapsedTime * 0.35) * 0.025); // gentle sway

    sun.current.visible = p < 0.3;
    light.current.intensity = 2.5 * (1 - p) + 0.6;
    ambient.current.intensity = 0.6 * (1 - p) + 0.5; // brighter in the deep so animals stay visible
  });

  return (
    <>
      <ambientLight ref={ambient} intensity={0.6} />
      <directionalLight ref={light} position={[0, 6, -30]} intensity={2.5} color="#ffd8a8" />
      <group ref={sun} position={[0, 4, -35]}>
        <mesh>
          <sphereGeometry args={[3, 32, 32]} />
          <meshBasicMaterial color="#ffe2b8" fog={false} />
        </mesh>
        <mesh>
          <sphereGeometry args={[7, 32, 32]} />
          <meshBasicMaterial
            color="#ffb070"
            transparent
            opacity={0.18}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            fog={false}
          />
        </mesh>
      </group>
    </>
  );
}

export default function Ocean() {
  return (
    <Canvas camera={{ position: [0, 1.5, 8], fov: 60 }} dpr={[1, 2]} eventSource={document.body} eventPrefix="client">
      <fog attach="fog" args={["#62b8d9", 10, 45]} />
      <Dive />
      <Sky />
      <Waves />
      <Rays />
      <Bubbles />
      <Jellies />
      <Suspense fallback={null}>
        <Sea />
      </Suspense>
    </Canvas>
  );
}