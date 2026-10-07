// Checks radial.js against photos whose camera location is known (mirrors test_radial.py).
// Run: node --test

const test = require("node:test");
const assert = require("node:assert");
const R = require("./radial.js");

// Measured tip pixels from photos/ (see CLAUDE.md), with locations confirmed independently.
const MEDFIELD_REC = [39.340491, -76.645218]; // photo-10: "Medfield Recreation" sign in frame
const WOODBERRY_STATION = [39.331186, -76.643397]; // photo-06: caption says light rail in Woodberry

function covers(results, bearing, distance, slackDeg = 3.0) {
  const row = results.reduce((x, y) => (Math.abs(y.distance_m - distance) < Math.abs(x.distance_m - distance) ? y : x));
  return row.intervals.some(([a, b]) => a - slackDeg <= bearing && bearing <= b + slackDeg);
}

const near = (actual, expected, delta) => assert.ok(Math.abs(actual - expected) <= delta, `${actual} not within ${delta} of ${expected}`);

test("tower baseline", () => {
  const [b, d] = R.bearingAndDistance(R.WBFF_LAT, R.WBFF_LON);
  near(b, 30.5, 0.2);
  near(d, 193, 2);
});

test("WBFF tip is 69 m higher", () => {
  near(R.WBFF_TIP_H - R.CANDELABRA_TIP_H, 69, 1);
});

test("side of baseline", () => {
  // Due east of the towers, looking west: WBFF (to the north) appears on the right.
  let [side, up] = R.predictedAngles(90, 2000, 80);
  assert.ok(side > 0 && up > 0);
  [side] = R.predictedAngles(270, 2000, 80);
  assert.ok(side < 0);
});

test("photo-10 Medfield", () => {
  const [bearing, dist] = R.bearingAndDistance(...MEDFIELD_REC);
  assert.ok(covers(R.radial([145, 100], [160, 42], { cameraGroundM: 83 }), bearing, dist), `${bearing} ${dist}`);
});

test("photo-06 Woodberry", () => {
  const [bearing, dist] = R.bearingAndDistance(...WOODBERRY_STATION);
  assert.ok(covers(R.radial([360, 65], [608, 8], { cameraGroundM: 60 }), bearing, dist), `${bearing} ${dist}`);
});

test("wrong side is rejected", () => {
  // Swap the tips: WBFF now on the left, so the camera must be west of the hill.
  const west = (x) => x >= 205 || x <= 35; // the 30.5°/210.5° baseline, plus slack
  for (const row of R.radial([160, 100], [145, 42])) {
    for (const [a, b] of row.intervals) assert.ok(west(a) && west(b), `${row.distance_m} ${a} ${b}`);
  }
});

test("known focal length gives a fix near photo-06's camera", () => {
  // photo-06 implies a ~30 mm-equivalent lens on its 1024 px long side.
  const fixes = R.locate([360, 65], [608, 8], (30 * 1024) / 36, 60);
  const [bearing, dist] = R.bearingAndDistance(...WOODBERRY_STATION);
  assert.ok(fixes.some((f) => Math.abs(f.bearing - bearing) < 10 && Math.abs(f.distance - dist) < 300), JSON.stringify(fixes));
});
