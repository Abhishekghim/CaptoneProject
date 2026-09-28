// Node names in public/models/anatomy-bodyparts3d.glb (built from BodyParts3D —
// see public/models/ANATOMY_MODEL_CREDITS.txt). anatomyChapters.test.ts checks
// every name referenced below actually exists in the shipped asset.
export const BONE_NODES = [
  "skull",
  "vertebral_column",
  "thoracic_cage",
  "pelvic_girdle",
  "shoulder_girdle",
  "humerus",
  "forearm_hand",
  "femur",
  "patella",
  "leg",
  "foot",
] as const;

export const ORGAN_NODES = ["brain", "spinal_cord", "liver", "kidneys", "pancreas", "urinary_bladder"] as const;

export type BoneNode = (typeof BONE_NODES)[number];
export type OrganNode = (typeof ORGAN_NODES)[number];
export type AnatomyNode = BoneNode | OrganNode;

export interface AnatomyChapter {
  id: string;
  /** Short label for the chapter navigation. */
  navLabel: string;
  eyebrow: string;
  title: string;
  paragraphs: string[];
  points?: string[];
  /** Parts tinted as the subject of this chapter. */
  highlight: AnatomyNode[];
  /** Organs made visible; all other organs are hidden. */
  organs: OrganNode[];
  /** Parts the camera frames. Empty = whole body. */
  focus: AnatomyNode[];
  /** Fade non-highlighted bones so internal structures are visible. */
  ghostBones: boolean;
  /** Model rotation about the vertical axis, radians (0 = facing the viewer). */
  yaw: number;
}

export const ANATOMY_CHAPTERS: AnatomyChapter[] = [
  {
    id: "overview",
    navLabel: "Overview",
    eyebrow: "How MRI works",
    title: "Imaging soft tissue without ionising radiation",
    paragraphs: [
      "MRI uses a strong magnetic field — usually 1.5 or 3 tesla — and radio-frequency pulses. Hydrogen nuclei in the body's water and fat respond, and the scanner turns their signal into cross-sectional images.",
      "Because it doesn't use X-rays, MRI involves no ionising radiation. Its strength is contrast between soft tissues: brain, spinal cord, ligaments, cartilage and abdominal organs that X-ray and CT show less clearly.",
    ],
    highlight: [],
    organs: [],
    focus: [],
    ghostBones: false,
    yaw: 0.45,
  },
  {
    id: "brain",
    navLabel: "Brain",
    eyebrow: "Neuro MRI",
    title: "Brain",
    paragraphs: [
      "MRI is the preferred test for many brain conditions because it separates grey matter, white matter and fluid in detail CT can't match.",
    ],
    points: [
      "Diffusion-weighted imaging is highly sensitive to acute ischaemic stroke.",
      "White-matter lesions in multiple sclerosis, and brain tumours, are assessed and followed up with MRI.",
      "Dedicated protocols target the pituitary gland and the inner-ear nerves.",
    ],
    highlight: ["brain"],
    organs: ["brain"],
    focus: ["skull"],
    ghostBones: true,
    yaw: -0.65,
  },
  {
    id: "spine",
    navLabel: "Spine",
    eyebrow: "Spine MRI",
    title: "Spine and spinal cord",
    paragraphs: [
      "The vertebrae protect the spinal cord and the nerve roots that leave it. MRI shows the intervertebral discs, cord and nerves directly — soft tissues a plain X-ray can't show.",
    ],
    points: [
      "Disc herniation and narrowing of the canal compressing nerve roots.",
      "Spinal cord compression, inflammation, infection and tumours.",
      "Urgent MRI when cauda equina syndrome is suspected.",
    ],
    highlight: ["vertebral_column", "spinal_cord"],
    organs: ["spinal_cord"],
    focus: ["skull", "vertebral_column"],
    ghostBones: true,
    yaw: Math.PI * 0.82,
  },
  {
    id: "joints",
    navLabel: "Joints",
    eyebrow: "Musculoskeletal MRI",
    title: "Shoulders, hips and knees",
    paragraphs: [
      "Joint MRI images the structures that hold bones together and let them move — the parts that are invisible on X-ray.",
    ],
    points: [
      "Knee: cruciate and collateral ligaments, menisci and cartilage.",
      "Shoulder: rotator-cuff tendons and the labrum.",
      "Bone-marrow oedema from bruising or stress fractures an X-ray can miss.",
    ],
    highlight: ["shoulder_girdle", "humerus", "femur", "patella", "leg"],
    organs: [],
    focus: ["shoulder_girdle", "femur", "patella"],
    ghostBones: true,
    yaw: -0.95,
  },
  {
    id: "abdomen",
    navLabel: "Abdomen & pelvis",
    eyebrow: "Body MRI",
    title: "Abdomen and pelvis",
    paragraphs: [
      "Body MRI characterises solid organs and the structures of the pelvis. Many abdominal sequences are acquired during short breath-holds.",
    ],
    points: [
      "Liver lesions, and the kidneys and pancreas.",
      "MRCP shows the bile and pancreatic ducts without injected contrast.",
      "Pelvic MRI for prostate assessment, gynaecological conditions and rectal cancer staging.",
    ],
    highlight: ["liver", "kidneys", "pancreas", "urinary_bladder", "pelvic_girdle"],
    organs: ["liver", "kidneys", "pancreas", "urinary_bladder"],
    focus: ["liver", "kidneys", "pelvic_girdle"],
    ghostBones: true,
    yaw: 0.35,
  },
  {
    id: "safety",
    navLabel: "Safety",
    eyebrow: "Before your scan",
    title: "The magnet is always on",
    paragraphs: [
      "Safety screening happens before every MRI. Some implants are MR Conditional — safe only under specific scanner conditions — and some are MR Unsafe.",
    ],
    points: [
      "Tell us about pacemakers, defibrillators, cochlear implants, metal fragments and recent surgery.",
      "If gadolinium contrast is planned, your kidney function may be checked first.",
      "Anxious in enclosed spaces? Tell us when you book so we can plan your scan with you.",
    ],
    highlight: [],
    organs: [],
    focus: [],
    ghostBones: false,
    yaw: 0.45 + Math.PI * 2,
  },
];
