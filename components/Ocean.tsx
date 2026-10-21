"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { useAnimations, useGLTF } from "@react-three/drei";
import { Suspense, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";
import { MAX_DEPTH, MODELS, camY, depthStore, yOfStation } from "./data";

const HAZE = new THREE.Color("#c3e6f6"); // bright daytime horizon
const WATER = new THREE.Color("#1d93c4"); // just under the surface
const ABYSS = new THREE.Color("#01050f"); // deep
const SUN_DIR = new THREE.Vector3(0.2, 0.3, -1).normalize();
const FLOOR = camY(MAX_DEPTH) - 6; // sandy seabed

// Shared between all parts of the scene, updated once per frame in <Dive />
//  u    = 0 above water -> 1 under water
//  deep = 0 at the surface -> 1 very deep (follows the REAL depth in meters)
const shared = { D: 0, u: 0, deep: 0, fog: new THREE.Color(HAZE) };

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];

/* ---------------------------------- SKY ---------------------------------- */
function Sky() {
  const uniforms = useMemo(
    () => ({
      uTop: { value: new THREE.Color("#2a86e0") },
      uFog: { value: new THREE.Color() },
      uSun: { value: SUN_DIR },
      uDark: { value: 0 },
    }),
    []
  );

  useFrame(() => {
    uniforms.uFog.value.copy(shared.fog);
    uniforms.uDark.value = shared.u;
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
            vec3 col = mix(uFog, uTop, pow(h, 0.5));
            float s = max(dot(normalize(vDir), uSun), 0.0);
            col += vec3(1.0, 0.92, 0.75) * pow(s, 12.0) * 0.25;
            col += vec3(1.0, 0.95, 0.8) * pow(s, 120.0) * 0.9;
            col = mix(col, uFog, uDark);
            gl_FragColor = vec4(col, 1.0);
          }`}
      />
    </mesh>
  );
}

function Clouds() {
  const g = useRef<THREE.Group>(null!);

  const tex = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const x = c.getContext("2d")!;
    const gr = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, "rgba(255,255,255,0.95)");
    gr.addColorStop(0.5, "rgba(255,255,255,0.5)");
    gr.addColorStop(1, "rgba(255,255,255,0)");
    x.fillStyle = gr;
    x.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  }, []);

  const clouds = useMemo(
    () =>
      Array.from({ length: 9 }, () => ({
        x: rnd(-70, 70),
        y: rnd(10, 24),
        z: rnd(-75, -50),
        sp: rnd(0.15, 0.4),
        parts: Array.from({ length: 6 }, () => ({ dx: rnd(-8, 8), dy: rnd(-1.5, 2), s: rnd(10, 18) })),
      })),
    []
  );

  useFrame((_, dt) => {
    g.current.visible = shared.u < 0.5;
    g.current.children.forEach((c, i) => {
      c.position.x += dt * clouds[i].sp;
      if (c.position.x > 80) c.position.x = -80;
    });
  });

  return (
    <group ref={g}>
      {clouds.map((c, i) => (
        <group key={i} position={[c.x, c.y, c.z]}>
          {c.parts.map((p, j) => (
            <sprite key={j} position={[p.dx, p.dy, 0]} scale={[p.s, p.s * 0.6, 1]}>
              <spriteMaterial map={tex} transparent depthWrite={false} fog={false} opacity={0.9} />
            </sprite>
          ))}
        </group>
      ))}
    </group>
  );
}

/* --------------------------------- OCEAN --------------------------------- */
function Waves() {
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uDeep: { value: new THREE.Color("#0a5f94") },
      uShallow: { value: new THREE.Color("#27b7d6") },
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
    uniforms.uNear.value = 25 - shared.u * 17;
    uniforms.uFar.value = 110 - shared.u * 75 - shared.deep * 15;
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
              col += pow(max(dot(R, V), 0.0), 80.0) * vec3(1.0, 0.9, 0.7) * 1.6;
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

function Rays({ count = 9 }: { count?: number }) {
  const data = useMemo(
    () =>
      Array.from({ length: count }, () => ({
        x: rnd(-13, 13),
        z: rnd(-22, -4),
        tilt: rnd(-0.25, -0.05),
        yaw: Math.random() * Math.PI,
        w: rnd(1.5, 4),
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
            gl_FragColor = vec4(vec3(0.75, 0.97, 1.0), edge * fade * uOp * flick);
          }`,
      }),
    []
  );

  const g = useRef<THREE.Group>(null!);

  useFrame(({ clock, camera }) => {
    mat.uniforms.uTime.value = clock.elapsedTime;
    mat.uniforms.uOp.value = 0.45 * shared.u * (1 - smooth(0.2, 0.7, shared.deep));
    g.current.position.y = camera.position.y + 10; // rays follow the camera so they are always visible near the surface
    g.current.visible = shared.u > 0.02 && shared.deep < 0.75;
  });

  return (
    <group ref={g}>
      {data.map((d, i) => (
        <mesh key={i} position={[d.x, -10, d.z]} rotation={[0, d.yaw, d.tilt]} material={mat}>
          <planeGeometry args={[d.w, 22]} />
        </mesh>
      ))}
    </group>
  );
}

/* ----------------------- BUBBLES, SNOW, GLOWING PLANKTON ------------------- */
function useSprite(kind: "ring" | "soft") {
  return useMemo(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const x = c.getContext("2d")!;
    if (kind === "ring") {
      x.fillStyle = "rgba(255,255,255,0.18)";
      x.beginPath();
      x.arc(32, 32, 26, 0, Math.PI * 2);
      x.fill();
      x.lineWidth = 3;
      x.strokeStyle = "rgba(255,255,255,0.9)";
      x.stroke();
      x.fillStyle = "rgba(255,255,255,0.95)";
      x.beginPath();
      x.arc(23, 23, 5, 0, Math.PI * 2);
      x.fill();
    } else {
      const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, "rgba(255,255,255,1)");
      gr.addColorStop(1, "rgba(255,255,255,0)");
      x.fillStyle = gr;
      x.fillRect(0, 0, 64, 64);
    }
    return new THREE.CanvasTexture(c);
  }, [kind]);
}

/** Bubbles rising from the seabed to the surface. */
/** Bubbles rising around the camera, from the deep up to the surface. */
function Bubbles({ count, size, speed }: { count: number; size: number; speed: number }) {
  const ref = useRef<THREE.Points>(null!);
  const mat = useRef<THREE.PointsMaterial>(null!);
  const tex = useSprite("ring");

  const positions = useMemo(() => {
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      arr[i * 3] = rnd(-22, 22);
      arr[i * 3 + 1] = rnd(-40, -1);
      arr[i * 3 + 2] = rnd(-28, 5);
    }
    return arr;
  }, [count]);

  useFrame(({ clock, camera }, dt) => {
    const t = clock.elapsedTime;
    const top = Math.min(camera.position.y + 18, -1);
    const bottom = top - 36;
    const p = ref.current.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < count; i++) {
      let y = p.getY(i) + dt * speed * (0.7 + (i % 5) * 0.15);
      if (y > top) y = bottom + (y - top);
      else if (y < bottom) y = top - (bottom - y);
      p.setY(i, y);
      p.setX(i, p.getX(i) + Math.sin(t * 0.8 + i) * dt * 0.15);
    }
    p.needsUpdate = true;
    mat.current.opacity = 0.8 * shared.u;
  });

  return (
    <points ref={ref} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial ref={mat} map={tex} size={size} transparent depthWrite={false} sizeAttenuation />
    </points>
  );
}

/** Marine snow (white) and glowing plankton (cyan) that appear in the dark. */
function Motes({ count, glow }: { count: number; glow: boolean }) {
  const ref = useRef<THREE.Points>(null!);
  const mat = useRef<THREE.PointsMaterial>(null!);
  const tex = useSprite("soft");

  const positions = useMemo(() => {
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      arr[i * 3] = rnd(-24, 24);
      arr[i * 3 + 1] = rnd(-40, -1);
      arr[i * 3 + 2] = rnd(-30, 6);
    }
    return arr;
  }, [count]);

  useFrame(({ clock, camera }, dt) => {
    const t = clock.elapsedTime;
    const top = Math.min(camera.position.y + 18, -1);
    const bottom = top - 36;
    const p = ref.current.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < count; i++) {
      let y = p.getY(i) + dt * (glow ? 0.05 * Math.sin(t * 0.5 + i) : -0.1);
      if (y > top) y = bottom + (y - top);
      else if (y < bottom) y = top - (bottom - y);
      p.setY(i, y);
    }
    p.needsUpdate = true;
    mat.current.opacity = glow ? 0.95 * smooth(0.4, 0.85, shared.deep) : 0.5 * shared.u * smooth(0.05, 0.4, shared.deep);
  });

  return (
    <points ref={ref} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        ref={mat}
        map={tex}
        size={glow ? 0.22 : 0.12}
        color={glow ? "#7df9ff" : "#dff6ff"}
        transparent
        depthWrite={false}
        blending={glow ? THREE.AdditiveBlending : THREE.NormalBlending}
        sizeAttenuation
      />
    </points>
  );
}

/* -------------------------- DEEP-SEA JELLYFISH ---------------------------- */
function Jellies({ count = 16 }: { count?: number }) {
  const group = useRef<THREE.Group>(null!);

  const data = useMemo(
    () =>
      Array.from({ length: count }, () => ({
        x: rnd(-10, 10),
               y: yOfStation("jellyfish") + rnd(-5, 5),
        z: rnd(-16, -3),
        s: rnd(0.45, 1),
        o: Math.random() * Math.PI * 2,
        c: pick(["#7df9ff", "#c78bff", "#ff9ae6"]),
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
        <group key={i} position={[d.x, d.y, d.z]} scale={d.s}>
          <mesh>
            <sphereGeometry args={[0.6, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
            <meshBasicMaterial color={d.c} transparent opacity={0.55} side={THREE.DoubleSide} fog={false} />
          </mesh>
          {[-0.3, -0.1, 0.1, 0.3].map((x) => (
            <mesh key={x} position={[x, -0.45, 0]}>
              <cylinderGeometry args={[0.02, 0.02, 0.9, 6]} />
              <meshBasicMaterial color={d.c} transparent opacity={0.4} fog={false} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

/* --------------------------------- SEABED --------------------------------- */
function Strand({ h, color, phase }: { h: number; color: string; phase: number }) {
  const SEG = 5;
  const L = h / SEG;
  const refs = useRef<THREE.Group[]>([]);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    refs.current.forEach((g, i) => {
      if (!g) return;
      g.rotation.z = Math.sin(t * 1.1 + phase + i * 0.5) * 0.12;
      g.rotation.x = Math.cos(t * 0.9 + phase + i * 0.4) * 0.08;
    });
  });

  const build = (i: number): React.ReactNode => (
    <group
      key={i}
      ref={(el) => {
        if (el) refs.current[i] = el;
      }}
      position={[0, i === 0 ? 0 : L, 0]}
    >
      <mesh position={[0, L / 2, 0]}>
        <capsuleGeometry args={[0.16 * (1 - (i / SEG) * 0.55), L * 0.9, 4, 6]} />
        <meshStandardMaterial color={color} roughness={0.8} />
      </mesh>
      {i < SEG - 1 && build(i + 1)}
    </group>
  );

  return <>{build(0)}</>;
}

function Seabed() {
  const g = useRef<THREE.Group>(null!);

  const sand = useMemo(() => {
    const geom = new THREE.PlaneGeometry(160, 120, 90, 70);
    const pos = geom.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      pos.setZ(i, Math.sin(x * 0.25) * 0.35 + Math.sin(y * 0.3 + x * 0.1) * 0.3 + Math.sin(x * 0.9 + y * 0.7) * 0.08);
    }
    geom.computeVertexNormals();
    return geom;
  }, []);

  const items = useMemo(
    () => ({
      kelp: Array.from({ length: 45 }, () => ({
        x: rnd(-28, 28),
        z: rnd(-48, 0),
        h: rnd(3, 7),
        phase: rnd(0, 6.28),
        c: pick(["#2e7d4f", "#3f9b62", "#1f5e44"]),
      })),
      corals: Array.from({ length: 24 }, () => ({
        x: rnd(-28, 28),
        z: rnd(-48, 0),
        s: rnd(0.8, 1.8),
        c: pick(["#e86a8c", "#ff9a4a", "#a77bff", "#f2c94c"]),
      })),
      rocks: Array.from({ length: 14 }, () => ({ x: rnd(-30, 30), z: rnd(-50, 0), s: rnd(0.8, 2.4) })),
    }),
    []
  );

  useFrame(() => {
    g.current.visible = shared.D > 8000; // only exists at the very bottom
  });

  return (
    <group ref={g} position={[0, FLOOR, 0]} visible={false}>
      <mesh geometry={sand} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -25]}>
        <meshStandardMaterial color="#c2ab76" roughness={1} />
      </mesh>

      {items.kelp.map((k, i) => (
        <group key={i} position={[k.x, 0, k.z]}>
          <Strand h={k.h} color={k.c} phase={k.phase} />
        </group>
      ))}

      {items.corals.map((c, i) => (
        <group key={i} position={[c.x, 0, c.z]} scale={c.s}>
          <mesh position={[0, 0.9, 0]}>
            <coneGeometry args={[0.5, 1.8, 6]} />
            <meshStandardMaterial color={c.c} roughness={0.7} />
          </mesh>
          <mesh position={[0.55, 0.5, 0]} rotation={[0, 0, -0.4]}>
            <coneGeometry args={[0.3, 1, 6]} />
            <meshStandardMaterial color={c.c} roughness={0.7} />
          </mesh>
          <mesh position={[-0.5, 0.35, 0.2]}>
            <sphereGeometry args={[0.35, 12, 10]} />
            <meshStandardMaterial color={c.c} roughness={0.7} />
          </mesh>
        </group>
      ))}

      {items.rocks.map((r, i) => (
        <mesh key={i} position={[r.x, r.s * 0.4, r.z]} scale={r.s}>
          <dodecahedronGeometry args={[1]} />
          <meshStandardMaterial color="#4a5568" roughness={1} />
        </mesh>
      ))}
    </group>
  );
}

/* ---------------------- HAND-MADE DEEP-SEA ANIMALS ------------------------ */
/** Anglerfish with a glowing lure. Faces +x. */
export function Angler() {
  const lure = useRef<THREE.Mesh>(null!);
  useFrame(({ clock }) => lure.current.scale.setScalar(1 + Math.sin(clock.elapsedTime * 3) * 0.2));

  return (
    <group>
      <mesh scale={[1.1, 0.9, 0.85]}>
        <sphereGeometry args={[1, 24, 16]} />
        <meshStandardMaterial color="#2b1d2f" roughness={0.8} />
      </mesh>
      <mesh position={[0.8, -0.45, 0]} rotation={[0, 0, -0.3]} scale={[0.85, 0.35, 0.7]}>
        <sphereGeometry args={[1, 16, 12]} />
        <meshStandardMaterial color="#1c1220" roughness={0.8} />
      </mesh>
      {[-0.4, -0.15, 0.15, 0.4].map((z) => (
        <mesh key={z} position={[1.55, -0.2, z]} rotation={[0, 0, Math.PI]}>
          <coneGeometry args={[0.05, 0.22, 5]} />
          <meshStandardMaterial color="#f4f1e8" />
        </mesh>
      ))}
      {[-0.45, 0.45].map((z) => (
        <mesh key={z} position={[0.65, 0.35, z]}>
          <sphereGeometry args={[0.13, 10, 10]} />
          <meshStandardMaterial color="#f4f1e8" emissive="#d8f6ff" emissiveIntensity={0.4} />
        </mesh>
      ))}
      <mesh position={[0.9, 1.0, 0]} rotation={[0, 0, -0.9]}>
        <cylinderGeometry args={[0.03, 0.03, 1.2, 6]} />
        <meshStandardMaterial color="#1c1220" />
      </mesh>
      <mesh ref={lure} position={[1.55, 1.45, 0]}>
        <sphereGeometry args={[0.16, 14, 14]} />
        <meshBasicMaterial color="#aefaff" fog={false} />
      </mesh>
      <pointLight position={[1.55, 1.45, 0]} color="#7df9ff" intensity={6} distance={10} decay={2} />
      <mesh position={[-1.4, 0, 0]} rotation={[0, 0, Math.PI / 2]} scale={[0.8, 1.1, 0.2]}>
        <coneGeometry args={[0.7, 1.2, 8]} />
        <meshStandardMaterial color="#2b1d2f" roughness={0.8} />
      </mesh>
    </group>
  );
}

/** Pale, jelly-soft snailfish. Faces +x. */
export function Snailfish() {
  const tail = useRef<THREE.Group>(null!);
  useFrame(({ clock }) => {
    tail.current.rotation.y = Math.sin(clock.elapsedTime * 4) * 0.5;
  });

  return (
    <group>
      <mesh scale={[1.3, 0.6, 0.55]}>
        <sphereGeometry args={[1, 20, 14]} />
        <meshStandardMaterial color="#f3c6d0" transparent opacity={0.88} roughness={0.5} />
      </mesh>
      {[-0.3, 0.3].map((z) => (
        <mesh key={z} position={[1.0, 0.15, z]}>
          <sphereGeometry args={[0.07, 8, 8]} />
          <meshBasicMaterial color="#1a1a2e" />
        </mesh>
      ))}
      <group ref={tail} position={[-1.2, 0, 0]}>
        <mesh position={[-0.7, 0, 0]} rotation={[0, 0, Math.PI / 2]} scale={[1, 1, 0.5]}>
          <coneGeometry args={[0.5, 1.6, 12]} />
          <meshStandardMaterial color="#f3c6d0" transparent opacity={0.85} roughness={0.5} />
        </mesh>
        <mesh position={[-1.55, 0, 0]} scale={[0.7, 0.55, 0.08]}>
          <sphereGeometry args={[1, 14, 10]} />
          <meshStandardMaterial color="#f7d8e0" transparent opacity={0.7} roughness={0.5} />
        </mesh>
      </group>
    </group>
  );
}

/* --------------------- SEA CREATURES (your .glb models) ------------------- */
/**
 * Each animal lives only around its own stop (see data.ts), so you meet them one after another
 * as you go down. They swim in a straight line across the screen; small fish swim in schools.
 */
type Def = {
  id: string; // matches a stop in data.ts (the model comes from MODELS there)
  file?: string;
  proc?: "angler" | "snailfish";
  groups: number; // how many separate groups / schools
  per: number; // animals per group
  spread: [number, number, number]; // how loose the school is (x, y, z)
  s: number; // size
  yaw: number; // extra rotation if the model still faces the wrong way
  z: [number, number]; // distance from the camera (more negative = farther)
  v: [number, number]; // swim speed range
  gap: [number, number]; // seconds of waiting between crossings
  w: [number, number]; // body wiggle [amount, speed]
};

const NO_SPREAD: [number, number, number] = [0, 0, 0];

const BASE: Omit<Def, "file" | "proc">[] = [
  { id: "clownfish", groups: 2, per: 5, spread: [3, 1.4, 2], s: 0.3, yaw: 0, z: [-5, -10], v: [2, 3], gap: [0.5, 3], w: [0.35, 8] },
  { id: "bluetang", groups: 2, per: 4, spread: [3, 1.4, 2], s: 0.35, yaw: 0, z: [-6, -12], v: [2.2, 3.2], gap: [0.5, 3], w: [0.35, 8] },
  { id: "tuna", groups: 2, per: 4, spread: [3.5, 1.5, 2.2], s: 0.45, yaw: 0, z: [-7, -12], v: [3.5, 5], gap: [0.5, 3], w: [0.3, 7] },
  { id: "manta", groups: 2, per: 1, spread: NO_SPREAD, s: 0.9, yaw: 0, z: [-9, -14], v: [2.5, 3.5], gap: [1, 5], w: [0.05, 2] },
  { id: "dolphin", groups: 1, per: 2, spread: [3, 1, 1.5], s: 0.7, yaw: 0, z: [-8, -14], v: [5, 7], gap: [1, 5], w: [0.1, 4] },
  { id: "whale", groups: 1, per: 1, spread: NO_SPREAD, s: 1.5, yaw: 0, z: [-16, -21], v: [2.5, 3.5], gap: [1, 5], w: [0.05, 1.2] },
  { id: "shark", groups: 1, per: 1, spread: NO_SPREAD, s: 0.9, yaw: 0, z: [-9, -14], v: [3, 4.5], gap: [1, 5], w: [0.18, 3] },
  { id: "angler", groups: 1, per: 1, spread: NO_SPREAD, s: 0.6, yaw: 0, z: [-7, -11], v: [1.2, 2], gap: [1, 5], w: [0.12, 2.5] },
  { id: "snailfish", groups: 2, per: 1, spread: NO_SPREAD, s: 0.5, yaw: 0, z: [-6, -10], v: [0.9, 1.4], gap: [0.5, 4], w: [0.2, 3] },
];

const DEFS: Def[] = BASE.map((d) => {
  const m = MODELS[d.id] ?? {};
  return { ...d, file: m.file, proc: m.proc === "angler" || m.proc === "snailfish" ? m.proc : undefined };
});

DEFS.forEach((d) => d.file && useGLTF.preload(d.file));

/** Fixes so the glb models look right in this scene. */
export function tidy(root: THREE.Object3D) {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    m.frustumCulled = false;
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    mats.forEach((mat) => {
      const s = mat as THREE.MeshStandardMaterial;
      if (typeof s.metalness === "number") s.metalness = Math.min(s.metalness, 0.2);
    });
  });
}

/** Which way does the model face? Returns the Y rotation that makes its head point to +x. */
function forwardYaw(root: THREE.Object3D): number {
  root.updateMatrixWorld(true);
  const v = new THREE.Vector3();
  const box = new THREE.Box3();
  let sx = 0;
  let sz = 0;
  let n = 0;

  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const pos = m.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
      box.expandByPoint(v);
      sx += v.x;
      sz += v.z;
      n++;
    }
  });
  if (!n) return 0;

  const size = box.getSize(new THREE.Vector3());
  const c = box.getCenter(new THREE.Vector3());
  const mx = sx / n - c.x;
  const mz = sz / n - c.z;

  if (size.x >= size.z) return mx >= 0 ? 0 : Math.PI;
  return mz >= 0 ? Math.PI / 2 : -Math.PI / 2;
}

const facingCache = new Map<string, number>();
export function facingOf(file: string, scene: THREE.Object3D) {
  if (!facingCache.has(file)) facingCache.set(file, forwardYaw(scene));
  return facingCache.get(file)!;
}

type Offset = { x: number; y: number; z: number; o: number };

/** One animal from a .glb file. */
function ModelMember({ d, m }: { d: Def; m: Offset }) {
  const { scene, animations } = useGLTF(d.file!);
  const ref = useRef<THREE.Group>(null!);
  const model = useRef<THREE.Group>(null!);

  const face = useMemo(() => facingOf(d.file!, scene), [d.file, scene]);

  const clone = useMemo(() => {
    const c = SkeletonUtils.clone(scene);
    tidy(c);
    return c;
  }, [scene]);

  const { actions } = useAnimations(animations, clone);

  useEffect(() => {
    const names = Object.keys(actions);
    const name = names.find((n) => /swim|fly|move|idle|loop/i.test(n)) ?? names[0];
    const a = name ? actions[name] : null;
    if (a) {
      a.reset().play();
      a.setEffectiveTimeScale(rnd(0.9, 1.2));
      a.time = Math.random() * a.getClip().duration;
    }
    return () => {
      a?.stop();
    };
  }, [actions]);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    ref.current.position.set(m.x + Math.sin(t * 0.7 + m.o) * 0.4, m.y + Math.sin(t * 1.3 + m.o) * 0.15, m.z);
    model.current.rotation.y = face + d.yaw + Math.sin(t * d.w[1] + m.o) * d.w[0];
  });

  return (
    <group ref={ref} scale={d.s}>
      <group ref={model}>
        <primitive object={clone} />
      </group>
    </group>
  );
}

/** One hand-made animal. */
function ProcMember({ d, m }: { d: Def; m: Offset }) {
  const ref = useRef<THREE.Group>(null!);
  const model = useRef<THREE.Group>(null!);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    ref.current.position.set(m.x + Math.sin(t * 0.7 + m.o) * 0.4, m.y + Math.sin(t * 1.3 + m.o) * 0.15, m.z);
    model.current.rotation.y = d.yaw + Math.sin(t * d.w[1] + m.o) * d.w[0];
  });

  return (
    <group ref={ref} scale={d.s}>
      <group ref={model}>{d.proc === "angler" ? <Angler /> : <Snailfish />}</group>
    </group>
  );
}

type Trip = { x: number; y: number; z: number; dir: number; speed: number; halfW: number; wait: number };

function newTrip(d: Def, wait: number, first: boolean): Trip {
  const dir = Math.random() < 0.5 ? 1 : -1;
  const z = rnd(d.z[0], d.z[1]);
  const halfW = (8 - z) * 1.1 + 4 + d.s * 4; // a bit outside the screen edge
  return {
    x: first ? rnd(-0.45, 0.45) * halfW : -dir * halfW, // the very first trip starts on screen
    y: yOfStation(d.id) + rnd(-3, 3), // REAL depth -> world height
    z,
    dir,
    speed: rnd(d.v[0], d.v[1]),
    halfW,
    wait,
  };
}

/** One school / one animal crossing the screen again and again. */
function Route({ d }: { d: Def }) {
  const g = useRef<THREE.Group>(null!);
  const trip = useRef<Trip | null>(null);
  if (!trip.current) trip.current = newTrip(d, rnd(0, 2), true);

  const members = useMemo<Offset[]>(
    () =>
      Array.from({ length: d.per }, () => ({
        x: rnd(-d.spread[0], d.spread[0]),
        y: rnd(-d.spread[1], d.spread[1]),
        z: rnd(-d.spread[2], d.spread[2]),
        o: rnd(0, Math.PI * 2),
      })),
    [d]
  );

  useFrame(({ clock, camera }, delta) => {
    const dt = Math.min(delta, 0.1);
    const s = trip.current!;

    if (s.wait > 0) {
      s.wait -= dt;
      g.current.visible = false;
      return;
    }

    s.x += s.dir * s.speed * dt;
    if (s.dir * s.x > s.halfW) {
      trip.current = newTrip(d, rnd(d.gap[0], d.gap[1]), false);
      g.current.visible = false;
      return;
    }

    // only draw it while the camera is near its depth
    g.current.visible = Math.abs(camera.position.y - s.y) < 9.5
    g.current.position.set(s.x, s.y + Math.sin(clock.elapsedTime * 0.8) * 0.3, s.z);
    g.current.rotation.y = s.dir > 0 ? 0 : Math.PI;
  });

  return (
    <group ref={g} visible={false}>
      {members.map((m, i) => (d.proc ? <ProcMember key={i} d={d} m={m} /> : <ModelMember key={i} d={d} m={m} />))}
    </group>
  );
}

function Sea() {
  return (
    <>
      {DEFS.map((d) => Array.from({ length: d.groups }, (_, i) => <Route key={`${d.id}-${i}`} d={d} />))}
    </>
  );
}

/* ---------------------------- CAMERA + LIGHT ----------------------------- */
function Dive() {
  const sun = useRef<THREE.Group>(null!);
  const light = useRef<THREE.DirectionalLight>(null!);
  const ambient = useRef<THREE.AmbientLight>(null!);
  const lamp = useRef<THREE.PointLight>(null!);

  useFrame(({ camera, pointer, scene, clock }) => {
    const D = depthStore.m; // real depth in meters, from the page
    shared.D = D;

    // camera follows the depth
    const targetY = camY(D) + pointer.y * 0.5;
    camera.position.x += (pointer.x * 1.5 - camera.position.x) * 0.03;
    camera.position.y += (targetY - camera.position.y) * 0.06;
    const sea = smooth(9000, 10900, D); // tilt down to see the seabed at the end
    camera.lookAt(0, camera.position.y - 1.5 - 5 * sea, -10);
    camera.rotateZ(Math.sin(clock.elapsedTime * 0.35) * 0.025);

    // light disappears with REAL depth: ~dark by 1,500 m
    const y = camera.position.y;
    const u = smooth(1.0, -2.0, y);
    const deep = 1 - Math.exp(-D / 450);
    shared.u = u;
    shared.deep = deep;

    shared.fog.copy(HAZE).lerp(WATER, u).lerp(ABYSS, Math.pow(deep, 0.85) * 0.98);

    const fog = scene.fog as THREE.Fog | null;
    if (fog) {
      fog.color.copy(shared.fog);
      fog.far = 70 - u * 25 - deep * 20;
    }

    sun.current.visible = u < 0.5;
    light.current.intensity = 2.4 * (1 - deep) + 0.35;
    ambient.current.intensity = 0.7 * (1 - deep) + 0.3;

    // the "submarine lamp": switches on when it gets dark
    lamp.current.position.copy(camera.position);
    lamp.current.intensity = 450 * smooth(0.25, 0.85, deep);
  });

  return (
    <>
      <ambientLight ref={ambient} intensity={0.7} />
      <directionalLight ref={light} position={[4, 12, 8]} intensity={2.4} color="#fff6e0" />
      <pointLight ref={lamp} color="#cfeeff" distance={0} decay={2} intensity={0} />
      <group ref={sun} position={[11.4, 17, -56.8]}>
        <mesh>
          <sphereGeometry args={[3, 32, 32]} />
          <meshBasicMaterial color="#fffbe6" fog={false} />
        </mesh>
        <mesh>
          <sphereGeometry args={[7, 32, 32]} />
          <meshBasicMaterial
            color="#ffe9b0"
            transparent
            opacity={0.25}
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
      <fog attach="fog" args={["#c3e6f6", 8, 70]} />
      <Dive />
      <Sky />
      <Clouds />
      <Waves />
      <Rays />
      <Bubbles count={220} size={0.3} speed={0.6} />
      <Bubbles count={50} size={0.7} speed={0.45} />
      <Motes count={260} glow={false} />
      <Motes count={160} glow />
      <Jellies />
      <Seabed />
      <Suspense fallback={null}>
        <Sea />
      </Suspense>
    </Canvas>
  );
}