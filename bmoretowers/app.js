/* Page logic: photo viewer for marking the two tower tips, and the map of possible camera positions.
 * The geometry lives in radial.js. */
(function () {
  "use strict";
  const R = window.Radial;
  const $ = (id) => document.getElementById(id);

  // Sample photos with tips measured by hand (photos/measurements.csv) and credits (photos/CREDITS.md).
  const SAMPLES = [
    { id: "01", c: [213, 305], w: [461, 243], title: "P7240339", by: "wfyurasko", lic: "CC BY 2.0", url: "https://www.flickr.com/photos/55676959@N00/4826738728" },
    { id: "02", c: [383, 343], w: [681, 180], title: "wjztv tower", by: "Vox Efx", lic: "CC BY 2.0", url: "https://www.flickr.com/photos/39096030@N00/3163645904" },
    { id: "04", c: [237, 207], w: [480, 112], title: "Television Hill Towers", by: "jonlesser", lic: "CC BY-NC-SA 2.0", url: "https://www.flickr.com/photos/21153776@N00/2747985397" },
    { id: "05", c: [411, 185], w: [538, 120], title: "DSC01337", by: "sevensixfive", lic: "CC BY-NC-SA 2.0", url: "https://www.flickr.com/photos/23323808@N00/2188329770" },
    { id: "06", c: [360, 65], w: [608, 8], ground: 60, known: [39.331186, -76.643397, "Woodberry light rail station"],
      title: "P1080472", by: "skabat169", lic: "CC BY-NC-SA 2.0", url: "https://www.flickr.com/photos/44144211@N07/6991230835" },
    { id: "07", c: [243, 232], w: [289, 185], title: "31 views of 2 towers", by: "Bill Mill (llimllib)", lic: "CC BY-NC-SA 2.0", url: "https://www.flickr.com/photos/64114626@N00/4323776365" },
    { id: "08", c: [262, 307], w: [499, 145], title: "TV Hill, Baltimore", by: "compton.m", lic: "CC BY-NC-ND 2.0", url: "https://www.flickr.com/photos/21643631@N05/3296518302" },
    { id: "09", c: [348, 300], w: [607, 237], title: "P7240433", by: "wfyurasko", lic: "CC BY 2.0", url: "https://www.flickr.com/photos/55676959@N00/4826160817" },
    { id: "10", c: [145, 100], w: [160, 42], longSide: 310, ground: 83, known: [39.340491, -76.645218, "Medfield Heights Rec Center"],
      note: "A collage of three panels; the tips are marked in the left panel, so the long side is one panel's.",
      title: "31 views of 2 towers #1-3: About Space", by: "Bill Mill (llimllib)", lic: "CC BY-NC-SA 2.0", url: "https://www.flickr.com/photos/64114626@N00/4380566111" },
  ];

  const LICENSE_URLS = {
    "CC BY 2.0": "https://creativecommons.org/licenses/by/2.0/",
    "CC BY-NC 2.0": "https://creativecommons.org/licenses/by-nc/2.0/",
    "CC BY-NC-SA 2.0": "https://creativecommons.org/licenses/by-nc-sa/2.0/",
    "CC BY-NC-ND 2.0": "https://creativecommons.org/licenses/by-nc-nd/2.0/",
  };

  const state = {
    img: null,
    w: 0, h: 0,               // natural image size
    scale: 1, ox: 0, oy: 0,   // view transform: screen = image * scale + offset (CSS px)
    pts: { c: null, w: null },
    active: "c",
    known: null,              // [lat, lon, label] of the true camera spot, for samples
    exifGps: null,            // [lat, lon] from the photo's EXIF
    refitMap: false,          // zoom the map to the results on the next compute (new photo)
  };

  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));

  // ---------------------------------------------------------------- photo viewer

  const viewer = $("viewer"), canvas = $("photo"), ctx = canvas.getContext("2d");
  const loupe = $("loupe"), lctx = loupe.getContext("2d");

  function resizeCanvas() {
    const r = viewer.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(r.width * dpr);
    canvas.height = Math.round(r.height * dpr);
    draw();
  }

  function fit() {
    if (!state.img) return;
    const r = viewer.getBoundingClientRect();
    state.scale = Math.min(r.width / state.w, r.height / state.h);
    state.ox = (r.width - state.w * state.scale) / 2;
    state.oy = (r.height - state.h * state.scale) / 2;
    draw();
  }

  const fitScale = () => {
    const r = viewer.getBoundingClientRect();
    return Math.min(r.width / state.w, r.height / state.h);
  };

  function zoomAt(sx, sy, factor) {
    const s = Math.min(Math.max(state.scale * factor, fitScale() * 0.5), 32);
    const f = s / state.scale;
    state.ox = sx - (sx - state.ox) * f;
    state.oy = sy - (sy - state.oy) * f;
    state.scale = s;
    draw();
  }

  const toImage = (sx, sy) => [(sx - state.ox) / state.scale, (sy - state.oy) / state.scale];
  const toScreen = (ix, iy) => [ix * state.scale + state.ox, iy * state.scale + state.oy];

  function drawMarker(key, color, label) {
    const p = state.pts[key];
    if (!p) return;
    const [x, y] = toScreen(p[0], p[1]);
    const active = state.active === key;
    ctx.save();
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(0,0,0,.55)";
    const cross = () => {
      ctx.beginPath();
      ctx.arc(x, y, 11, 0, 2 * Math.PI);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        ctx.moveTo(x + dx * 4, y + dy * 4);
        ctx.lineTo(x + dx * 18, y + dy * 18);
      }
      ctx.stroke();
    };
    cross();
    ctx.lineWidth = active ? 2 : 1.5;
    ctx.strokeStyle = color;
    cross();
    ctx.font = "600 12px system-ui, sans-serif";
    const tw = ctx.measureText(label).width;
    ctx.fillStyle = "rgba(0,0,0,.65)";
    ctx.fillRect(x + 14, y - 30, tw + 10, 18);
    ctx.fillStyle = "#fff";
    ctx.fillText(label, x + 19, y - 17);
    ctx.restore();
  }

  function draw() {
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!state.img) return;
    ctx.setTransform(dpr * state.scale, 0, 0, dpr * state.scale, dpr * state.ox, dpr * state.oy);
    ctx.imageSmoothingEnabled = state.scale < 3; // show real pixels when zoomed in
    ctx.drawImage(state.img, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawMarker("c", css("--accent"), "Candelabra");
    drawMarker("w", css("--wbff"), "WBFF");
  }

  function drawLoupe(ix, iy) {
    if (!state.img) return;
    const zoom = Math.max(6, state.scale * 3); // screen px per image px inside the loupe
    const size = loupe.width, half = size / 2 / zoom;
    lctx.imageSmoothingEnabled = false;
    lctx.fillStyle = "#000";
    lctx.fillRect(0, 0, size, size);
    lctx.drawImage(state.img, ix - half, iy - half, half * 2, half * 2, 0, 0, size, size);
    for (const [key, color] of [["c", css("--accent")], ["w", css("--wbff")]]) {
      const p = state.pts[key];
      if (!p) continue;
      const x = size / 2 + (p[0] - ix) * zoom, y = size / 2 + (p[1] - iy) * zoom;
      lctx.strokeStyle = color;
      lctx.lineWidth = 2;
      lctx.beginPath();
      lctx.arc(x, y, 6, 0, 2 * Math.PI);
      lctx.stroke();
    }
    lctx.strokeStyle = "rgba(255,255,255,.9)";
    lctx.lineWidth = 1;
    lctx.beginPath();
    lctx.moveTo(size / 2, 0); lctx.lineTo(size / 2, size / 2 - 6);
    lctx.moveTo(size / 2, size / 2 + 6); lctx.lineTo(size / 2, size);
    lctx.moveTo(0, size / 2); lctx.lineTo(size / 2 - 6, size / 2);
    lctx.moveTo(size / 2 + 6, size / 2); lctx.lineTo(size, size / 2);
    lctx.stroke();
    loupe.style.display = "block";
  }

  function setPoint(key, ix, iy) {
    ix = Math.min(Math.max(ix, 0), state.w);
    iy = Math.min(Math.max(iy, 0), state.h);
    state.pts[key] = [Math.round(ix * 10) / 10, Math.round(iy * 10) / 10];
    updateTips();
    draw();
    scheduleCompute();
  }

  function setActive(key) {
    state.active = key;
    document.querySelectorAll(".tip").forEach((b) => b.classList.toggle("active", b.dataset.tip === key));
    updateHint();
    draw();
  }

  function updateTips() {
    for (const key of ["c", "w"]) {
      const p = state.pts[key];
      $("pos-" + key).textContent = p ? `x ${p[0].toFixed(1)}, y ${p[1].toFixed(1)}` : "not placed";
    }
    updateHint();
  }

  function updateHint() {
    let text;
    if (!state.img) text = "Choose a photo to start.";
    else if (!state.pts.c && !state.pts.w) text = "Click the top of the candelabra's tallest mast.";
    else if (!state.pts.w) text = state.active === "w" ? "Now click the tip of the WBFF mast." : "Click to move the candelabra tip, or select the WBFF tip.";
    else if (!state.pts.c) text = "Click the top of the candelabra's tallest mast.";
    else text = `Click or drag to adjust the ${state.active === "c" ? "candelabra" : "WBFF"} tip. Zoom in for precision.`;
    $("hint").textContent = text;
  }

  // Pointer handling: tap places the selected tip, drag pans (or moves a marker you grabbed), two fingers pinch-zoom.
  const pointers = new Map();
  let gesture = null;

  function localXY(e) {
    const r = viewer.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }

  function markerUnder(sx, sy) {
    let best = null, bestD = 16;
    for (const key of ["c", "w"]) {
      const p = state.pts[key];
      if (!p) continue;
      const [x, y] = toScreen(p[0], p[1]);
      const d = Math.hypot(x - sx, y - sy);
      if (d < bestD) { best = key; bestD = d; }
    }
    return best;
  }

  viewer.addEventListener("pointerdown", (e) => {
    if (!state.img || e.target.closest(".zoom")) return;
    viewer.setPointerCapture(e.pointerId);
    const [sx, sy] = localXY(e);
    pointers.set(e.pointerId, [sx, sy]);
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      gesture = { type: "pinch", dist: Math.hypot(a[0] - b[0], a[1] - b[1]), mid: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] };
      return;
    }
    const grab = markerUnder(sx, sy);
    if (grab) {
      setActive(grab);
      const p = state.pts[grab], [mx, my] = toScreen(p[0], p[1]);
      gesture = { type: "marker", key: grab, dx: mx - sx, dy: my - sy };
      drawLoupe(p[0], p[1]);
    } else {
      gesture = { type: "tap", start: [sx, sy], ox: state.ox, oy: state.oy };
    }
  });

  viewer.addEventListener("pointermove", (e) => {
    if (!state.img) return;
    const [sx, sy] = localXY(e);
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, [sx, sy]);

    if (gesture && gesture.type === "pinch" && pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const dist = Math.hypot(a[0] - b[0], a[1] - b[1]), mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      state.ox += mid[0] - gesture.mid[0];
      state.oy += mid[1] - gesture.mid[1];
      zoomAt(mid[0], mid[1], dist / gesture.dist);
      gesture.dist = dist;
      gesture.mid = mid;
      return;
    }
    if (gesture && gesture.type === "marker") {
      const [ix, iy] = toImage(sx + gesture.dx, sy + gesture.dy);
      setPoint(gesture.key, ix, iy);
      drawLoupe(...state.pts[gesture.key]);
      return;
    }
    if (gesture && (gesture.type === "tap" || gesture.type === "pan")) {
      const dx = sx - gesture.start[0], dy = sy - gesture.start[1];
      if (gesture.type === "tap" && Math.hypot(dx, dy) > 5) gesture.type = "pan";
      if (gesture.type === "pan") {
        state.ox = gesture.ox + dx;
        state.oy = gesture.oy + dy;
        loupe.style.display = "none";
        draw();
        return;
      }
    }
    if (e.pointerType === "mouse") drawLoupe(...toImage(sx, sy));
  });

  function endPointer(e) {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    if (gesture && gesture.type === "tap" && e.type === "pointerup") {
      const [ix, iy] = toImage(...localXY(e));
      if (ix >= 0 && iy >= 0 && ix <= state.w && iy <= state.h) {
        const key = state.active;
        setPoint(key, ix, iy);
        if (key === "c" && !state.pts.w) setActive("w");
      }
    }
    if (e.pointerType !== "mouse") loupe.style.display = "none";
    gesture = pointers.size ? { type: "none" } : null;
  }
  viewer.addEventListener("pointerup", endPointer);
  viewer.addEventListener("pointercancel", endPointer);
  viewer.addEventListener("pointerleave", (e) => { if (e.pointerType === "mouse") loupe.style.display = "none"; });

  viewer.addEventListener("wheel", (e) => {
    if (!state.img) return;
    e.preventDefault();
    const [sx, sy] = localXY(e);
    zoomAt(sx, sy, Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0015)));
    drawLoupe(...toImage(sx, sy));
  }, { passive: false });

  viewer.addEventListener("dblclick", (e) => {
    if (!state.img || e.target.closest(".zoom")) return;
    zoomAt(...localXY(e), 2);
  });

  viewer.addEventListener("keydown", (e) => {
    const p = state.pts[state.active];
    const moves = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (!p || !moves[e.key]) return;
    e.preventDefault();
    const step = e.shiftKey ? 10 : 1;
    setPoint(state.active, p[0] + moves[e.key][0] * step, p[1] + moves[e.key][1] * step);
    drawLoupe(...state.pts[state.active]);
  });

  document.querySelector(".zoom").addEventListener("click", (e) => {
    const z = e.target.dataset.zoom;
    if (!z) return;
    const r = viewer.getBoundingClientRect();
    if (z === "fit") fit();
    else zoomAt(r.width / 2, r.height / 2, z === "in" ? 1.6 : 1 / 1.6);
  });

  document.querySelectorAll(".tip").forEach((b) => b.addEventListener("click", () => {
    setActive(b.dataset.tip);
    viewer.focus();
  }));

  new ResizeObserver(() => { resizeCanvas(); }).observe(viewer);

  // ---------------------------------------------------------------- loading photos

  function showImage(img, opts) {
    state.img = img;
    state.w = img.naturalWidth;
    state.h = img.naturalHeight;
    state.pts = { c: opts.c ? opts.c.slice() : null, w: opts.w ? opts.w.slice() : null };
    state.known = opts.known || null;
    state.exifGps = opts.gps || null;
    state.refitMap = true;
    const longSide = opts.longSide || Math.max(state.w, state.h);
    $("longside").value = longSide;
    // ±3 px was right for the 1024 px sample measurements; scale it for bigger photos.
    $("tol").value = Math.max(3, Math.round((3 * longSide) / 1024));
    $("ground").value = opts.ground != null ? opts.ground : 80;
    $("focal").value = opts.focal || "";
    $("empty").hidden = true;
    document.querySelector(".zoom").hidden = false;
    setActive(state.pts.c && !state.pts.w ? "w" : "c");
    updateTips();
    resizeCanvas();
    fit();
    scheduleCompute();
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("This browser can't open that image."));
      img.src = src;
    });
  }

  async function openFile(file) {
    if (!file) return;
    $("sample").value = "";
    $("credit").hidden = true;
    let img;
    try {
      img = await loadImage(URL.createObjectURL(file));
    } catch (err) {
      $("hint").textContent = err.message;
      return;
    }
    const opts = {};
    const notes = { focal: "Optional. With it, the band narrows to a point.", ground: "Most of Baltimore is 0–150 m. It barely changes the answer." };
    try {
      const tags = window.exifr ? await window.exifr.parse(file) : null;
      if (tags) {
        if (tags.FocalLengthIn35mmFormat) {
          opts.focal = tags.FocalLengthIn35mmFormat;
          notes.focal = "Read from the photo's EXIF data. Clear it if the photo was cropped.";
        } else if (tags.FocalLength) {
          notes.focal = `The EXIF data gives ${tags.FocalLength} mm (actual, not 35 mm-equivalent).`;
        }
        if (typeof tags.latitude === "number" && typeof tags.longitude === "number") opts.gps = [tags.latitude, tags.longitude];
        if (typeof tags.GPSAltitude === "number" && tags.GPSAltitude > -20 && tags.GPSAltitude < 300) {
          opts.ground = Math.round(tags.GPSAltitude);
          notes.ground = "Read from the photo's GPS altitude.";
        }
      }
    } catch (err) {
      // No readable EXIF; carry on without it.
    }
    $("focal-note").textContent = notes.focal;
    $("ground-note").textContent = notes.ground;
    showImage(img, opts);
  }

  async function openSample(id) {
    const s = SAMPLES.find((x) => x.id === id);
    if (!s) return;
    let img;
    try {
      img = await loadImage(`photos/photo-${s.id}.jpg`);
    } catch (err) {
      $("hint").textContent = "Couldn't load the sample photo.";
      return;
    }
    $("focal-note").textContent = "Optional. With it, the band narrows to a point.";
    $("ground-note").textContent = "Most of Baltimore is 0–150 m. It barely changes the answer.";
    const lic = LICENSE_URLS[s.lic];
    $("credit").innerHTML = `Photo: <a href="${s.url}" target="_blank" rel="noopener">${esc(s.title)}</a> by ${esc(s.by)}, ` +
      `<a href="${lic}" target="_blank" rel="noopener">${esc(s.lic)}</a>. Tips pre-marked; drag them to try your own.` +
      (s.note ? ` ${esc(s.note)}` : "");
    $("credit").hidden = false;
    showImage(img, { c: s.c, w: s.w, longSide: s.longSide, ground: s.ground, known: s.known });
  }

  for (const s of SAMPLES) {
    const o = document.createElement("option");
    o.value = s.id;
    o.textContent = `Photo ${s.id}${s.known ? " (location known)" : ""}`;
    $("sample").appendChild(o);
  }
  $("sample").addEventListener("change", (e) => openSample(e.target.value));
  $("file").addEventListener("change", (e) => openFile(e.target.files[0]));

  viewer.addEventListener("dragover", (e) => { e.preventDefault(); viewer.classList.add("drop"); });
  viewer.addEventListener("dragleave", () => viewer.classList.remove("drop"));
  viewer.addEventListener("drop", (e) => {
    e.preventDefault();
    viewer.classList.remove("drop");
    const file = [...e.dataTransfer.files].find((f) => f.type.startsWith("image/"));
    if (file) openFile(file);
  });

  for (const id of ["focal", "longside", "ground", "tol"]) $(id).addEventListener("input", scheduleCompute);

  // ---------------------------------------------------------------- map

  const map = L.map("map", { zoomControl: true }).setView([R.CANDELABRA_LAT, R.CANDELABRA_LON], 13);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19, attribution: "&copy; OpenStreetMap contributors",
  }).addTo(map);

  const towerIcon = (color) => L.divIcon({
    className: "",
    html: `<svg width="16" height="16" viewBox="0 0 16 16"><path d="M8 1 L14 15 H2 Z" fill="${color}" stroke="#fff" stroke-width="1.5"/></svg>`,
    iconSize: [16, 16], iconAnchor: [8, 15],
  });
  L.marker([R.CANDELABRA_LAT, R.CANDELABRA_LON], { icon: towerIcon("#c62f3c") })
    .bindTooltip("Candelabra (WBAL/WJZ/WMAR), 997 ft").addTo(map);
  L.marker([R.WBFF_LAT, R.WBFF_LON], { icon: towerIcon("#2f6fd6") })
    .bindTooltip("WBFF / Sinclair mast, 1,280 ft").addTo(map);

  const resultLayer = L.layerGroup().addTo(map);

  // ---------------------------------------------------------------- compute and show results

  const COMPASS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  const compass = (deg) => COMPASS[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16];
  const km = (m) => (m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`);
  const deg = (d) => `${Math.round(((d % 360) + 360) % 360)}°`;

  let timer = null;
  function scheduleCompute() {
    clearTimeout(timer);
    timer = setTimeout(compute, 120);
  }

  const num = (id) => {
    const v = parseFloat($(id).value);
    return Number.isFinite(v) ? v : null;
  };

  function covers(rows, bearing, distance, slack = 3) {
    if (!rows.length) return false;
    const row = rows.reduce((x, y) => (Math.abs(y.distance_m - distance) < Math.abs(x.distance_m - distance) ? y : x));
    if (Math.abs(row.distance_m - distance) > distance * 0.15) return false;
    return row.intervals.some(([a, b]) => {
      const span = (((b - a) % 360) + 360) % 360, off = (((bearing - a) % 360) + 360) % 360;
      return off <= span + slack || off >= 360 - slack;
    });
  }

  function compute() {
    resultLayer.clearLayers();
    const out = $("results");
    const { c, w } = state.pts;
    if (!state.img || !c || !w) {
      out.innerHTML = `<p class="hint">The map will show the possible camera positions once both tips are marked.</p>`;
      return;
    }
    const longSide = num("longside") || Math.max(state.w, state.h);
    const ground = num("ground") ?? 80;
    const tol = Math.max(num("tol") || 3, 0.1);
    const focal = num("focal");
    const lens = (fpx) => `~${Math.round(R.focal35(fpx, longSide))} mm`;

    let rows;
    try {
      rows = R.radial(c, w, { cameraGroundM: ground, tolerancePx: tol });
    } catch (err) {
      out.innerHTML = `<div class="callout warn">${esc(err.message)}</div>`;
      return;
    }

    const html = [];
    const right = w[0] > c[0];
    html.push(`<p>WBFF appears to the <b>${right ? "right" : "left"}</b> of the candelabra, so the camera was on the <b>${right ? "east" : "west"} side</b> of the hill.</p>`);

    const bandColor = css("--band");
    const tracks = R.branches(rows);
    const bounds = L.latLngBounds([[R.CANDELABRA_LAT, R.CANDELABRA_LON]]);

    if (!tracks.length) {
      html.push(`<div class="callout warn">No camera position fits these two points. Check that the red marker is on the candelabra and the blue one on the WBFF mast, or raise the measurement error in Settings.</div>`);
    }

    tracks.forEach((t, n) => {
      const primary = n === 0;
      const dash = primary ? null : "6 6";
      const outline = t.map((p) => R.at(p.a, p.dist)).concat(t.slice().reverse().map((p) => R.at(p.b, p.dist)));
      const centre = [[R.CANDELABRA_LAT, R.CANDELABRA_LON]].concat(t.map((p) => R.at(p.mid, p.dist)));
      const name = primary ? "Direction A" : `Direction ${String.fromCharCode(65 + n)} (mirror-image alternative)`;
      L.polygon(outline, { color: bandColor, weight: 1, fillOpacity: primary ? 0.22 : 0.08, dashArray: dash }).bindTooltip(name, { sticky: true }).addTo(resultLayer);
      L.polyline(centre, { color: bandColor, weight: 2, dashArray: dash }).addTo(resultLayer);
      // Zoom to the first few km; the bands run out to 10 km, but most photos are taken closer.
      t.filter((p) => p.dist <= 4000).forEach((p) => { bounds.extend(R.at(p.a, p.dist)); bounds.extend(R.at(p.b, p.dist)); });

      t.forEach((p, i) => {
        if (i % 4) return;
        L.circleMarker(R.at(p.mid, p.dist), { radius: 4, color: bandColor, weight: 2, fillColor: "#fff", fillOpacity: 1 })
          .bindTooltip(`${km(p.dist)} away: ${lens(p.focal_px)} lens<br>bearing ${deg(p.a)}–${deg(p.b)}`)
          .addTo(resultLayer);
      });

      const first = t[0], last = t[t.length - 1];
      const lenses = t.map((p) => R.focal35(p.focal_px, longSide));
      html.push(`<h3><span class="swatch${primary ? "" : " dashed"}"></span>${name}</h3>`);
      html.push(`<p>From ${compass(first.mid)} of the candelabra (bearing ${deg(first.mid)}) at ${km(first.dist)} to ${compass(last.mid)} (${deg(last.mid)}) at ${km(last.dist)}. ` +
        `Over that range the lens would have been ${Math.round(Math.min(...lenses))}–${Math.round(Math.max(...lenses))} mm.</p>`);
      const tableRows = t.filter((_, i) => i % 4 === 0 || i === t.length - 1)
        .map((p) => `<tr><td>${km(p.dist)}</td><td>${deg(p.a)}–${deg(p.b)} (${compass(p.mid)})</td><td>${lens(p.focal_px)}</td></tr>`).join("");
      html.push(`<details><summary>Distance, bearing and lens</summary><div class="table-wrap"><table><thead><tr><th>Distance</th><th>Bearing from candelabra</th><th>Lens (35 mm-equiv)</th></tr></thead><tbody>${tableRows}</tbody></table></div></details>`);
    });

    if (tracks.length > 1) {
      html.push(`<p class="hint">Beyond about 800 m, the same view fits two mirror-image directions: one where WBFF is the nearer tower and one where the candelabra is. A known lens or a second landmark tells them apart.</p>`);
    }

    if (focal) {
      const fixes = R.locate(c, w, (focal * longSide) / R.FILM_LONG_SIDE_MM, ground);
      if (fixes.length) {
        html.push(`<h3>With a ${focal} mm lens</h3>`);
        html.push(`<p>${fixes.length === 1 ? "The camera was about here:" : "The camera was at one of these spots:"}</p><ul>`);
        fixes.forEach((f) => {
          const label = `${km(f.distance)} ${compass(f.bearing)} of the candelabra (bearing ${deg(f.bearing)})`;
          L.circleMarker([f.lat, f.lon], { radius: 9, color: "#fff", weight: 3, fillColor: bandColor, fillOpacity: 1 })
            .bindTooltip(`With a ${focal} mm lens: ${label}`).addTo(resultLayer);
          bounds.extend([f.lat, f.lon]);
          html.push(`<li>${label}: <a href="https://www.openstreetmap.org/?mlat=${f.lat.toFixed(5)}&mlon=${f.lon.toFixed(5)}#map=17/${f.lat.toFixed(5)}/${f.lon.toFixed(5)}" target="_blank" rel="noopener">${f.lat.toFixed(5)}, ${f.lon.toFixed(5)}</a></li>`);
        });
        html.push(`</ul>`);
      } else {
        html.push(`<div class="callout warn">No position matches a ${focal} mm lens. Check the lens, and the image long side if the photo was cropped.</div>`);
      }
    }

    for (const [where, label, src] of [[state.known, state.known && state.known[2], "Actual camera location"], [state.exifGps, "the photo's GPS data", "Photo's GPS location"]]) {
      if (!where) continue;
      const [b, d] = R.bearingAndDistance(where[0], where[1]);
      const hit = covers(rows, b, d);
      L.marker([where[0], where[1]]).bindTooltip(`${src}: ${esc(label)}`).addTo(resultLayer);
      bounds.extend([where[0], where[1]]);
      html.push(`<div class="callout ${hit ? "ok" : "warn"}"><b>${src}:</b> ${esc(label)}, ${km(d)} ${compass(b)} of the candelabra (bearing ${deg(b)}). ` +
        (hit ? "It falls inside the band." : "It falls outside the band. Check the markers.") + `</div>`);
    }

    out.innerHTML = html.join("");
    if (state.refitMap && tracks.length) {
      map.fitBounds(bounds, { padding: [20, 20], maxZoom: 16 });
      state.refitMap = false;
    }
  }

  updateHint();

  // A link like index.html#sample=06 opens that sample photo.
  const linked = /sample=(\w+)/.exec(location.hash);
  if (linked && SAMPLES.some((s) => s.id === linked[1])) {
    $("sample").value = linked[1];
    openSample(linked[1]);
  }
})();
