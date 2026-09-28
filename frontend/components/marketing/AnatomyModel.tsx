"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { ANATOMY_CHAPTERS, BONE_NODES, ORGAN_NODES, type AnatomyChapter, type AnatomyNode } from "./anatomyChapters";

export const ANATOMY_MODEL_URL = "/models/anatomy-bodyparts3d.glb";

const BONE_COLOR = new THREE.Color("#e9e2d2");
const HIGHLIGHT_COLOR = new THREE.Color("#38bdf8");
const HIGHLIGHT_EMISSIVE = new THREE.Color("#0ea5e9");
const ORGAN_COLOR: Record<string, string> = {
  brain: "#e8b4ab",
  spinal_cord: "#f4d58d",
  liver: "#9c4a3a",
  kidneys: "#b0584a",
  pancreas: "#e4c08c",
  urinary_bladder: "#d9a86c",
};
const FOV = 30;

type Part = { name: AnatomyNode; isOrgan: boolean; material: THREE.MeshStandardMaterial; object: THREE.Object3D };
type Framing = { center: THREE.Vector3; distance: number };

const HEADER_PX = 64;
// Bottom of the section heading on narrow screens, where it sits above the model.
const MOBILE_HEADING_BOTTOM_PX = 210;

/**
 * The part of the screen the model may occupy, as fractions of the viewport:
 * right of the chapter card on desktop, above it on narrow screens, and always
 * below the sticky site header.
 */
function freeRegion(width: number, height: number) {
  const top = Math.min(0.2, HEADER_PX / height);
  if (width >= 1024) {
    return { cx: 0.64, cy: (top + 1) / 2, fx: 0.4, fy: (1 - top) * 0.9 };
  }
  const bottom = 0.56;
  const mobileTop = Math.min(0.3, MOBILE_HEADING_BOTTOM_PX / height);
  return { cx: 0.5, cy: (mobileTop + bottom) / 2, fx: 0.92, fy: (bottom - mobileTop) * 0.92 };
}

function targetOpacity(part: Part, chapter: AnatomyChapter, highlighted: boolean) {
  if (part.isOrgan) return (chapter.organs as string[]).includes(part.name) ? 0.97 : 0;
  return chapter.ghostBones && !highlighted ? 0.14 : 1;
}

function smoothstep(t: number) {
  return t * t * (3 - 2 * t);
}

// draco disabled: the asset uses meshopt only, and drei's draco path would
// pull decoders from an external CDN.
useGLTF.preload(ANATOMY_MODEL_URL, false, true);

/**
 * `progress` is written by the scroll handler (0 at the first chapter, 1 at
 * the last) and read every frame, so scrolling never re-renders React.
 */
export default function AnatomyModel({ progress }: { progress: React.MutableRefObject<number> }) {
  const { scene } = useGLTF(ANATOMY_MODEL_URL, false, true);
  const model = useMemo(() => scene.clone(true), [scene]);
  const pivot = useRef<THREE.Group>(null);
  const { camera, size } = useThree();

  const parts = useMemo(() => {
    const list: Part[] = [];
    for (const name of [...BONE_NODES, ...ORGAN_NODES]) {
      const object = model.getObjectByName(name);
      if (!object) continue;
      const isOrgan = (ORGAN_NODES as readonly string[]).includes(name);
      const material = new THREE.MeshStandardMaterial({
        color: isOrgan ? new THREE.Color(ORGAN_COLOR[name]) : BONE_COLOR.clone(),
        roughness: isOrgan ? 0.45 : 0.62,
        metalness: 0,
        transparent: true,
        opacity: isOrgan ? 0 : 1,
        emissive: HIGHLIGHT_EMISSIVE.clone(),
        emissiveIntensity: 0,
      });
      object.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh) mesh.material = material;
      });
      object.visible = !isOrgan;
      list.push({ name: name as AnatomyNode, isOrgan, material, object });
    }
    return list;
  }, [model]);

  useEffect(() => () => parts.forEach((p) => p.material.dispose()), [parts]);

  // Camera framing per chapter, from the real bounding boxes of the parts it
  // focuses on (model space, before any rotation).
  const region = useMemo(() => freeRegion(size.width, size.height), [size.width, size.height]);

  const framings = useMemo<Framing[]>(() => {
    model.updateMatrixWorld(true);
    const byName = new Map(parts.map((p) => [p.name, p.object]));
    const whole = new THREE.Box3().setFromObject(model);
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    const aspect = size.width / Math.max(1, size.height);
    return ANATOMY_CHAPTERS.map((chapter) => {
      const box = new THREE.Box3();
      for (const name of chapter.focus) {
        const o = byName.get(name);
        if (o) box.expandByObject(o);
      }
      const b = box.isEmpty() ? whole : box;
      const s = b.getSize(new THREE.Vector3());
      // The model turns, so budget for its depth as well as its width.
      const halfW = Math.max(s.x, s.z, 0.2) / 2;
      const halfH = Math.max(s.y, 0.2) / 2;
      const margin = chapter.focus.length ? 1.25 : 1.06;
      const distance = Math.max(halfH / (tanHalf * region.fy), halfW / (tanHalf * aspect * region.fx)) * margin;
      return { center: b.getCenter(new THREE.Vector3()), distance };
    });
  }, [model, parts, region, size.width, size.height]);

  // Shift the projection so the model's framing centre lands in the free region.
  useEffect(() => {
    const cam = camera as THREE.PerspectiveCamera;
    cam.setViewOffset(
      size.width,
      size.height,
      (0.5 - region.cx) * size.width,
      (0.5 - region.cy) * size.height,
      size.width,
      size.height
    );
    cam.fov = FOV;
    cam.updateProjectionMatrix();
    return () => cam.clearViewOffset();
  }, [camera, region, size.width, size.height]);

  const lookAt = useRef(new THREE.Vector3());
  const scratch = useMemo(() => ({ center: new THREE.Vector3(), pos: new THREE.Vector3(), axis: new THREE.Vector3(0, 1, 0) }), []);

  useFrame((_, dt) => {
    const last = ANATOMY_CHAPTERS.length - 1;
    const f = THREE.MathUtils.clamp(progress.current, 0, 1) * last;
    const i0 = Math.floor(f);
    const i1 = Math.min(i0 + 1, last);
    const t = smoothstep(f - i0);
    const a = ANATOMY_CHAPTERS[i0];
    const b = ANATOMY_CHAPTERS[i1];
    const active = ANATOMY_CHAPTERS[Math.round(f)];
    const k = Math.min(1, dt * 4);

    const yaw = THREE.MathUtils.lerp(a.yaw, b.yaw, t);
    if (pivot.current) pivot.current.rotation.y = THREE.MathUtils.damp(pivot.current.rotation.y, yaw, 5, dt);
    const currentYaw = pivot.current?.rotation.y ?? yaw;

    scratch.center.lerpVectors(framings[i0].center, framings[i1].center, t).applyAxisAngle(scratch.axis, currentYaw);
    const distance = THREE.MathUtils.lerp(framings[i0].distance, framings[i1].distance, t);
    scratch.pos.set(scratch.center.x, scratch.center.y + distance * 0.08, scratch.center.z + distance);
    camera.position.lerp(scratch.pos, k);
    lookAt.current.lerp(scratch.center, k);
    camera.lookAt(lookAt.current);

    for (const part of parts) {
      const highlighted = active.highlight.includes(part.name);
      const opacity = targetOpacity(part, active, highlighted);
      const m = part.material;
      m.opacity = THREE.MathUtils.lerp(m.opacity, opacity, k);
      m.emissiveIntensity = THREE.MathUtils.lerp(m.emissiveIntensity, highlighted && !part.isOrgan ? 0.35 : 0, k);
      if (!part.isOrgan) m.color.lerp(highlighted ? HIGHLIGHT_COLOR : BONE_COLOR, k);
      // Faded parts must not hide what's behind them in the depth buffer.
      m.depthWrite = m.opacity > 0.9;
      part.object.visible = m.opacity > 0.01;
    }
  });

  return (
    <group ref={pivot}>
      <primitive object={model} />
    </group>
  );
}
