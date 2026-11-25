// Pobiera prawdziwe dane (OpenStreetMap + EU-DEM) dla jezior i zapisuje je do src/data/lakes/*.json
// Uruchomienie: node scripts/fetch-lakes.mjs [kortowskie|klebarskie]
import fs from "fs";

const UA = { "User-Agent": "warmia-lakes-game/1.0 (educational project)" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const LAKES = [
  { id: "kortowskie", match: /Kortowskie/i, nominatim: "R1295575", R: 1900 },
  { id: "klebarskie", match: /Klebarskie/i, nominatim: "R1702898", R: 2300 },
];

const WORLD_HALF = 2400; // połowa boku świata w metrach
const DEM_STEP = 100;

function decode(s) {
  return s.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

function parseOsm(xml, store) {
  const lines = xml.split("\n");
  let cur = null;
  for (const raw of lines) {
    const line = raw.trim();
    if (line.startsWith("<node")) {
      const a = attrs(line);
      cur = { t: "node", id: a.id };
      store.nodes.set(a.id, [parseFloat(a.lat), parseFloat(a.lon)]);
      if (line.endsWith("/>")) cur = null;
      else cur.tags = {};
      if (cur) store.nodeTags.set(a.id, cur.tags);
    } else if (line.startsWith("<way")) {
      const a = attrs(line);
      cur = { t: "way", id: a.id, nodes: [], tags: {} };
      store.ways.set(a.id, cur);
    } else if (line.startsWith("<relation")) {
      const a = attrs(line);
      cur = { t: "rel", id: a.id, members: [], tags: {} };
      store.rels.set(a.id, cur);
    } else if (line.startsWith("<nd ")) {
      if (cur && cur.t === "way") cur.nodes.push(attrs(line).ref);
    } else if (line.startsWith("<member")) {
      const a = attrs(line);
      if (cur && cur.t === "rel") cur.members.push({ type: a.type, ref: a.ref, role: a.role });
    } else if (line.startsWith("<tag")) {
      const a = attrs(line);
      if (cur && cur.tags) cur.tags[a.k] = a.v;
    } else if (line.startsWith("</node") || line.startsWith("</way") || line.startsWith("</relation")) {
      cur = null;
    }
  }
}

function attrs(line) {
  const out = {};
  const re = /([\w:]+)="([^"]*)"/g;
  let m;
  while ((m = re.exec(line))) out[m[1]] = decode(m[2]);
  return out;
}

async function fetchTile(store, minLon, minLat, maxLon, maxLat, depth = 0) {
  const url = `https://api.openstreetmap.org/api/0.6/map?bbox=${minLon.toFixed(6)},${minLat.toFixed(6)},${maxLon.toFixed(6)},${maxLat.toFixed(6)}`;
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await fetch(url, { headers: UA });
    if (res.status === 200) {
      const txt = await res.text();
      parseOsm(txt, store);
      process.stdout.write(".");
      return;
    }
    if (res.status === 400) {
      if (depth > 4) throw new Error("za gęsty kafelek");
      const mx = (minLon + maxLon) / 2, my = (minLat + maxLat) / 2;
      await fetchTile(store, minLon, minLat, mx, my, depth + 1);
      await fetchTile(store, mx, minLat, maxLon, my, depth + 1);
      await fetchTile(store, minLon, my, mx, maxLat, depth + 1);
      await fetchTile(store, mx, my, maxLon, maxLat, depth + 1);
      return;
    }
    await sleep(4000 * (attempt + 1));
  }
  throw new Error("OSM API niedostępne: " + url);
}

function assembleRings(wayList) {
  const rings = [];
  const pool = wayList.map((w) => w.slice());
  while (pool.length) {
    let cur = pool.pop();
    let changed = true;
    while (cur[0] !== cur[cur.length - 1] && changed) {
      changed = false;
      for (let i = 0; i < pool.length; i++) {
        const w = pool[i];
        if (w[0] === cur[cur.length - 1]) { cur = cur.concat(w.slice(1)); pool.splice(i, 1); changed = true; break; }
        if (w[w.length - 1] === cur[cur.length - 1]) { cur = cur.concat(w.slice(0, -1).reverse()); pool.splice(i, 1); changed = true; break; }
        if (w[w.length - 1] === cur[0]) { cur = w.slice(0, -1).concat(cur); pool.splice(i, 1); changed = true; break; }
        if (w[0] === cur[0]) { cur = w.slice(1).reverse().concat(cur); pool.splice(i, 1); changed = true; break; }
      }
    }
    if (cur.length >= 3) {
      if (cur[0] !== cur[cur.length - 1]) cur.push(cur[0]);
      if (cur.length >= 4) rings.push(cur);
    }
  }
  return rings;
}

function dp(pts, tol) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let md = 0, mi = -1;
    const [ax, az] = pts[a], [bx, bz] = pts[b];
    const dx = bx - ax, dz = bz - az;
    const L2 = dx * dx + dz * dz;
    for (let i = a + 1; i < b; i++) {
      const [px, pz] = pts[i];
      let t = L2 > 0 ? ((px - ax) * dx + (pz - az) * dz) / L2 : 0;
      t = Math.max(0, Math.min(1, t));
      const ex = ax + t * dx - px, ez = az + t * dz - pz;
      const d = Math.sqrt(ex * ex + ez * ez);
      if (d > md) { md = d; mi = i; }
    }
    if (md > tol && mi > 0) { keep[mi] = 1; stack.push([a, mi], [mi, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}

const r1 = (v) => Math.round(v * 10) / 10;
const flat = (pts) => pts.flatMap(([x, z]) => [r1(x), r1(z)]);
function ringArea(pts) {
  let a = 0;
  for (let i = 0; i < pts.length - 1; i++) a += pts[i][0] * pts[i + 1][1] - pts[i + 1][0] * pts[i][1];
  return Math.abs(a) / 2;
}
function bboxOf(pts) {
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
  for (const [x, z] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  return [x0, z0, x1, z1];
}
function pointInRing(x, z, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i], [xj, zj] = ring[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

function areaCode(t) {
  if (t.natural === "wood" || t.landuse === "forest") {
    if (t.leaf_type === "needleleaved") return 2;
    if (t.leaf_type === "broadleaved") return 3;
    return 1;
  }
  if (t.landuse === "farmland" || t.landuse === "allotments" || t.landuse === "plant_nursery") return 4;
  if (t.landuse === "meadow" || t.natural === "grassland" || t.landuse === "greenfield" || t.landuse === "brownfield") return 5;
  if (t.landuse === "farmyard" || t.landuse === "residential" || t.landuse === "commercial" || t.landuse === "retail") return 6;
  if (t.landuse === "grass" || t.leisure === "park" || t.leisure === "garden" || t.leisure === "pitch" || t.leisure === "playground" ||
      t.leisure === "sports_centre" || t.leisure === "recreation_ground" || t.landuse === "recreation_ground" || t.landuse === "cemetery" ||
      t.amenity === "university" || t.amenity === "college" || t.amenity === "school" || t.landuse === "education" || t.landuse === "village_green" ||
      t.leisure === "golf_course" || t.leisure === "camp_site" || t.tourism === "camp_site") return 7;
  if (t.natural === "wetland" || t.natural === "reedbed" || t.wetland) return 8;
  if (t.natural === "beach" || t.natural === "sand" || t.leisure === "beach_resort" || t.leisure === "swimming_area") return 9;
  if (t.landuse === "industrial" || t.landuse === "railway" || t.landuse === "construction" || t.amenity === "parking" || t.landuse === "quarry") return 10;
  if (t.natural === "scrub" || t.natural === "heath") return 11;
  if (t.landuse === "orchard") return 12;
  return 0;
}

function buildingInfo(t) {
  const b = t.building;
  let h = parseFloat(t.height);
  if (!isFinite(h)) {
    const lv = parseFloat(t["building:levels"]);
    if (isFinite(lv)) h = lv * 3 + (t["roof:shape"] && t["roof:shape"] !== "flat" ? 1.5 : 0.8);
  }
  if (!isFinite(h)) {
    if (/garage|garages|shed|hut|carport|roof|kiosk|cabin|greenhouse|service|gazebo/.test(b)) h = 3;
    else if (/house|detached|semidetached_house|residential|bungalow|terrace/.test(b)) h = 7;
    else if (/apartments|dormitory/.test(b)) h = 15;
    else if (/church|chapel|cathedral/.test(b)) h = 14;
    else if (/university|college|school|civic|public|hospital|office|commercial|retail/.test(b)) h = 12;
    else if (/industrial|warehouse|barn|farm_auxiliary|stable|cowshed/.test(b)) h = 7;
    else h = 6;
  }
  let roof = t["roof:shape"] || "";
  if (!roof) roof = /house|detached|semidetached_house|residential|bungalow|terrace|church|chapel|farm|barn|stable|cabin|hut|yes/.test(b) && h < 11 ? "gabled" : "flat";
  if (/dome|pyramidal|hipped|half-hipped|skillion|gambrel|mansard|round/.test(roof)) roof = roof === "pyramidal" || roof === "hipped" ? "hipped" : "gabled";
  if (roof !== "flat" && roof !== "hipped") roof = "gabled";
  let wall = 0; // 0 = tynk jasny, 1 = cegła, 2 = beż/żółty, 3 = szary beton
  if (/university|college|school|dormitory|civic|public|hospital|church|chapel/.test(b)) wall = 1;
  else if (/industrial|warehouse|garage|garages|shed/.test(b)) wall = 3;
  return { h: Math.max(2.5, Math.min(40, h)), roof, wall, type: b };
}

function roadInfo(t) {
  const h = t.highway;
  const table = {
    motorway: 12, trunk: 11, primary: 9, secondary: 8, tertiary: 7, residential: 6, unclassified: 5.5, living_street: 5, service: 3.6,
    track: 3.2, cycleway: 2.4, footway: 1.8, pedestrian: 3, path: 1.3, steps: 1.6, bridleway: 2,
    motorway_link: 6, trunk_link: 6, primary_link: 6, secondary_link: 6, tertiary_link: 5,
  };
  if (!(h in table)) return null;
  if (t.area === "yes") return null;
  let w = parseFloat(t.width);
  if (!isFinite(w)) w = table[h];
  let surf = 0; // 0 asfalt, 1 żwir, 2 ziemia, 3 kostka/płyty
  const s = t.surface || "";
  if (/asphalt|concrete|paved/.test(s)) surf = 0;
  else if (/paving|sett|cobble|stone|bricks|tiles|concrete:plates/.test(s)) surf = 3;
  else if (/gravel|compacted|fine_gravel|pebble/.test(s)) surf = 1;
  else if (/ground|dirt|earth|grass|sand|mud|unpaved/.test(s)) surf = 2;
  else if (h === "track") surf = 2;
  else if (h === "path" || h === "bridleway") surf = 2;
  else if (h === "footway" || h === "cycleway" || h === "pedestrian" || h === "steps") surf = 3;
  const bridge = !!t.bridge && t.bridge !== "no";
  const tunnel = !!t.tunnel && t.tunnel !== "no";
  if (tunnel) return null;
  return { type: h, w, surf, bridge };
}

async function fetchDem(lat0, lon0, kx, ky, waterPts) {
  const n = Math.round((WORLD_HALF * 2) / DEM_STEP) + 1;
  const locs = [];
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const x = -WORLD_HALF + i * DEM_STEP, z = -WORLD_HALF + j * DEM_STEP;
      locs.push([lat0 - z / ky, lon0 + x / kx]);
    }
  const vals = new Array(locs.length).fill(0);
  for (let s = 0; s < locs.length; s += 100) {
    const batch = locs.slice(s, s + 100);
    const q = batch.map(([la, lo]) => `${la.toFixed(5)},${lo.toFixed(5)}`).join("|");
    let ok = false;
    for (let attempt = 0; attempt < 6 && !ok; attempt++) {
      const res = await fetch(`https://api.opentopodata.org/v1/eudem25m?locations=${q}&interpolation=bilinear`, { headers: UA });
      if (res.status === 200) {
        const j = await res.json();
        j.results.forEach((r, k) => (vals[s + k] = r.elevation ?? 0));
        ok = true;
      } else await sleep(3000);
    }
    if (!ok) throw new Error("DEM niedostępny");
    process.stdout.write("d");
    await sleep(1100);
  }
  // poziom jeziora = mediana punktów DEM leżących w jeziorze
  const inside = [];
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const x = -WORLD_HALF + i * DEM_STEP, z = -WORLD_HALF + j * DEM_STEP;
      let c = 0;
      for (const ring of waterPts) if (pointInRing(x, z, ring)) c++;
      if (c % 2 === 1) inside.push(vals[j * n + i]);
    }
  inside.sort((a, b) => a - b);
  const level = inside.length ? inside[Math.floor(inside.length / 2)] : vals[Math.floor(vals.length / 2)];
  return { n, step: DEM_STEP, level, rel: vals.map((v) => Math.round((v - level) * 10) / 10) };
}

async function processLake(L) {
  console.log(`\n=== ${L.id} ===`);
  // 1. przybliżone centrum z Nominatim
  const nr = await fetch(`https://nominatim.openstreetmap.org/lookup?osm_ids=${L.nominatim}&format=jsonv2`, { headers: UA });
  const nj = (await nr.json())[0];
  const lat0 = parseFloat(nj.lat), lon0 = parseFloat(nj.lon);
  const kx = 111320 * Math.cos((lat0 * Math.PI) / 180), ky = 110574;
  const toXZ = (lat, lon) => [(lon - lon0) * kx, -(lat - lat0) * ky];

  // 2. dane OSM w kafelkach
  const store = { nodes: new Map(), nodeTags: new Map(), ways: new Map(), rels: new Map() };
  const R = L.R;
  const minLon = lon0 - R / kx, maxLon = lon0 + R / kx, minLat = lat0 - R / ky, maxLat = lat0 + R / ky;
  const T = 5;
  for (let j = 0; j < T; j++)
    for (let i = 0; i < T; i++) {
      await fetchTile(
        store,
        minLon + ((maxLon - minLon) * i) / T, minLat + ((maxLat - minLat) * j) / T,
        minLon + ((maxLon - minLon) * (i + 1)) / T, minLat + ((maxLat - minLat) * (j + 1)) / T
      );
      await sleep(600);
    }
  console.log(`\nnodes ${store.nodes.size} ways ${store.ways.size} rels ${store.rels.size}`);

  const wayPts = (w) => w.nodes.filter((id) => store.nodes.has(id)).map((id) => toXZ(...store.nodes.get(id)));
  const relRings = (rel) => {
    const ws = rel.members.filter((m) => m.type === "way" && store.ways.has(m.ref) && (m.role === "outer" || m.role === "inner" || m.role === ""));
    const outer = assembleRings(ws.filter((m) => m.role !== "inner").map((m) => store.ways.get(m.ref).nodes.filter((id) => store.nodes.has(id))));
    const inner = assembleRings(ws.filter((m) => m.role === "inner").map((m) => store.ways.get(m.ref).nodes.filter((id) => store.nodes.has(id))));
    return [...outer, ...inner].map((r) => r.map((id) => toXZ(...store.nodes.get(id))));
  };
  const memberWays = new Set();
  for (const rel of store.rels.values())
    if (rel.tags.type === "multipolygon") for (const m of rel.members) if (m.type === "way") memberWays.add(m.ref);

  const out = {
    id: L.id, lat0, lon0, water: [], areas: [], buildings: [], roads: [], piers: [], trees: [], benches: [], lamps: [], pois: [], dem: null,
  };

  // 3. jezioro
  const waterRings = [];
  const isLake = (t) => (t.natural === "water" || t.water) && t.name && L.match.test(t.name);
  for (const w of store.ways.values()) if (isLake(w.tags) && w.nodes.length > 3) waterRings.push(wayPts(w));
  for (const r of store.rels.values()) if (isLake(r.tags)) waterRings.push(...relRings(r));
  // usuń duplikaty (ten sam pierścień jako way i jako relacja)
  const uniq = [];
  for (const ring of waterRings) {
    const a = ringArea(ring), bb = bboxOf(ring);
    if (!uniq.some((u) => Math.abs(u.a - a) / a < 0.002 && Math.abs(u.bb[0] - bb[0]) < 3)) uniq.push({ a, bb, ring });
  }
  if (!uniq.length) throw new Error("nie znaleziono jeziora w danych OSM");
  const lakeRings = uniq.map((u) => u.ring);
  // centrowanie
  const all = lakeRings.flat();
  const bb = bboxOf(all);
  const cx = (bb[0] + bb[2]) / 2, cz = (bb[1] + bb[3]) / 2;
  const shift = ([x, z]) => [x - cx, z - cz];
  const lakeShifted = lakeRings.map((r) => dp(r.map(shift), 1.2));
  // pole powierzchni: even-odd => suma zewn. minus wewn. (przybliżone: sortuj wg wielkości)
  const sorted = [...lakeShifted].sort((a, b) => ringArea(b) - ringArea(a));
  let areaHa = 0;
  for (const r of sorted) {
    const c = r[0];
    let depthIn = 0;
    for (const o of sorted) if (o !== r && ringArea(o) > ringArea(r) && pointInRing(c[0], c[1], o)) depthIn++;
    areaHa += (depthIn % 2 === 0 ? 1 : -1) * ringArea(r);
  }
  out.water = lakeShifted.map(flat);
  out.areaHa = Math.round(areaHa / 1e4);
  out.extent = [Math.round(bb[2] - bb[0]), Math.round(bb[3] - bb[1])];
  console.log(`jezioro: ${lakeShifted.length} pierścieni, ${out.areaHa} ha, wymiary ${out.extent[0]} x ${out.extent[1]} m`);

  const toLocal = (p) => shift(p);
  const inRegion = (pts) => {
    const b = bboxOf(pts);
    return b[2] > -WORLD_HALF && b[0] < WORLD_HALF && b[3] > -WORLD_HALF && b[1] < WORLD_HALF;
  };

  // 4. obszary, budynki, drogi, mola
  const areaList = [];
  const handleArea = (t, rings) => {
    const code = areaCode(t);
    if (!code) return;
    const rr = rings.map((r) => dp(r.map(toLocal), 2.5)).filter((r) => r.length >= 4);
    if (!rr.length || !rr.flat().length || !inRegion(rr.flat())) return;
    areaList.push({ code, rings: rr, a: Math.max(...rr.map(ringArea)) });
  };
  const handleBuilding = (t, rings) => {
    const info = buildingInfo(t);
    for (const r of rings.slice(0, 1)) {
      const pts = dp(r.map(toLocal), 0.25);
      if (pts.length < 4 || !inRegion(pts)) continue;
      if (ringArea(pts) < 6) continue;
      out.buildings.push({ h: info.h, roof: info.roof, wall: info.wall, type: info.type, p: flat(pts.slice(0, -1)) });
    }
  };
  const handleLine = (id, w) => {
    const t = w.tags;
    const pts = wayPts(w).map(toLocal);
    if (pts.length < 2) return;
    if (t.highway) {
      const ri = roadInfo(t);
      if (ri && inRegion(pts)) out.roads.push({ ...ri, p: flat(dp(pts, 0.8)) });
    }
    if (t.man_made === "pier" || t.man_made === "breakwater" || t.leisure === "slipway") {
      const closed = w.nodes[0] === w.nodes[w.nodes.length - 1];
      if (inRegion(pts)) out.piers.push({ kind: t.man_made || t.leisure, w: parseFloat(t.width) || 2.2, closed, name: t.name || "", p: flat(dp(pts, 0.4)) });
    }
    if (t.natural === "tree_row" && inRegion(pts)) {
      for (let i = 0; i < pts.length - 1; i++) {
        const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
        const len = Math.hypot(bx - ax, bz - az);
        const n = Math.max(1, Math.round(len / 9));
        for (let k = 0; k < n; k++) out.trees.push(r1(ax + ((bx - ax) * k) / n), r1(az + ((bz - az) * k) / n));
      }
    }
    void id;
  };

  for (const [id, w] of store.ways) {
    const t = w.tags;
    if (!Object.keys(t).length) continue;
    const closed = w.nodes.length > 3 && w.nodes[0] === w.nodes[w.nodes.length - 1];
    if (isLake(t)) continue;
    if (closed && !(t.highway && t.area !== "yes")) {
      const pts = wayPts(w);
      if (t.building && t.building !== "no") handleBuilding(t, [pts]);
      else handleArea(t, [pts]);
      if (t.man_made === "pier") handleLine(id, w);
    } else handleLine(id, w);
    if (closed && (t.man_made === "pier" || t.leisure === "slipway")) {
      /* obsłużone wyżej */
    }
  }
  for (const rel of store.rels.values()) {
    const t = rel.tags;
    if (t.type !== "multipolygon" || isLake(t)) continue;
    const rings = relRings(rel);
    if (!rings.length) continue;
    if (t.building && t.building !== "no") handleBuilding(t, rings);
    else handleArea(t, rings);
  }
  // ways wchodzące w skład multipolygonów z własnymi tagami (stary styl) obsłużone powyżej; pomijamy puste

  areaList.sort((a, b) => b.a - a.a);
  out.areas = areaList.map((a) => ({ c: a.code, r: a.rings.map(flat) }));

  // 5. punkty: drzewa, ławki, latarnie, POI
  for (const [id, t] of store.nodeTags) {
    const [lat, lon] = store.nodes.get(id);
    const [x, z] = toLocal(toXZ(lat, lon));
    if (Math.abs(x) > WORLD_HALF || Math.abs(z) > WORLD_HALF) continue;
    if (t.natural === "tree") out.trees.push(r1(x), r1(z));
    else if (t.amenity === "bench") out.benches.push([r1(x), r1(z), parseFloat(t.direction) || 0]);
    else if (t.highway === "street_lamp") out.lamps.push(r1(x), r1(z));
    else if (t.name && (t.amenity || t.tourism || t.leisure || t.natural === "beach" || t.man_made)) out.pois.push({ n: t.name, x: r1(x), z: r1(z), k: t.amenity || t.tourism || t.leisure || t.man_made });
  }
  for (const a of areaList) if (a.code === 9) {
    const b = bboxOf(a.rings[0]);
    out.pois.push({ n: "plaża", x: r1((b[0] + b[2]) / 2), z: r1((b[1] + b[3]) / 2), k: "beach-area", s: Math.round(a.a) });
  }

  // 6. DEM
  console.log("DEM...");
  out.dem = await fetchDem(lat0 - cz / ky, lon0 + cx / kx, kx, ky, lakeShifted);
  console.log(`\npoziom jeziora (DEM): ${out.dem.level} m`);

  console.log(`budynki ${out.buildings.length}, drogi ${out.roads.length}, mola ${out.piers.length}, obszary ${out.areas.length}, drzewa ${out.trees.length / 2}, ławki ${out.benches.length}, latarnie ${out.lamps.length / 2}`);
  console.log("mola:", out.piers.map((p) => `${p.kind}:${p.name}@${p.p[0]},${p.p[1]}`).join(" | "));
  console.log("poi:", out.pois.slice(0, 40).map((p) => `${p.n}(${p.k})@${p.x},${p.z}`).join(" | "));
  fs.mkdirSync("src/data/lakes", { recursive: true });
  fs.writeFileSync(`src/data/lakes/${L.id}.json`, JSON.stringify(out));
  console.log("zapisano, rozmiar KB:", Math.round(JSON.stringify(out).length / 1024));
}

const only = process.argv[2];
for (const L of LAKES) if (!only || only === L.id) await processLake(L);
