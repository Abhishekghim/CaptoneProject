export function clampSlice(index: number, count: number): number {
  if (count <= 0) return 0;
  return Math.min(count - 1, Math.max(0, Math.round(index)));
}

const DISCRETE_WHEEL_PX = 50;
const TRACKPAD_PX_PER_SLICE = 30;

/**
 * Converts wheel events to slice steps. A mouse-wheel notch (a large single
 * delta, or line/page-mode delta) moves exactly one slice; the stream of
 * small deltas a trackpad produces is accumulated so a steady swipe moves
 * through slices smoothly.
 */
export function createWheelStepper() {
  let accumulated = 0;
  return function step(deltaY: number, deltaMode = 0): number {
    if (deltaY === 0) return 0;
    if (deltaMode !== 0 || Math.abs(deltaY) >= DISCRETE_WHEEL_PX) {
      accumulated = 0;
      return Math.sign(deltaY);
    }
    if (Math.sign(accumulated) !== Math.sign(deltaY)) accumulated = 0;
    accumulated += deltaY;
    const steps = Math.trunc(accumulated / TRACKPAD_PX_PER_SLICE);
    accumulated -= steps * TRACKPAD_PX_PER_SLICE;
    return steps || 0;
  };
}
