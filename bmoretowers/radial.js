/* Work out where a photo of the TV Hill towers was taken from.
 *
 * A JavaScript port of radial.py (and the band-building part of map_radials.py)
 * for the browser page. Same method, same numbers; see CLAUDE.md for the details.
 * Works as a plain <script> (exposes window.Radial) and as a Node module.
 *
 * Pixel coordinates are [x, y] with y increasing downward, as in any image editor.
 */
(function (root) {
  "use strict";

  // Tower data: FCC ASR 1035558 (candelabra) and 1044237 (WBFF); ground elevation from USGS EPQS.
  const CANDELABRA_LAT = 39.334722, CANDELABRA_LON = -76.650556;
  const WBFF_LAT = 39.336222, WBFF_LON = -76.649417;
  const CANDELABRA_GROUND_M = 98.0;
  const WBFF_GROUND_M = 81.0;
  const CANDELABRA_TIP_AGL_M = 304.0; // 997 ft
  const WBFF_TIP_AGL_M = 390.0; // 1,280 ft

  const RAD = Math.PI / 180;
  const M_PER_DEG_LAT = 111132.0;
  const M_PER_DEG_LON = 111320.0 * Math.cos(CANDELABRA_LAT * RAD);

  // Local frame: metres east/north of the candelabra, heights above the candelabra's base.
  const WBFF_E = (WBFF_LON - CANDELABRA_LON) * M_PER_DEG_LON;
  const WBFF_N = (WBFF_LAT - CANDELABRA_LAT) * M_PER_DEG_LAT;
  const CANDELABRA_TIP_H = CANDELABRA_TIP_AGL_M;
  const WBFF_TIP_H = WBFF_GROUND_M + WBFF_TIP_AGL_M - CANDELABRA_GROUND_M;

  const FILM_LONG_SIDE_MM = 36.0; // 35 mm-equivalent focal lengths are relative to a 36 mm frame

  // Python-style modulo: the result has the sign of the divisor.
  const mod = (a, m) => ((a % m) + m) % m;
  const wrap = (a) => mod(a + Math.PI, 2 * Math.PI) - Math.PI;
  const median = (xs) => xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)];

  function toLatLon(east, north) {
    return [CANDELABRA_LAT + north / M_PER_DEG_LAT, CANDELABRA_LON + east / M_PER_DEG_LON];
  }

  function fromLatLon(lat, lon) {
    return [(lon - CANDELABRA_LON) * M_PER_DEG_LON, (lat - CANDELABRA_LAT) * M_PER_DEG_LAT];
  }

  /** Bearing (degrees) and distance (m) from the candelabra to a lat/lon. */
  function bearingAndDistance(lat, lon) {
    const [east, north] = fromLatLon(lat, lon);
    return [mod(Math.atan2(east, north) / RAD, 360), Math.hypot(east, north)];
  }

  /** Point at a bearing and distance from the candelabra, as [lat, lon]. */
  function at(bearingDeg, distanceM) {
    const b = bearingDeg * RAD;
    return toLatLon(distanceM * Math.sin(b), distanceM * Math.cos(b));
  }

  /** Angular offset of the WBFF tip from the candelabra tip, as seen from the camera.
   *  Returns [sideways, upward] in radians; sideways is positive when WBFF appears to the right. */
  function predictedAngles(bearingDeg, distanceM, cameraGroundM) {
    const b = bearingDeg * RAD;
    const camE = distanceM * Math.sin(b), camN = distanceM * Math.cos(b);
    const eyeH = cameraGroundM + 1.6 - CANDELABRA_GROUND_M;

    const azC = Math.atan2(-camE, -camN);
    const azW = Math.atan2(WBFF_E - camE, WBFF_N - camN);
    const sideways = wrap(azW - azC);

    const distW = Math.hypot(WBFF_E - camE, WBFF_N - camN);
    const upward = Math.atan2(WBFF_TIP_H - eyeH, distW) - Math.atan2(CANDELABRA_TIP_H - eyeH, distanceM);
    return [sideways, upward];
  }

  /** Find camera bearings consistent with the measured tips, at each distance.
   *  Returns [{distance_m, intervals: [[fromDeg, toDeg], ...], focal_px: [...]}, ...]. */
  function radial(candelabraPx, wbffPx, { cameraGroundM = 80.0, tolerancePx = 3.0, distancesM = null, stepDeg = 0.1 } = {}) {
    const dx = wbffPx[0] - candelabraPx[0];
    const dy = candelabraPx[1] - wbffPx[1]; // image y grows downward
    const length = Math.hypot(dx, dy);
    if (length < 1) throw new Error("The two tips are on top of each other, so there's no direction to measure.");
    const measured = Math.atan2(dx, dy);
    const tolerance = Math.atan2(tolerancePx * Math.SQRT2, length);

    if (!distancesM) {
      distancesM = [];
      for (let i = 0; i < 40; i++) distancesM.push(Math.round(200 * Math.pow(10000 / 200, i / 39)));
    }

    const steps = Math.round(360 / stepDeg);
    const results = [];
    for (const dist of distancesM) {
      const intervals = [], focals = [];
      let current = null;
      for (let i = 0; i <= steps; i++) {
        const b = (i % steps) * stepDeg;
        const [side, up] = predictedAngles(b, dist, cameraGroundM);
        const size = Math.hypot(side, up);
        const ok = size > 0 && Math.abs(wrap(Math.atan2(side, up) - measured)) <= tolerance;
        if (ok && current === null) current = [b, b, []];
        if (ok) {
          current[1] = b;
          current[2].push(length / size);
        } else if (current !== null) {
          intervals.push([current[0], current[1]]);
          focals.push(median(current[2]));
          current = null;
        }
      }
      if (current !== null) {
        if (intervals.length && intervals[0][0] === 0) { // interval wraps through north
          intervals[0] = [current[0], intervals[0][1]];
        } else {
          intervals.push([current[0], current[1]]);
          focals.push(median(current[2]));
        }
      }
      if (intervals.length) results.push({ distance_m: dist, intervals, focal_px: focals });
    }
    return results;
  }

  /** With the focal length known, return candidate fixes [{lat, lon, bearing, distance}]. */
  function locate(candelabraPx, wbffPx, focalPx, cameraGroundM = 80.0) {
    const dx = wbffPx[0] - candelabraPx[0];
    const dy = candelabraPx[1] - wbffPx[1];
    const wantDir = Math.atan2(dx, dy);
    const wantSize = Math.hypot(dx, dy) / focalPx; // angular separation of the tips, radians

    const best = [];
    for (let i = 0; i < 720; i++) {
      const b = i * 0.5;
      for (let j = 0; j < 300; j++) {
        const dist = 150 * Math.pow(12000 / 150, j / 299);
        const [side, up] = predictedAngles(b, dist, cameraGroundM);
        const size = Math.hypot(side, up);
        const err = (Math.abs(wrap(Math.atan2(side, up) - wantDir)) / 0.02) ** 2 + (Math.log(size / wantSize) / 0.05) ** 2;
        if (err <= 4) best.push([err, b, dist]);
      }
    }
    best.sort((p, q) => p[0] - q[0]);
    const fixes = [];
    for (const [, b, dist] of best) {
      if (fixes.every((f) => Math.abs(wrap((b - f.bearing) * RAD)) > 20 * RAD)) {
        const [lat, lon] = at(b, dist);
        fixes.push({ lat, lon, bearing: b, distance: dist });
      }
    }
    return fixes;
  }

  // --- Bands for the map (map_radials.py) ---

  const angDiff = (a, b) => Math.abs(mod(a - b + 180, 360) - 180);

  /** Split radial() rows into continuous bands, one per possible direction.
   *  Each band is a list of {dist, a, b, mid, focal_px}; b may exceed 360 when the band crosses north. */
  function branches(rows) {
    const tracks = [];
    for (const row of rows) {
      row.intervals.forEach(([a, b], k) => {
        const span = mod(b - a, 360);
        const mid = mod(a + span / 2, 360);
        const point = { dist: row.distance_m, a, b: a + span, mid, focal_px: row.focal_px[k] };
        const near = tracks.filter((t) => angDiff(t[t.length - 1].mid, mid) < 25 && t[t.length - 1].dist < row.distance_m);
        if (near.length) {
          near.reduce((x, y) => (angDiff(y[y.length - 1].mid, mid) < angDiff(x[x.length - 1].mid, mid) ? y : x)).push(point);
        } else {
          tracks.push([point]);
        }
      });
    }
    // A band only a few distance steps long is the tail of a curving band, not a real alternative.
    return tracks.filter((t) => t.length >= 5).sort((p, q) => p[0].dist - q[0].dist);
  }

  /** 35 mm-equivalent focal length for a focal length in pixels. */
  function focal35(focalPx, longSidePx) {
    return (focalPx * FILM_LONG_SIDE_MM) / longSidePx;
  }

  const api = {
    CANDELABRA_LAT, CANDELABRA_LON, WBFF_LAT, WBFF_LON,
    CANDELABRA_TIP_H, WBFF_TIP_H, FILM_LONG_SIDE_MM,
    toLatLon, fromLatLon, bearingAndDistance, at, predictedAngles,
    radial, locate, branches, focal35,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Radial = api;
})(typeof self !== "undefined" ? self : this);
