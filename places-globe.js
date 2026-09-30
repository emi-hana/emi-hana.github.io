// Interactive continent globe for "Where I've Been So Far".
// Move the pointer left/right to turn the globe; drag on touch screens. Click a continent to open its page.
(function () {
  const canvas = document.getElementById("globe");
  if (!canvas || !window.d3 || !window.topojson) return;
  const wrap = canvas.parentElement;
  const tip = document.getElementById("globe-tip");

  const CONTINENTS = {
    "North America": { color: "#6D5DAB", href: "places/north-america.html" },
    "South America": { color: "#49884E", href: "places/south-america.html" },
    "Europe":        { color: "#4098AE", href: "places/europe.html" },
    "Africa":        { color: "#AB5340", href: "places/africa.html" },
    "Asia":          { color: "#B29432", href: "places/asia.html" },
    "Oceania":       { color: "#E071A8", href: null },
    "Antarctica":    { color: "#CFE3F1", href: null },
  };
  // ISO 3166 numeric codes that the simple position rules below would get wrong
  const OVERRIDES = { "792": "Asia", "196": "Asia", "268": "Asia", "051": "Asia", "031": "Asia",
                      "862": "South America", "591": "North America", "260": "Antarctica", "643": "Asia", "760": "Asia" };
  function continentOf(f) {
    if (f.id && OVERRIDES[f.id]) return OVERRIDES[f.id];
    const [lon, lat] = d3.geoCentroid(f);
    if (lat < -60) return "Antarctica";
    if (lon > 32 && lon < 35 && lat > 34.4 && lat < 36) return "Asia";
    if (lon < -30) return lat > 7 ? "North America" : "South America";
    if ((lon >= 110 && lat < -10) || (lon >= 140 && lat < 0) || (lon > 165 && lat < 0) || lon < -150) return "Oceania";
    if (lat >= 35 && lon < 42) return "Europe";
    if (lat < 37.5 && lon < 51.5 && !(lon > 34.3 && lat > 12) && !(lat > 29 && lon > 33.5)) return "Africa";
    return "Asia";
  }

  let W = 0, R = 0;
  const ctx = canvas.getContext("2d");
  const projection = d3.geoOrthographic().clipAngle(90).precision(0.3);
  const path = d3.geoPath(projection, ctx);
  const graticule = d3.geoGraticule10();

  function size() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = wrap.clientWidth; R = W / 2 - 6;
    canvas.width = W * dpr; canvas.height = W * dpr;
    canvas.style.width = W + "px"; canvas.style.height = W + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    projection.translate([W / 2, W / 2]).scale(R);
  }

  let rot = [10, -18], data = null, hover = null;
  // European Russia (west of the Urals) is painted as Europe on top of the Asian colour
  const euroRussia = { type: "Polygon", coordinates: [[[27, 41], [27, 82], [60, 82], [60, 41], [27, 41]]] };
  const frenchGuiana = { type: "Polygon", coordinates: [[[-55, 1.5], [-55, 6.5], [-50.5, 6.5], [-50.5, 1.5], [-55, 1.5]]] };
  const urals = { type: "LineString", coordinates: [[60, 50.5], [60, 55], [60, 60], [60, 65], [60, 69]] };

  function draw() {
    ctx.clearRect(0, 0, W, W);
    projection.rotate(rot);
    // ocean with soft shading
    const g = ctx.createRadialGradient(W / 2 - R * 0.35, W / 2 - R * 0.4, R * 0.1, W / 2, W / 2, R);
    g.addColorStop(0, "#4D8FD6"); g.addColorStop(0.7, "#24599F"); g.addColorStop(1, "#163B73");
    ctx.beginPath(); path({ type: "Sphere" }); ctx.fillStyle = g; ctx.fill();
    ctx.beginPath(); path(graticule); ctx.strokeStyle = "rgba(255,255,255,.10)"; ctx.lineWidth = 0.6; ctx.stroke();
    if (!data) return;
    // one merged shape per continent, so no seams show between countries
    for (const k of data.continents) {
      ctx.beginPath(); path(k.shape);
      const c = CONTINENTS[k.name].color;
      ctx.fillStyle = k.name === hover ? d3.color(c).brighter(0.45) : c;
      ctx.fill();
    }
    if (data.france) {
      ctx.save(); ctx.beginPath(); path(frenchGuiana); ctx.clip();
      ctx.beginPath(); path(data.france);
      ctx.fillStyle = hover === "South America" ? d3.color(CONTINENTS["South America"].color).brighter(0.45) : CONTINENTS["South America"].color;
      ctx.fill(); ctx.restore();
    }
    if (data.russia) {
      ctx.save(); ctx.beginPath(); path(euroRussia); ctx.clip();
      ctx.beginPath(); path(data.russia);
      ctx.fillStyle = hover === "Europe" ? d3.color(CONTINENTS.Europe.color).brighter(0.45) : CONTINENTS.Europe.color;
      ctx.fill(); ctx.restore();
    }
    // coastlines (thin) and borders between continents (bold), both white
    ctx.beginPath(); path(data.coast); ctx.strokeStyle = "rgba(255,255,255,.75)"; ctx.lineWidth = 0.8; ctx.stroke();
    ctx.beginPath(); path(data.between); path(urals); ctx.strokeStyle = "#FFFFFF"; ctx.lineWidth = 2.4; ctx.lineJoin = "round"; ctx.stroke();
    // rim light
    ctx.beginPath(); path({ type: "Sphere" }); ctx.strokeStyle = "rgba(255,255,255,.55)"; ctx.lineWidth = 1.2; ctx.stroke();
  }

  function redraw() { draw(); }

  // Click and drag to turn the globe. It moves only while you drag and stops the moment you let go.
  let dragging = false, moved = 0, startX = 0, startY = 0, startRot = rot;
  function hit(e) {
    const b = canvas.getBoundingClientRect();
    const ll = projection.invert([e.clientX - b.left, e.clientY - b.top]);
    let found = null;
    if (ll && data && d3.geoDistance(ll, [-rot[0], -rot[1]]) < Math.PI / 2) {
      for (const k of data.continents) if (d3.geoContains(k.shape, ll)) { found = k.name; break; }
      if (found === "Asia" && data.russia && d3.geoContains(data.russia, ll) && ll[0] < 60) found = "Europe";
      if (found === "Europe" && ll[0] < -30) found = "South America";
    }
    return { found, x: e.clientX - b.left, y: e.clientY - b.top };
  }
  canvas.addEventListener("pointerdown", (e) => {
    dragging = true; moved = 0; startX = e.clientX; startY = e.clientY; startRot = rot.slice();
    canvas.setPointerCapture(e.pointerId); canvas.style.cursor = "grabbing";
    if (tip) tip.hidden = true;
  });
  canvas.addEventListener("pointermove", (e) => {
    if (dragging) {
      const dx = e.clientX - startX, dy = e.clientY - startY;
      moved = Math.max(moved, Math.hypot(dx, dy));
      const k = 180 / (Math.PI * R);            // one globe-radius of drag = ~57 degrees
      rot = [startRot[0] + dx * k, Math.max(-60, Math.min(60, startRot[1] - dy * k))];
      hover = null; redraw(); return;
    }
    const h = hit(e);
    if (h.found !== hover) { hover = h.found; redraw(); }
    canvas.style.cursor = h.found && CONTINENTS[h.found].href ? "pointer" : "grab";
    if (tip) {
      if (h.found) { tip.hidden = false; tip.textContent = h.found; tip.style.left = h.x + "px"; tip.style.top = h.y + "px"; }
      else tip.hidden = true;
    }
  });
  function endDrag(e) {
    if (!dragging) return;
    dragging = false; canvas.style.cursor = "grab";
    if (moved < 4) {                              // a click, not a drag
      const h = hit(e);
      if (h.found && CONTINENTS[h.found].href) window.location.href = CONTINENTS[h.found].href;
    }
  }
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", () => { dragging = false; canvas.style.cursor = "grab"; });
  canvas.addEventListener("pointerleave", () => { if (!dragging) { hover = null; if (tip) tip.hidden = true; redraw(); } });

  function build(world) {
    const obj = world.objects.countries;
    const feats = topojson.feature(world, obj).features;
    const cont = new Map();
    for (const f of feats) { f.properties.continent = continentOf(f); cont.set(f, f.properties.continent); }
    const geoms = obj.geometries;
    const contOfGeom = new Map(geoms.map((gm, i) => [gm, feats[i].properties.continent]));
    const isRussia = (gm) => gm.id === "643" || gm.id === "250";
    const continents = Object.keys(CONTINENTS).map((name) => ({
      name, shape: topojson.merge(world, geoms.filter((gm) => contOfGeom.get(gm) === name)),
    }));
    data = {
      continents,
      russia: feats.find((f) => f.id === "643") || null,
      france: feats.find((f) => f.id === "250") || null,
      coast: topojson.mesh(world, obj, (a, b) => a === b),
      between: topojson.mesh(world, obj, (a, b) => a !== b && !isRussia(a) && !isRussia(b) && contOfGeom.get(a) !== contOfGeom.get(b)),
    };
    draw();
  }

  size(); draw();
  window.addEventListener("resize", () => { size(); draw(); });
  const url = "https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-110m.json";
  if (window.__GLOBE_SYNC) { const x = new XMLHttpRequest(); x.open("GET", url, false); x.send(); build(JSON.parse(x.responseText)); }
  else fetch(url).then((r) => r.json()).then(build).catch(() => {});
})();
