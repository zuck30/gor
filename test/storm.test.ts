import assert from "assert";
import { STORM_PHASES, STORM_START_RADIUS, TICK_RATE } from "../src/shared/constants.js";
import {
  applyDamage,
  lerpCircle,
  nextCircle,
  stormDamage,
  type Circle,
} from "../src/shared/storm.js";

/** Small deterministic PRNG so circle placement never flakes. */
function seeded(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

describe("storm", () => {
  const start: Circle = { x: 500, y: 500, radius: STORM_START_RADIUS };

  it("keeps every phase inside the previous circle", () => {
    const rng = seeded(7);
    let previous = start;

    for (const phase of STORM_PHASES) {
      const next = nextCircle(previous, phase.radius, rng);
      const offset = Math.hypot(next.x - previous.x, next.y - previous.y);

      assert.ok(
        offset + next.radius <= previous.radius + 1e-9,
        `phase ${phase.radius} escaped the previous circle`
      );
      previous = next;
    }

    assert.strictEqual(previous.radius, STORM_PHASES[STORM_PHASES.length - 1].radius);
  });

  it("interpolates centre and radius between circles", () => {
    const target: Circle = { x: 600, y: 400, radius: 100 };

    assert.deepStrictEqual(lerpCircle(start, target, 0), start);
    assert.deepStrictEqual(lerpCircle(start, target, 1), target);
    assert.deepStrictEqual(lerpCircle(start, target, 0.5), { x: 550, y: 450, radius: 430 });
  });

  it("charges damage only outside the circle", () => {
    assert.strictEqual(stormDamage(start, 500, 500, 5, 1 / TICK_RATE), 0);
    assert.strictEqual(stormDamage(start, 500 + STORM_START_RADIUS, 500, 5, 1), 0);
    assert.strictEqual(stormDamage(start, 500 + STORM_START_RADIUS + 1, 500, 5, 1), 5);
  });

  it("floors health at zero", () => {
    assert.strictEqual(applyDamage(3, 1.5), 1.5);
    assert.strictEqual(applyDamage(0.5, 5), 0);
  });
});
