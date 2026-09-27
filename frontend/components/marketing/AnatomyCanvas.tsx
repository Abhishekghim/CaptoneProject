"use client";

import React, { Component, Suspense, useEffect } from "react";
import { Canvas } from "@react-three/fiber";
import { useProgress } from "@react-three/drei";
import AnatomyModel from "./AnatomyModel";

function LoadReporter({ onProgress, onReady }: { onProgress: (pct: number) => void; onReady: () => void }) {
  const { progress, active, total } = useProgress();
  useEffect(() => {
    onProgress(progress);
    if (!active && total > 0 && progress === 100) onReady();
  }, [progress, active, total, onProgress, onReady]);
  return null;
}

class ModelErrorBoundary extends Component<{ onError: () => void; children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onError();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export default function AnatomyCanvas({
  progress,
  active,
  onError,
  onLoadProgress,
  onReady,
}: {
  progress: React.MutableRefObject<number>;
  active: boolean;
  onError: () => void;
  onLoadProgress: (pct: number) => void;
  onReady: () => void;
}) {
  return (
    <>
    <LoadReporter onProgress={onLoadProgress} onReady={onReady} />
    <Canvas
      // Paused while the section is off-screen.
      frameloop={active ? "always" : "never"}
      dpr={[1, 1.75]}
      camera={{ fov: 30, near: 0.05, far: 50, position: [0, 0, 4] }}
      gl={{ antialias: true, alpha: true, preserveDrawingBuffer: true }}
      onCreated={({ gl }) => gl.setClearColor(0x000000, 0)}
      aria-hidden
    >
      <hemisphereLight args={["#e0f2fe", "#0b1220", 0.9]} />
      <directionalLight position={[2.5, 3, 3]} intensity={2.2} />
      <directionalLight position={[-3, 1.5, -2.5]} intensity={1.1} color="#7dd3fc" />
      <ModelErrorBoundary onError={onError}>
        {/* useGLTF suspends while the model downloads; R3F needs its own
            boundary inside the Canvas tree. */}
        <Suspense fallback={null}>
          <AnatomyModel progress={progress} />
        </Suspense>
      </ModelErrorBoundary>
    </Canvas>
    </>
  );
}
