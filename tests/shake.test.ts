import { test } from "node:test";
import assert from "node:assert/strict";
import { createSensorWatchdog, createShakeDetector } from "../frontend/src/utils/shake.js";

const sample = (x: number) => ({ x, y: 0, z: 9.8 });
test("stationary readings, gentle movement and a single bump do not trigger", () => {
  const detect = createShakeDetector();
  for (let t = 0; t < 2000; t += 100) assert.equal(detect(sample(Math.sin(t) * 2), t), false);
  assert.equal(detect(sample(24), 2000), false);
  assert.equal(detect(sample(0), 2100), false);
  assert.equal(detect(sample(0), 2200), false);
});
test("three distinct impulses trigger once, then respect the cooldown", () => {
  const detect = createShakeDetector();
  assert.equal(detect(sample(0), 0), false);
  assert.equal(detect(sample(20), 100), false);
  assert.equal(detect(sample(-20), 220), false);
  assert.equal(detect(sample(20), 340), true);
  for (let t = 440; t < 2800; t += 100) assert.equal(detect(sample(t % 200 ? 20 : -20), t), false);
  assert.equal(detect(sample(0), 3200), false);
  assert.equal(detect(sample(20), 3300), false);
  assert.equal(detect(sample(-20), 3420), false);
  assert.equal(detect(sample(20), 3540), true);
});
test("missing axes and stale motion samples do not invent a gesture", () => {
  const detect = createShakeDetector();
  assert.equal(detect(null, 0), false);
  assert.equal(detect({ x: null, y: 1, z: 1 }, 100), false);
  assert.equal(detect(sample(NaN), 200), false);
  assert.equal(detect(sample(0), 300), false);
  assert.equal(detect(sample(20), 400), false);
  assert.equal(detect(sample(-20), 500), false);
  assert.equal(detect(sample(20), 1500), false);
});

test("closing a modal or returning to the tab cannot bypass the shake cooldown", () => {
  const detect = createShakeDetector();
  detect(sample(0), 0);
  detect(sample(20), 100);
  detect(sample(-20), 220);
  assert.equal(detect(sample(20), 340), true);
  detect.resetSamples();
  for (const [time, x] of [[450, 0], [550, 20], [670, -20], [790, 20]]) {
    assert.equal(detect(sample(x!), time!), false);
  }
  detect.resetSamples();
  for (const [time, x] of [[2490, 0], [2590, 20], [2710, -20], [2830, 20]]) {
    assert.equal(detect(sample(x!), time!), false);
  }
  assert.equal(detect(sample(-20), 2840), false);
  assert.equal(detect(sample(20), 2960), false);
  assert.equal(detect(sample(-20), 3080), true);
});

test("modal and hidden-tab samples cannot complete a partly detected gesture", () => {
  const detect = createShakeDetector();
  detect(sample(0), 0);
  detect(sample(20), 100);
  detect(sample(-20), 220);
  detect.resetSamples();
  assert.equal(detect(sample(20), 340), false);
  assert.equal(detect(sample(-20), 460), false);
  assert.equal(detect(sample(20), 580), false);
  assert.equal(detect(sample(-20), 700), true);
});

test("sensor availability waits only while the page is visible and resumes its remaining time", t => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
  let unavailable = 0;
  const watchdog = createSensorWatchdog(() => unavailable++);
  watchdog.setVisible(false);
  t.mock.timers.tick(10000);
  assert.equal(unavailable, 0);
  watchdog.setVisible(true);
  t.mock.timers.tick(2000);
  watchdog.setVisible(false);
  t.mock.timers.tick(10000);
  assert.equal(unavailable, 0);
  watchdog.setVisible(true);
  t.mock.timers.tick(2999);
  assert.equal(unavailable, 0);
  t.mock.timers.tick(1);
  assert.equal(unavailable, 1);
  watchdog.setVisible(false);
  watchdog.setVisible(true);
  t.mock.timers.tick(5000);
  assert.equal(unavailable, 1);
});

test("a usable sensor reading or hook cleanup permanently cancels the availability warning", t => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
  let unavailable = 0;
  const active = createSensorWatchdog(() => unavailable++);
  const paused = createSensorWatchdog(() => unavailable++);
  active.setVisible(true);
  paused.setVisible(true);
  t.mock.timers.tick(2000);
  paused.setVisible(false);
  active.stop();
  paused.stop();
  active.setVisible(true);
  paused.setVisible(true);
  t.mock.timers.tick(10000);
  assert.equal(unavailable, 0);
});
