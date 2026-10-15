type Acceleration = { x: number | null; y: number | null; z: number | null };

/** Require repeated impulses, then cool down so a single jolt never opens the card. */
export function createShakeDetector() {
  let previous: number[] | null = null;
  let previousAt = 0;
  let impulses: number[] = [];
  let lastImpulse = -Infinity;
  let lastTrigger = -Infinity;
  const detect = (sample: Acceleration | null, now: number): boolean => {
    if (!sample || [sample.x, sample.y, sample.z].some(v => v === null || !Number.isFinite(v))) return false;
    const current = [sample.x!, sample.y!, sample.z!];
    const before = previous;
    const gap = now - previousAt;
    previous = current;
    previousAt = now;
    if (!before || gap > 400 || now - lastTrigger < 2500) {
      impulses = [];
      return false;
    }
    const change = Math.hypot(...current.map((v, i) => v - before[i]!));
    if (change < 15 || now - lastImpulse < 90) return false;
    lastImpulse = now;
    impulses = [...impulses.filter(t => now - t < 850), now];
    if (impulses.length < 3) return false;
    lastTrigger = now;
    impulses = [];
    return true;
  };
  return Object.assign(detect, {
    resetSamples() {
      previous = null;
      previousAt = 0;
      impulses = [];
      lastImpulse = -Infinity;
      // Keep the cooldown across modal and visibility transitions.
    },
  });
}

/** Allow five seconds of visible time for the first usable sensor reading. */
export function createSensorWatchdog(onUnavailable: () => void) {
  let remaining = 5000;
  let startedAt = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  function pause() {
    if (timer === undefined) return;
    clearTimeout(timer);
    timer = undefined;
    remaining = Math.max(0, remaining - Math.max(0, Date.now() - startedAt));
  }
  return {
    setVisible(visible: boolean) {
      if (stopped) return;
      if (!visible) { pause(); return; }
      if (timer !== undefined) return;
      startedAt = Date.now();
      timer = setTimeout(() => {
        timer = undefined;
        stopped = true;
        onUnavailable();
      }, remaining);
    },
    stop() {
      stopped = true;
      pause();
    },
  };
}
