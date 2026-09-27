// Builds public/models/anatomy-bodyparts3d.glb from BodyParts3D 4.0 OBJ parts.
// BodyParts3D, © The Database Center for Life Science, CC BY 4.0.
//
// Not part of the app build — kept so the shipped asset can be regenerated.
// In an empty working directory:
//   1. Download from https://dbarchive.biosciencedbc.jp/data/bodyparts3d/LATEST/ :
//      partof_element_parts.txt and partof_BP3D_4.0_obj_99.zip (unzip into ./objs)
//   2. npm i @gltf-transform/core@4 @gltf-transform/functions@4 @gltf-transform/extensions@4 meshoptimizer@0.22
//   3. node build-anatomy-model.mjs <path-to>/public/models/anatomy-bodyparts3d.glb
// The output uses EXT_meshopt_compression (decoded by drei's useGLTF).
import { readFileSync, writeFileSync } from "node:fs";
import { Document, NodeIO } from "@gltf-transform/core";
import { EXTMeshoptCompression, KHRMeshQuantization } from "@gltf-transform/extensions";
import { meshopt, normals, dedup, prune } from "@gltf-transform/functions";
import { MeshoptSimplifier, MeshoptEncoder, MeshoptDecoder } from "meshoptimizer";

const OUT = process.argv[2];
const OBJ_DIR = "objs/partof_BP3D_4.0_obj_99";

const rows = readFileSync("partof_element_parts.txt", "utf8").trim().split(/\r?\n/).slice(1).map((l) => l.split("\t"));
const conceptEls = new Map();
const conceptName = new Map();
for (const [c, n, e] of rows) {
  if (!conceptEls.has(c)) conceptEls.set(c, new Set());
  conceptEls.get(c).add(e);
  conceptName.set(c, n);
}
function mostSpecificName(el) {
  let best = null;
  for (const [c, set] of conceptEls) if (set.has(el) && (!best || set.size < conceptEls.get(best).size)) best = c;
  return conceptName.get(best);
}
const elementsOf = (...ids) => new Set(ids.flatMap((id) => [...(conceptEls.get(id) ?? [])]));

// Bone elements: axial skeleton concept + every limb-bone concept by name.
const LIMB_BONE = /\b(humerus|radius|ulna|femur|patella|tibia|fibula|phalanx|metacarpal|metatarsal|carpal|scaphoid|lunate|triquetr|pisiform|trapezi|capitate|hamate|talus|calcaneus|navicular|cuboid|cuneiform|sesamoid)\b/;
const NOT_BONE = /eyeball|choroid|cornea|iris|lens|sclera|vitreous|lacrimal gland|anterior chamber|suspensory ligament|artery|vein|nerve|muscle|tendon|ligament/;
const boneEls = new Set(conceptEls.get("FMA23876"));
for (const [c, set] of conceptEls) if (set.size === 1 && LIMB_BONE.test(conceptName.get(c)) && !NOT_BONE.test(conceptName.get(c))) set.forEach((e) => boneEls.add(e));

const BONE_GROUPS = [
  ["skull", /frontal|parietal|temporal|occipital|sphenoid|ethmoid|maxilla|mandible|zygomatic|nasal bone|vomer|palatine|lacrimal bone|concha|hyoid/],
  ["vertebral_column", /vertebra|atlas|axis|intervertebral|sacrum|coccyx/],
  ["thoracic_cage", /rib\b|costal|sternum|manubrium|xiphoid/],
  ["pelvic_girdle", /pelvic girdle|hip bone|ilium|ischium|pubis/],
  ["shoulder_girdle", /clavicle|scapula/],
  ["humerus", /humerus/],
  ["forearm_hand", /radius|ulna|phalanx of .*(thumb|finger)|metacarpal|carpal|scaphoid|lunate|triquetr|pisiform|trapezi|capitate|hamate/],
  ["femur", /femur/],
  ["patella", /patella/],
  ["leg", /tibia|fibula/],
  ["foot", /phalanx of .*toe|metatarsal|talus|calcaneus|navicular|cuboid|cuneiform|sesamoid/],
];
const ORGANS = [
  ["brain", ["FMA50801"]],
  ["spinal_cord", ["FMA7647"]],
  ["liver", ["FMA7197"]],
  ["kidneys", ["FMA7204", "FMA7205"]],
  ["pancreas", ["FMA7198"]],
  ["urinary_bladder", ["FMA15900"]],
];

const groups = new Map();
const unassigned = [];
for (const el of boneEls) {
  const name = mostSpecificName(el);
  if (NOT_BONE.test(name)) continue;
  const g = BONE_GROUPS.find(([, re]) => re.test(name));
  if (!g) { unassigned.push(name); continue; }
  if (!groups.has(g[0])) groups.set(g[0], []);
  groups.get(g[0]).push(el);
}
for (const [g, ids] of ORGANS) groups.set(g, [...elementsOf(...ids)]);
if (unassigned.length) console.log("UNASSIGNED bone parts (skipped):", unassigned);

function parseObj(path) {
  const v = [];
  const idx = [];
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    if (line.startsWith("v ")) {
      const [, x, y, z] = line.trim().split(/\s+/);
      v.push(+x, +y, +z);
    } else if (line.startsWith("f ")) {
      const f = line.trim().split(/\s+/).slice(1).map((t) => parseInt(t.split("/")[0], 10) - 1);
      for (let i = 1; i + 1 < f.length; i++) idx.push(f[0], f[i], f[i + 1]);
    }
  }
  return { v, idx };
}

// Merge each group's parts into one position/index buffer.
const merged = new Map();
for (const [g, els] of groups) {
  const pos = [];
  const ind = [];
  for (const el of els) {
    const { v, idx } = parseObj(`${OBJ_DIR}/${el}.obj`);
    const base = pos.length / 3;
    pos.push(...v);
    for (const i of idx) ind.push(i + base);
  }
  merged.set(g, { pos: Float32Array.from(pos), ind: Uint32Array.from(ind) });
}

// Orientation: BodyParts3D is in mm. Pick the axis with the largest skull-to-foot
// separation as "up", and the sternum-minus-spine direction as "anterior".
const centroid = ({ pos }) => { const c = [0, 0, 0]; for (let i = 0; i < pos.length; i += 3) { c[0] += pos[i]; c[1] += pos[i + 1]; c[2] += pos[i + 2]; } return c.map((x) => x / (pos.length / 3)); };
const cs = centroid(merged.get("skull"));
const cf = centroid(merged.get("foot"));
const up = [0, 1, 2].reduce((a, b) => (Math.abs(cs[b] - cf[b]) > Math.abs(cs[a] - cf[a]) ? b : a));
const upSign = Math.sign(cs[up] - cf[up]);
const ct = centroid(merged.get("thoracic_cage"));
const cv = centroid(merged.get("vertebral_column"));
const rest = [0, 1, 2].filter((a) => a !== up);
const fwd = rest.reduce((a, b) => (Math.abs(ct[b] - cv[b]) > Math.abs(ct[a] - cv[a]) ? b : a));
const fwdSign = Math.sign(ct[fwd] - cv[fwd]);
const side = rest.find((a) => a !== fwd);
console.log({ up, upSign, fwd, fwdSign, side });

// Global bounds for centring (in source space).
let min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
for (const { pos } of merged.values()) for (let i = 0; i < pos.length; i += 3) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], pos[i + k]); max[k] = Math.max(max[k], pos[i + k]); }
const mid = min.map((m, k) => (m + max[k]) / 2);

const doc = new Document();
const buffer = doc.createBuffer();
const scene = doc.createScene("anatomy");
const root = doc.createNode("anatomy_root");
scene.addChild(root);
const TARGET_RATIO = { brain: 0.08, liver: 0.12, kidneys: 0.35, pancreas: 0.3, urinary_bladder: 0.4, spinal_cord: 0.4, skull: 0.25, thoracic_cage: 0.15, vertebral_column: 0.2 };
let totalTris = 0;
for (const [g, { pos, ind }] of merged) {
  // Source (mm, arbitrary axes) -> glTF (metres, Y up, +Z anterior, handedness preserved).
  const out = new Float32Array(pos.length);
  for (let i = 0; i < pos.length; i += 3) {
    const s = [pos[i] - mid[0], pos[i + 1] - mid[1], pos[i + 2] - mid[2]];
    out[i] = s[side] * 0.001;
    out[i + 1] = s[up] * upSign * 0.001;
    out[i + 2] = s[fwd] * fwdSign * 0.001;
  }
  // Keep triangle winding outward: flip if the axis remap mirrored the space.
  const m = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  m[0][side] = 1; m[1][up] = upSign; m[2][fwd] = fwdSign;
  const det = m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  let indices = Uint32Array.from(ind);
  if (det < 0) for (let i = 0; i < indices.length; i += 3) { const t = indices[i + 1]; indices[i + 1] = indices[i + 2]; indices[i + 2] = t; }

  await MeshoptSimplifier.ready;
  const ratio = TARGET_RATIO[g] ?? 0.22;
  const target = Math.floor((indices.length * ratio) / 3) * 3;
  const [simplified] = MeshoptSimplifier.simplify(indices, out, 3, target, 0.004);
  // Compact away vertices the simplifier no longer references.
  const remap = new Int32Array(out.length / 3).fill(-1);
  const compactPos = [];
  const compactIdx = new Uint32Array(simplified.length);
  for (let i = 0; i < simplified.length; i++) {
    const v = simplified[i];
    if (remap[v] < 0) { remap[v] = compactPos.length / 3; compactPos.push(out[v * 3], out[v * 3 + 1], out[v * 3 + 2]); }
    compactIdx[i] = remap[v];
  }
  const rawTris = indices.length / 3;
  const P = Float32Array.from(compactPos);
  const N = new Float32Array(P.length);
  for (let i = 0; i < compactIdx.length; i += 3) {
    const a = compactIdx[i] * 3, b = compactIdx[i + 1] * 3, c = compactIdx[i + 2] * 3;
    const e1 = [P[b] - P[a], P[b + 1] - P[a + 1], P[b + 2] - P[a + 2]];
    const e2 = [P[c] - P[a], P[c + 1] - P[a + 1], P[c + 2] - P[a + 2]];
    const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    for (const v of [a, b, c]) { N[v] += n[0]; N[v + 1] += n[1]; N[v + 2] += n[2]; }
  }
  for (let i = 0; i < N.length; i += 3) { const l = Math.hypot(N[i], N[i + 1], N[i + 2]) || 1; N[i] /= l; N[i + 1] /= l; N[i + 2] /= l; }

  const prim = doc.createPrimitive()
    .setAttribute("POSITION", doc.createAccessor().setType("VEC3").setArray(P).setBuffer(buffer))
    .setAttribute("NORMAL", doc.createAccessor().setType("VEC3").setArray(N).setBuffer(buffer))
    .setIndices(doc.createAccessor().setType("SCALAR").setArray(compactIdx).setBuffer(buffer))
    .setMaterial(doc.createMaterial(g).setBaseColorFactor([0.9, 0.88, 0.82, 1]).setRoughnessFactor(0.6));
  const mesh = doc.createMesh(g).addPrimitive(prim);
  mesh.setExtras({ rawTris });
  root.addChild(doc.createNode(g).setMesh(mesh));
}

await MeshoptEncoder.ready;
await doc.transform(dedup(), prune());
for (const mesh of doc.getRoot().listMeshes()) {
  const tris = mesh.listPrimitives()[0].getIndices().getCount() / 3;
  totalTris += tris;
  console.log(mesh.getName().padEnd(18), Math.round(tris), "tris (from", mesh.getExtras().rawTris, ")");
  mesh.setExtras({});
}
console.log("TOTAL", Math.round(totalTris), "tris");

doc.getRoot().setExtras({
  source: "BodyParts3D 4.0 (partof), https://dbarchive.biosciencedbc.jp/en/bodyparts3d/",
  attribution: "BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International",
  license: "https://creativecommons.org/licenses/by/4.0/",
  modifications: "Selected skeletal and organ parts merged into anatomical groups, re-oriented to Y-up metres, mesh-simplified, meshopt-compressed.",
});
doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
await doc.transform(meshopt({ encoder: MeshoptEncoder, level: "medium" }));
const io = new NodeIO().registerExtensions([EXTMeshoptCompression, KHRMeshQuantization]).registerDependencies({ "meshopt.encoder": MeshoptEncoder, "meshopt.decoder": MeshoptDecoder });
const glb = await io.writeBinary(doc);
writeFileSync(OUT, glb);
console.log("wrote", OUT, glb.byteLength, "bytes");
