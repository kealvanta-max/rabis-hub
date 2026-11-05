"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Environment, MeshTransmissionMaterial } from "@react-three/drei";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import type { Mesh, Group } from "three";
import * as THREE from "three";
import { cn } from "@/lib/utils";

export type FaceIdPhase = "idle" | "scanning" | "success";

export interface AppleFaceIDProps {
  /** Controlled phase. Omit to let the component run its own machine. */
  phase?: FaceIdPhase;
  /** Called with the user's tap — start the camera, request permission, etc. */
  onActivate?: () => void;
  /** Called 1.8s after scanning starts when the component drives itself. */
  onComplete?: () => void;
  size?: number;
  label?: string;
  className?: string;
}

const SCAN_DURATION_MS = 1800;

/** Heavy-liquid spring for the brackets — stiff, but never snappy. */
const BRACKET_SPRING = { type: "spring" as const, stiffness: 300, damping: 22, mass: 0.6 };

/* --------------------------------------------------------------------------
   3D core
   -------------------------------------------------------------------------- */

const PHASE_TINT: Record<FaceIdPhase, { color: THREE.Color; intensity: number; speed: number }> = {
  idle: { color: new THREE.Color("#0b3d2c"), intensity: 0.12, speed: 0.32 },
  scanning: { color: new THREE.Color("#22d3ee"), intensity: 1.35, speed: 1.15 },
  success: { color: new THREE.Color("#34d399"), intensity: 1.6, speed: 0.18 },
};

function GlassCore({ phase, reduceMotion }: { phase: FaceIdPhase; reduceMotion: boolean }) {
  const group = useRef<Group>(null);
  const core = useRef<Mesh>(null);
  const clock = useRef(0);

  // Scratch objects — allocating in useFrame would churn the GC every frame.
  const target = useRef(new THREE.Color("#0b3d2c"));
  const pulse = useRef(1);

  useFrame((_, delta) => {
    const tint = PHASE_TINT[phase];
    const dt = Math.min(delta, 0.05);
    clock.current += dt;

    target.current.copy(tint.color);
    const physical = core.current?.material as THREE.MeshPhysicalMaterial | undefined;
    if (physical?.emissive) {
      physical.emissive.lerp(target.current, 1 - Math.exp(-6 * dt));
      physical.emissiveIntensity = THREE.MathUtils.damp(
        physical.emissiveIntensity ?? 0,
        tint.intensity,
        6,
        dt
      );
    }

    if (group.current) {
      if (!reduceMotion) {
        group.current.rotation.y += dt * tint.speed;
        group.current.rotation.x = Math.sin(clock.current * 0.6) * 0.12;
      }

      // Breathing on idle, a sharpening pulse while scanning, settle on success.
      const wantScale =
        phase === "scanning"
          ? 1 + Math.sin(clock.current * 9) * 0.035
          : phase === "success"
          ? 1.02
          : 1 + (reduceMotion ? 0 : Math.sin(clock.current * 1.1) * 0.012);

      pulse.current = THREE.MathUtils.damp(pulse.current, wantScale, 7, dt);
      group.current.scale.setScalar(pulse.current);
    }
  });

  return (
    <group ref={group}>
      <mesh ref={core}>
        <icosahedronGeometry args={[1, 5]} />
        <MeshTransmissionMaterial
          transmission={1}
          thickness={1.8}
          roughness={0.08}
          ior={1.5}
          chromaticAberration={0.06}
          anisotropy={0.2}
          distortion={0.12}
          distortionScale={0.28}
          temporalDistortion={0.06}
          attenuationDistance={2.4}
          attenuationColor="#0f766e"
          color="#e8fff7"
          samples={4}
          resolution={256}
          background={new THREE.Color("#04150c")}
        />
      </mesh>
    </group>
  );
}

/* --------------------------------------------------------------------------
   2D overlays
   -------------------------------------------------------------------------- */

function CornerBrackets({ phase }: { phase: FaceIdPhase }) {
  const inset = phase === "scanning" ? 12 : 4;

  const corners = [
    { x: 1, y: 1, rotate: 0 },
    { x: -1, y: 1, rotate: 90 },
    { x: -1, y: -1, rotate: 180 },
    { x: 1, y: -1, rotate: 270 },
  ];

  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0">
      {corners.map((corner, index) => (
        <motion.span
          key={index}
          className="absolute h-7 w-7 border-white/80"
          style={{
            top: corner.y > 0 ? inset : undefined,
            bottom: corner.y < 0 ? inset : undefined,
            left: corner.x > 0 ? inset : undefined,
            right: corner.x < 0 ? inset : undefined,
            borderTopWidth: corner.y > 0 ? 2 : 0,
            borderBottomWidth: corner.y < 0 ? 2 : 0,
            borderLeftWidth: corner.x > 0 ? 2 : 0,
            borderRightWidth: corner.x < 0 ? 2 : 0,
            borderTopLeftRadius: corner.x > 0 && corner.y > 0 ? 10 : 0,
            borderTopRightRadius: corner.x < 0 && corner.y > 0 ? 10 : 0,
            borderBottomLeftRadius: corner.x > 0 && corner.y < 0 ? 10 : 0,
            borderBottomRightRadius: corner.x < 0 && corner.y < 0 ? 10 : 0,
          }}
          initial={false}
          animate={{
            opacity: phase === "success" ? 0.35 : 1,
            scale: phase === "scanning" ? 0.92 : 1,
          }}
          transition={BRACKET_SPRING}
        />
      ))}
    </div>
  );
}

function FaceGlyph() {
  return (
    <g stroke="white" strokeWidth={2} strokeLinecap="round" fill="none">
      <path d="M32 44c0-6.6 5.4-12 12-12s12 5.4 12 12" opacity={0.9} />
      <path d="M44 58a12 12 0 1 0-12-12" opacity={0} />
    </g>
  );
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

/**
 * Apple-style Face ID panel.
 *
 * The core is real transmission glass (MeshTransmissionMaterial) with a city
 * environment for studio highlights; the frame is crisp 2D SVG so it stays
 * sharp on any DPR. Everything that moves is either a Framer Motion spring or a
 * damped lerp inside `useFrame` — no CSS transitions, no linear easing.
 *
 * If WebGL is unavailable the glass core is simply replaced by a static tinted
 * disc: the panel keeps working, the member can still tap to start.
 */
export default function AppleFaceID({
  phase: controlledPhase,
  onActivate,
  onComplete,
  size = 240,
  label = "Scan your face",
  className,
}: AppleFaceIDProps) {
  const prefersReducedMotion = useReducedMotion();
  const [internalPhase, setInternalPhase] = useState<FaceIdPhase>("idle");
  const [mounted, setMounted] = useState(false);
  const [webglFailed, setWebglFailed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const phase = controlledPhase ?? internalPhase;

  useEffect(() => {
    // A missing WebGL context would throw inside react-three-fiber; check first
    // so the panel degrades to a static glow instead of crashing the step.
    let supported = false;
    try {
      const canvas = document.createElement("canvas");
      supported = Boolean(
        canvas.getContext("webgl2") || canvas.getContext("webgl")
      );
    } catch {
      supported = false;
    }
    setWebglFailed(!supported);
    setMounted(true);

    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const activate = useCallback(() => {
    if (phase !== "idle") return;
    setInternalPhase("scanning");
    onActivate?.();

    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setInternalPhase("success");
      onComplete?.();
    }, SCAN_DURATION_MS);
  }, [phase, onActivate, onComplete]);

  return (
    <div className={cn("flex flex-col items-center gap-3", className)}>
      <motion.button
        type="button"
        onClick={activate}
        disabled={phase !== "idle"}
        aria-label={phase === "idle" ? label : phase === "scanning" ? "Scanning" : "Scan complete"}
        className="relative overflow-hidden rounded-3xl border border-white/15 bg-black/40 shadow-[0_24px_70px_-30px_rgba(0,0,0,0.9)] backdrop-blur-2xl"
        style={{ width: size, height: size }}
        whileTap={phase === "idle" ? { scale: 0.985 } : undefined}
      >
        {/* 3D liquid glass core */}
        <div className="absolute inset-0">
          {mounted && !webglFailed ? (
            <Canvas
              dpr={[1, 2]}
              camera={{ position: [0, 0, 3.4], fov: 42 }}
              gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
              onCreated={({ gl }) => {
                gl.setClearColor(0x000000, 0);
              }}
            >
              <ambientLight intensity={0.55} />
              <directionalLight position={[3, 4, 5]} intensity={1.6} color="#d8fff2" />
              <directionalLight position={[-4, -2, -3]} intensity={0.7} color="#22d3ee" />
              <Suspense fallback={null}>
                <Environment preset="city" resolution={128} />
              </Suspense>
              <GlassCore phase={phase} reduceMotion={Boolean(prefersReducedMotion)} />
            </Canvas>
          ) : (
            <div
              aria-hidden="true"
              className="absolute inset-6 rounded-full blur-2xl"
              style={{
                background:
                  phase === "success"
                    ? "radial-gradient(circle, rgba(52,211,153,0.55), transparent 70%)"
                    : phase === "scanning"
                    ? "radial-gradient(circle, rgba(34,211,238,0.5), transparent 70%)"
                    : "radial-gradient(circle, rgba(16,185,129,0.32), transparent 70%)",
              }}
            />
          )}
        </div>

        <CornerBrackets phase={phase} />

        {/* Scan sweep */}
        <AnimatePresence>
          {phase === "scanning" && (
            <motion.span
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-6 h-px bg-gradient-to-r from-transparent via-cyan-200/90 to-transparent"
              initial={{ top: "18%", opacity: 0 }}
              animate={{ top: ["18%", "82%", "18%"], opacity: [0, 1, 0] }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
            />
          )}
        </AnimatePresence>

        {/* Face → checkmark */}
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <svg viewBox="0 0 88 88" className="h-16 w-16" aria-hidden="true">
            <AnimatePresence mode="wait" initial={false}>
              {phase === "success" ? (
                <motion.path
                  key="check"
                  d="M24 45.5 38.5 60 64 30"
                  stroke="#6ee7b7"
                  strokeWidth={5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={{ pathLength: 1, opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                />
              ) : (
                <motion.g
                  key="face"
                  initial={{ opacity: 0, scale: 0.94 }}
                  animate={{ opacity: 0.92, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.94 }}
                  transition={{ type: "spring", stiffness: 220, damping: 24 }}
                  style={{ transformOrigin: "44px 44px" }}
                >
                  <FaceGlyph />
                  <circle cx="35" cy="40" r="1.8" fill="white" stroke="none" />
                  <circle cx="53" cy="40" r="1.8" fill="white" stroke="none" />
                </motion.g>
              )}
            </AnimatePresence>
          </svg>
        </div>

        {/* Status pill */}
        <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
          <motion.span
            className={cn(
              "rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em]",
              phase === "success"
                ? "bg-emerald-400/15 text-emerald-300"
                : phase === "scanning"
                ? "bg-cyan-400/15 text-cyan-200"
                : "bg-white/10 text-white/70"
            )}
            animate={{ opacity: 1, y: 0 }}
            initial={false}
          >
            {phase === "success" ? "Verified" : phase === "scanning" ? "Scanning" : "Tap to scan"}
          </motion.span>
        </div>
      </motion.button>

      <p className="max-w-[260px] text-center text-xs leading-relaxed text-gray-400">
        {phase === "success"
          ? "That is you, your identity check is complete."
          : phase === "scanning"
          ? "Hold still while we check you are a real person."
          : label}
      </p>
    </div>
  );
}
