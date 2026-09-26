// Static UI option lists — not mock data. These were originally colocated
// with the mock seed data in frontend/lib/seed.ts; they've been moved here
// now that seed.ts (and the mock store it fed) has been removed, since
// booking/registration forms still need a fixed vocabulary of time slots,
// locations, body parts, scan protocols, and payment types to populate
// their <select> options.
export const TIME_SLOTS = ["08:00", "09:00", "10:30", "11:30", "13:00", "14:00", "15:30", "16:30"];
export const LOCATIONS = ["Sydney CBD Clinic", "Parramatta Imaging", "Chatswood Centre"];
export const BODY_PARTS = ["Brain", "Cervical Spine", "Lumbar Spine", "Shoulder", "Right Knee", "Left Knee", "Abdomen", "Pelvis"];
export const PROTOCOLS = [
  "T1/T2 sagittal + axial gradient echo",
  "T2 FLAIR + DWI, axial/sagittal",
  "PD fat-sat + T2 coronal (joint)",
  "T1 post-contrast volumetric",
];

// Reception Portal — controlled payment-type vocabulary (Billing.payment_method
// already accepts any string; this is what the UI offers instead of free text).
export const PAYMENT_TYPES = ["Medicare", "Private", "DVA", "Workers Compensation", "Third Party", "Self-funded", "Other"];
