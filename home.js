/* ==========================================================================
   Editorial New Tab — app logic (vanilla JS, no build step)
   Sections: state · helpers · theme/background · dither · tiles · render · drag ·
   modals · notes · weather · init
   ========================================================================== */
(function () {
  "use strict";

  /* ----- constants ------------------------------------------------------ */
  const ENGINES = {
    google:     { name: "Google",     url: "https://www.google.com/search?q=" },
    duckduckgo: { name: "DuckDuckGo",  url: "https://duckduckgo.com/?q=" },
    bing:       { name: "Bing",        url: "https://www.bing.com/search?q=" },
  };

  // curated, low-chroma solids (incl. the default paper)
  const SWATCHES = ["#f4f1ea", "#e7e0d3", "#d8cfc0", "#c9c3b6", "#2b2a27", "#1c1a17", "#13233a", "#1a2b22"];

  const EMOJIS = ["🌐","📧","📺","💻","🎨","🎵","📝","📅","🗺️","📷","🛒","💬","📚","🎮","☁️","⚡","💡","🔖","📈","🧠","🎬","✈️","🏠","⭐"];

  const DEFAULT_LINKS = [
    { id: "l1", name: "Gmail",   url: "https://mail.google.com",  icon: { kind: "auto" } },
    { id: "l2", name: "GitHub",  url: "https://github.com",       icon: { kind: "auto" } },
    { id: "l3", name: "YouTube", url: "https://youtube.com",      icon: { kind: "auto" } },
    { id: "l4", name: "Reddit",  url: "https://reddit.com",       icon: { kind: "auto" } },
    { id: "l5", name: "Notion",  url: "https://notion.so",        icon: { kind: "auto" } },
    { id: "l6", name: "Maps",    url: "https://maps.google.com",  icon: { kind: "auto" } },
  ];

  const DEFAULT_CONFIG = {
    name: "",
    engine: "google",
    appearance: "auto",                                  // auto | light | dark
    // mode: paper | solid | image | adaptive | dither. Dither draws over the
    // colour or the image (ditherBase) and follows the live weather unless
    // ditherScene pins it: live | clear | cloud | fog | rain | snow | storm
    bg: { mode: "paper", color: "#f4f1ea", imageUrl: "", ditherBase: "color", ditherScene: "live" },
    weather: { enabled: true, unit: "c" },               // c | f
    showRecent: true,
  };

  // phone-width layout (short date) and hover-less touch screens (no drag,
  // press-and-hold to edit links, no auto-focus); kept in step with home.css
  const NARROW = matchMedia("(max-width: 640px)");
  const TOUCH = matchMedia("(hover: none)");
  TOUCH.addEventListener("change", () => renderLinks());

  /* ----- state ---------------------------------------------------------- */
  let config = structuredClone(DEFAULT_CONFIG);
  let links = [];
  let recent = [];

  const LS = { config: "nt_config", links: "nt_links", recent: "nt_recent", weather: "nt_weather", notes: "nt_notes", palette: "nt_palette" };

  function load() {
    try { const c = JSON.parse(localStorage.getItem(LS.config)); if (c) config = Object.assign(structuredClone(DEFAULT_CONFIG), c, { bg: Object.assign({}, DEFAULT_CONFIG.bg, c.bg), weather: Object.assign({}, DEFAULT_CONFIG.weather, c.weather) }); } catch (e) {}
    try { const l = JSON.parse(localStorage.getItem(LS.links)); links = Array.isArray(l) ? l : structuredClone(DEFAULT_LINKS); } catch (e) { links = structuredClone(DEFAULT_LINKS); }
    if (!links.length) links = structuredClone(DEFAULT_LINKS);
    links.forEach((x) => { if (x && x.type === "folder" && !Array.isArray(x.children)) x.children = []; });
    try { const r = JSON.parse(localStorage.getItem(LS.recent)); recent = Array.isArray(r) ? r : []; } catch (e) { recent = []; }
  }
  const saveConfig = () => localStorage.setItem(LS.config, JSON.stringify(config));
  const saveLinks  = () => localStorage.setItem(LS.links, JSON.stringify(links));
  const saveRecent = () => localStorage.setItem(LS.recent, JSON.stringify(recent));

  /* ----- tiny DOM helpers ---------------------------------------------- */
  const $ = (sel, root = document) => root.querySelector(sel);
  function h(tag, props, ...kids) {
    const e = document.createElement(tag);
    if (props) for (const k in props) {
      if (k === "class") e.className = props[k];
      else if (k === "html") e.innerHTML = props[k];
      else if (k.startsWith("on") && typeof props[k] === "function") e.addEventListener(k.slice(2), props[k]);
      else if (k === "style" && typeof props[k] === "object") Object.assign(e.style, props[k]);
      else if (props[k] != null) e.setAttribute(k, props[k]);
    }
    for (const kid of kids.flat()) if (kid != null) e.append(kid.nodeType ? kid : document.createTextNode(kid));
    return e;
  }
  const uid = () => "l" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

  function normalizeUrl(u) {
    u = (u || "").trim();
    if (!u) return "";
    if (!/^https?:\/\//i.test(u)) u = "https://" + u;
    return u;
  }
  function domainOf(url) { try { return new URL(url).hostname; } catch (e) { return ""; } }
  function faviconUrl(url) { const d = domainOf(url); return d ? `https://www.google.com/s2/favicons?domain=${d}&sz=64` : null; }

  function luminance(hex) {
    const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex || "");
    if (!m) return 1;
    const [r, g, b] = [1, 2, 3].map((i) => parseInt(m[i], 16) / 255);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  /* ----- theme & background -------------------------------------------- */
  function adaptiveSlot(d = new Date()) {
    const hr = d.getHours();
    if (hr >= 5 && hr < 8)  return { bg: "linear-gradient(165deg,#c7d2ec 0%,#e9d6c4 100%)", theme: "light" };
    if (hr >= 8 && hr < 17) return { bg: "linear-gradient(165deg,#dde7f2 0%,#eef1f3 100%)", theme: "light" };
    if (hr >= 17 && hr < 20) return { bg: "linear-gradient(165deg,#382c4d 0%,#8a4f5a 58%,#d98a5b 100%)", theme: "dark" };
    return { bg: "linear-gradient(165deg,#0b1130 0%,#241a3a 100%)", theme: "dark" };
  }

  // the wallpaper image in use: Image mode, or Dither drawn over an image
  function bgImage() {
    const g = config.bg;
    return (g.mode === "image" || (g.mode === "dither" && g.ditherBase === "image")) && g.imageUrl ? g.imageUrl : "";
  }

  function resolveTheme() {
    if (config.appearance === "light") return "light";
    if (config.appearance === "dark") return "dark";
    const m = config.bg.mode;
    if (m === "image" || bgImage()) return "dark";
    if (m === "adaptive") return adaptiveSlot().theme;
    if (m === "solid" || m === "dither") return luminance(config.bg.color) > 0.55 ? "light" : "dark";
    return "light"; // paper
  }

  function applyBackground() {
    const b = document.body;
    const root = document.documentElement.style;
    const m = config.bg.mode;
    // the image / gradient paints on a fixed layer (body::before) so it stays
    // put when a phone-length page scrolls
    root.setProperty("--bg-image", "none");
    b.style.backgroundColor = "";
    root.setProperty("--bg", "#f4f1ea");
    if (m === "paper") {
      b.style.backgroundColor = "#f4f1ea";
    } else if (bgImage()) {
      b.style.backgroundColor = "#15171c";
      root.setProperty("--bg-image", `url("${bgImage()}")`);
    } else if (m === "solid" || m === "dither") {
      b.style.backgroundColor = config.bg.color || "#f4f1ea";
    } else if (m === "adaptive") {
      const a = adaptiveSlot();
      root.setProperty("--bg-image", a.bg);
    } else {
      b.style.backgroundColor = "#f4f1ea";
    }
    document.documentElement.dataset.theme = resolveTheme();
    updateRadarPalette();
    syncDither();
  }

  /* ----- radar palette: repaint the radar map in the wallpaper's tones --- */
  // The radar images come from BoM without CORS, so script can't read or
  // recolour their pixels. SVG filters can, because the browser applies them
  // at paint time (see #radar-duotone / #radar-ink in Home.html). The map
  // becomes a duotone: its pale surface → a surface tone, its darker coast
  // lines → a line tone. Town names get one ink tone. The rain is untouched.
  //
  // The tones come from a palette of the wallpaper's own shadow, mid-tone and
  // highlight colours, sampled at their real brightness, so a dark photo
  // gives a dark map. An image is sampled once per URL and cached.
  const PALETTE_FALLBACK = { shadow: "#15171c", mid: "#2b2d31", high: "#6b6e74" }; // photos we can't read
  let radarToneKey = "";
  let wallPalette = PALETTE_FALLBACK; // the palette last applied (the dither reads it)

  function updateRadarPalette() {
    const m = config.bg.mode;
    if (bgImage()) return paletteFromImage(bgImage());
    if (m === "solid" || m === "dither") return applyRadarPalette(paletteFromColor(config.bg.color || "#f4f1ea"));
    if (m === "adaptive") return applyRadarPalette(paletteFromColor(averageHex(adaptiveSlot().bg.match(/#[\da-f]{6}/gi))));
    applyRadarPalette(paletteFromColor("#f4f1ea")); // paper
  }

  // a single colour → shadow / mid / highlight around it
  const paletteFromColor = (hex) => ({ shadow: mixHex(hex, "#000000", 0.5), mid: hex, high: mixHex(hex, "#ffffff", 0.5) });

  function paletteFromImage(url) {
    let cached = null;
    try { cached = JSON.parse(localStorage.getItem(LS.palette)); } catch (e) {}
    if (cached && cached.v === 2 && cached.url === url) return applyRadarPalette(cached.palette);
    applyRadarPalette(PALETTE_FALLBACK);
    // a CORS request: hosts that allow it (Unsplash, most CDNs) let us read
    // the pixels; others fail to load or taint the canvas → stay on fallback
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      let palette = null;
      try {
        const c = document.createElement("canvas");
        c.width = c.height = 48;
        const ctx = c.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, 48, 48);
        palette = samplePalette(ctx.getImageData(0, 0, 48, 48).data);
      } catch (e) {}
      if (!palette || bgImage() !== url) return;
      applyRadarPalette(palette);
      syncDither(); // its ink follows the photo's brightness
      try { localStorage.setItem(LS.palette, JSON.stringify({ v: 2, url, palette })); } catch (e) {}
    };
    img.src = url;
  }

  // Sort the pixels by luminance and average three bands of them, so each
  // tone keeps the photo's real colour and brightness.
  function samplePalette(px) {
    const list = [];
    for (let i = 0; i < px.length; i += 4) {
      if (px[i + 3] < 128) continue;
      list.push([px[i], px[i + 1], px[i + 2], 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]]);
    }
    if (list.length < 16) return null;
    list.sort((a, b) => a[3] - b[3]);
    const band = (from, to) => {
      const part = list.slice(Math.floor(list.length * from), Math.max(Math.floor(list.length * to), Math.floor(list.length * from) + 1));
      return rgbHex([0, 1, 2].map((k) => part.reduce((s, p) => s + p[k], 0) / part.length));
    };
    return { shadow: band(0.1, 0.3), mid: band(0.4, 0.6), high: band(0.8, 0.95) };
  }

  // Palette + current theme → the three tones the filters use. The sea is
  // keyed out to the card's glass, so "surface" is the land itself and must
  // stand off that glass.
  //  dark page:  land a light tint of the photo's highlight, so it reads as a
  //              solid shape on the glass; coastline and names lighter still
  //  light page: land a shade darker than the page; darker lines and names
  function radarTones(p) {
    if (document.documentElement.dataset.theme === "dark") {
      return { surface: mixHex(p.high, "#ffffff", 0.12), line: mixHex(p.high, "#ffffff", 0.38), ink: mixHex(p.high, "#ffffff", 0.75) };
    }
    return { surface: mixHex(p.mid, p.shadow, 0.14), line: mixHex(p.mid, p.shadow, 0.6), ink: mixHex(p.shadow, "#000000", 0.35) };
  }

  function applyRadarPalette(palette) {
    wallPalette = palette;
    const t = radarTones(palette);
    const key = t.surface + t.line + t.ink;
    if (key === radarToneKey) return; // adaptive mode calls this every second
    radarToneKey = key;
    const [s, l, k] = [t.surface, t.line, t.ink].map(hexRgb);
    // luminance 0 → line … 0.5 → halfway … ≥0.75 → surface, so BoM's pale
    // surface lands exactly on the surface tone whatever its exact grey
    ["R", "G", "B"].forEach((ch, i) => {
      const stops = [l[i], l[i], (l[i] + s[i]) / 2, s[i], s[i]].map((v) => (v / 255).toFixed(3));
      document.querySelector(`#radar-duotone feFunc${ch}`).setAttribute("tableValues", stops.join(" "));
    });
    const [r, g, b] = k.map((v) => (v / 255).toFixed(3));
    document.querySelector("#radar-ink feColorMatrix").setAttribute("values", `0 0 0 0 ${r}  0 0 0 0 ${g}  0 0 0 0 ${b}  0 0 0 1 0`);
    document.querySelector("#radar-duotone feFlood").setAttribute("flood-color", t.line); // coastline
  }

  const hexRgb = (hex) => [1, 3, 5].map((o) => parseInt(hex.slice(o, o + 2), 16));
  const rgbHex = (rgb) => "#" + rgb.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("");
  const mixHex = (a, b, t) => { const x = hexRgb(a), y = hexRgb(b); return rgbHex(x.map((v, i) => v + (y[i] - v) * t)); };
  const averageHex = (list) => rgbHex([0, 1, 2].map((i) => list.reduce((s, hex) => s + hexRgb(hex)[i], 0) / list.length));

  /* ----- dither background (weather-adaptive) ---------------------------- */
  // A low-resolution canvas between the wallpaper and the page. Each frame a
  // slow cloud field (two scrolling noise layers) is quantised to four tones
  // through an 8×8 Bayer matrix, then rain or snow is stamped on top. The
  // tones are the page's own colour, a few percent lighter (dark colours) or
  // darker (light ones), drawn as near-transparent ink so the same layer sits
  // over a photo too.
  //
  // The weather picks the scene: cloud cover sets how much of the field
  // shows, wind its drift and the slant of the rain, the WMO code how hard it
  // falls; storms flash now and then; after dark it all slows and dims.
  const DITHER_FPS = 30;
  const BAYER = [0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26, 12, 44, 4, 36, 14, 46, 6, 38, 60, 28, 52, 20, 62, 30, 54, 22,
    3, 35, 11, 43, 1, 33, 9, 41, 51, 19, 59, 27, 49, 17, 57, 25, 15, 47, 7, 39, 13, 45, 5, 37, 63, 31, 55, 23, 61, 29, 53, 21].map((v) => (v + 0.5) / 64);
  // WMO code → how hard it is falling, 0–1 (drizzle … violent showers)
  const FALL = { 51: 0.15, 53: 0.25, 55: 0.4, 56: 0.2, 57: 0.4, 61: 0.3, 63: 0.55, 65: 0.9, 66: 0.35, 67: 0.8, 71: 0.3, 73: 0.6, 75: 0.9, 77: 0.3, 80: 0.4, 81: 0.65, 82: 1, 85: 0.5, 86: 0.9, 95: 0.85, 96: 0.95, 99: 1 };
  const PINNED = { clear: 0, cloud: 3, fog: 45, rain: 63, snow: 73, storm: 95 }; // Settings → Conditions
  const STILL = matchMedia("(prefers-reduced-motion: reduce)");
  const NOISE = 512; // noise tile edge, in canvas pixels (a power of two)
  const dither = { on: false, raf: 0, last: 0, w: 0, h: 0, cur: null, drops: [], flakes: [], flash: 0, nextFlash: 0, o1x: 0, o1y: 0, o2x: 0, o2y: 0, t: 0 };

  // tileable fractal value noise, 0–1
  function makeNoise(cells) {
    const out = new Float32Array(NOISE * NOISE);
    for (let amp = 1, oct = 0; oct < 4; oct++, cells *= 2, amp *= 0.5) {
      const grid = Float32Array.from({ length: cells * cells }, Math.random);
      const smooth = (f) => f * f * (3 - 2 * f);
      for (let y = 0, i = 0; y < NOISE; y++) {
        const fy = (y * cells) / NOISE, y0 = fy | 0, y1 = (y0 + 1) % cells, ty = smooth(fy - y0);
        for (let x = 0; x < NOISE; x++, i++) {
          const fx = (x * cells) / NOISE, x0 = fx | 0, x1 = (x0 + 1) % cells, tx = smooth(fx - x0);
          const top = grid[y0 * cells + x0] + (grid[y0 * cells + x1] - grid[y0 * cells + x0]) * tx;
          const bot = grid[y1 * cells + x0] + (grid[y1 * cells + x1] - grid[y1 * cells + x0]) * tx;
          out[i] += amp * (top + (bot - top) * ty);
        }
      }
    }
    let lo = Infinity, hi = -Infinity;
    for (const v of out) { if (v < lo) lo = v; if (v > hi) hi = v; }
    return out.map((v) => (v - lo) / (hi - lo));
  }

  // weather → what the canvas should be doing
  function ditherScene() {
    const w = weatherNow;
    const pin = PINNED[config.bg.ditherScene];
    const code = pin != null ? pin : w ? w.code : 0;
    const hr = new Date().getHours();
    const night = w ? !w.isDay : hr >= 20 || hr < 5;
    const wind = w ? Math.min(w.wind / 40, 1.25) : 0.15;       // 40 km/h reads as a windy day
    const east = w ? -Math.sin((w.windDir * Math.PI) / 180) : 1; // + = blowing left → right
    const dir = (east < 0 ? -1 : 1) * (0.35 + 0.65 * Math.abs(east));
    const fall = FALL[code] || 0;
    const snowing = (code >= 71 && code <= 77) || code === 85 || code === 86;
    const storm = code >= 95;
    // field: tone = bias + gain × noise (+ grad down the screen), capped
    let f;
    if (code === 45 || code === 48) f = { bias: 0.1, gain: 0.55, cap: 0.75, grad: 0.3, speed: 0.4 };            // fog: an even, near-still haze
    else if (storm) f = { bias: -0.3, gain: 1.4, cap: 0.6, grad: 0, speed: 4 };
    else if (snowing) f = { bias: -0.45, gain: 1.1, cap: 0.4, grad: 0.12, speed: 0.8 };
    else if (fall) f = { bias: -0.5 + 0.15 * fall, gain: 1.3, cap: 0.5, grad: 0, speed: 2 };
    else { const cover = Math.min(code, 3) / 3; f = { bias: -0.6 + 0.45 * cover, gain: 1.5, cap: 1, grad: 0, speed: 1.2 + 1.4 * cover }; }
    const calm = night ? 0.7 : 1;
    const area = dither.w * dither.h;
    return {
      bias: f.bias, gain: f.gain, cap: f.cap, grad: f.grad,
      vx: dir * f.speed * (1 + 5 * wind) * calm,   // canvas px / second
      vy: f.speed * 0.3 * calm,
      slant: dir * Math.min(wind, 1.25) * 0.6,     // sideways px per px fallen
      gust: dir * wind,
      fall, storm, calm,
      dim: night ? 0.8 : 1,
      drops: fall && !snowing ? Math.round(area * (0.0008 + 0.003 * fall)) : 0,
      flakes: snowing ? Math.round(area * (0.001 + 0.003 * fall)) : 0,
    };
  }

  const newDrop = (c, anywhere) => {
    const z = 0.35 + 0.65 * Math.random(), reach = Math.abs(c.slant) * dither.h;
    return { x: -reach + Math.random() * (dither.w + 2 * reach), y: anywhere ? Math.random() * dither.h : -Math.random() * 24, z, len: 4 + (7 + 12 * c.fall) * z };
  };
  const newFlake = (anywhere) => ({ x: Math.random() * dither.w, y: anywhere ? Math.random() * dither.h : -2, z: 0.3 + 0.7 * Math.random(), ph: Math.random() * 6.28 });

  // Bring the canvas in line with the settings and the weather. Called on
  // every background / weather change; cheap when nothing has changed.
  function syncDither() {
    const box = $("#dither");
    const on = config.bg.mode === "dither";
    box.classList.toggle("on", on);
    if (!on) { cancelAnimationFrame(dither.raf); dither.on = false; return; }

    // ink: darker than a light page, lighter than a dark one; a touch stronger
    // over a photo, which has texture of its own to compete with
    const photo = !!bgImage();
    const light = photo ? luminance(wallPalette.mid) > 0.6 : luminance(config.bg.color || "#f4f1ea") > 0.55;
    dither.ink = light ? 0x000000 : 0xffffff;
    dither.step = photo ? 0.05 : light ? 0.032 : 0.04; // alpha per tone
    box.style.backgroundColor = ditherScene().dim < 1 ? "rgba(0, 0, 0, 0.08)" : ""; // night veil

    const fresh = !dither.on;
    if (fresh) {
      dither.on = true;
      if (!dither.n1) { dither.n1 = makeNoise(3); dither.n2 = makeNoise(5); }
      sizeDither();
      dither.cur = ditherScene();
      dither.drops = Array.from({ length: dither.cur.drops }, () => newDrop(dither.cur, true));
      dither.flakes = Array.from({ length: dither.cur.flakes }, () => newFlake(true));
      dither.last = 0;
    }
    cancelAnimationFrame(dither.raf);
    if (STILL.matches) { stepDither(0, true); drawDither(); }
    else dither.raf = requestAnimationFrame(ditherFrame);
  }

  // canvas pixels are 4 CSS px (larger on very wide screens, to bound the work)
  function sizeDither() {
    const box = $("#dither"), cv = box.firstElementChild;
    const scale = Math.max(4, Math.ceil(box.clientWidth / 640));
    const w = Math.ceil(box.clientWidth / scale), ht = Math.ceil(box.clientHeight / scale);
    if (w === dither.w && ht === dither.h) return;
    dither.w = cv.width = w; dither.h = cv.height = ht;
    cv.style.width = w * scale + "px"; cv.style.height = ht * scale + "px";
    dither.ctx = cv.getContext("2d");
    dither.img = dither.ctx.createImageData(w, ht);
    dither.px = new Uint32Array(dither.img.data.buffer);
    dither.lvl = new Uint8Array(w * ht);
  }

  function ditherFrame(now) {
    dither.raf = requestAnimationFrame(ditherFrame);
    if (now - dither.last < 1000 / DITHER_FPS - 2) return;
    const dt = dither.last ? Math.min((now - dither.last) / 1000, 0.1) : 0;
    dither.last = now;
    stepDither(dt, false);
    drawDither();
  }

  // advance the scene by dt seconds (snap: jump straight to the target scene)
  function stepDither(dt, snap) {
    const c = dither.cur, to = ditherScene(), k = snap ? 1 : Math.min(1, dt * 0.9);
    for (const key of ["bias", "gain", "cap", "grad", "vx", "vy", "slant", "gust", "dim"]) c[key] += (to[key] - c[key]) * k;
    c.fall = to.fall || c.fall; // drops already falling keep their pace as the rain eases off
    c.storm = to.storm;
    dither.t += dt;
    dither.o1x -= c.vx * dt; dither.o1y -= c.vy * dt;               // the two layers slide
    dither.o2x -= c.vx * 0.55 * dt; dither.o2y += c.vy * 1.7 * dt;  // apart, so shapes evolve

    // rain: top up towards the target count; drops leaving the screen are
    // recycled, or retired once there are too many
    const { w, h: ht, drops, flakes } = dither;
    if (snap) {
      dither.drops.length = Math.min(drops.length, to.drops); dither.flakes.length = Math.min(flakes.length, to.flakes);
      while (drops.length < to.drops) drops.push(newDrop(c, true));
      while (flakes.length < to.flakes) flakes.push(newFlake(true));
    }
    for (let n = Math.min(to.drops - drops.length, Math.ceil(to.drops * dt)); n > 0; n--) drops.push(newDrop(c, false));
    const speed = (70 + 150 * c.fall) * c.calm;
    for (let i = drops.length - 1; i >= 0; i--) {
      const d = drops[i], v = speed * (0.5 + 0.5 * d.z) * dt;
      d.y += v; d.x += v * c.slant;
      if (d.y - d.len > ht) { if (drops.length > to.drops) drops.splice(i, 1); else drops[i] = newDrop(c, false); }
    }
    for (let n = Math.min(to.flakes - flakes.length, Math.ceil(to.flakes * dt * 0.4)); n > 0; n--) flakes.push(newFlake(false));
    for (let i = flakes.length - 1; i >= 0; i--) {
      const f = flakes[i];
      f.y += (5 + 13 * f.z) * c.calm * dt;
      f.x += (c.gust * 22 * f.z + Math.sin(dither.t * 0.9 + f.ph) * 2.2) * dt;
      if (f.x < 0) f.x += w; else if (f.x >= w) f.x -= w;
      if (f.y > ht) { if (flakes.length > to.flakes) flakes.splice(i, 1); else flakes[i] = newFlake(false); }
    }

    // lightning: a strike every 5–16 s, often with a second flicker
    if (c.storm && !snap) {
      if (!dither.nextFlash) dither.nextFlash = dither.t + 3 + Math.random() * 6;
      if (dither.t >= dither.nextFlash) {
        dither.flash = 0.6 + 0.4 * Math.random();
        dither.nextFlash = dither.t + (Math.random() < 0.45 ? 0.12 + Math.random() * 0.2 : 5 + Math.random() * 11);
      }
    } else dither.nextFlash = 0;
    dither.flash = dither.flash > 0.01 ? dither.flash * Math.exp(-dt * 7) : 0;
  }

  function drawDither() {
    const { w, h: ht, lvl, px, n1, n2, cur: c } = dither;
    const M = NOISE - 1;
    const ax = Math.floor(dither.o1x), ay = Math.floor(dither.o1y), bx = Math.floor(dither.o2x), by = Math.floor(dither.o2y);
    const gain = c.gain / 2, cap = c.cap;

    // 1. the cloud field → tone 0–3 per pixel (ordered dither)
    for (let y = 0, i = 0; y < ht; y++) {
      const r1 = ((y + ay) & M) * NOISE, r2 = ((y + by) & M) * NOISE, t = (y & 7) << 3;
      const base = c.bias + (c.grad * y) / ht;
      for (let x = 0; x < w; x++, i++) {
        let v = base + gain * (n1[r1 + ((x + ax) & M)] + n2[r2 + ((x + bx) & M)]);
        v = v < 0 ? 0 : v > cap ? cap : v;
        const s = v * 3, l = s | 0;
        lvl[i] = s - l > BAYER[t | (x & 7)] ? l + 1 : l;
      }
    }

    // 2. rain: a streak per drop, brightest at the head, dithering out along
    //    the tail; far drops are shorter and fainter
    for (const d of dither.drops) {
      const hx = d.x, hy = Math.floor(d.y), n = d.len | 0;
      for (let k = 0; k < n; k++) {
        const y = hy - k, x = Math.floor(hx - k * c.slant);
        if (y < 0 || y >= ht || x < 0 || x >= w) continue;
        const s = (1 - k / n) * d.z * 3, l = s | 0, tone = s - l > BAYER[((y & 7) << 3) | (x & 7)] ? l + 1 : l, i = y * w + x;
        if (tone > lvl[i]) lvl[i] = tone;
      }
    }

    // 3. snow: single flecks, the nearest ones brighter and a little bigger
    for (const f of dither.flakes) {
      const x = Math.floor(f.x), y = Math.floor(f.y);
      if (y < 0 || y >= ht) continue;
      const i = y * w + x, tone = f.z > 0.72 ? 3 : f.z > 0.45 ? 2 : 1;
      if (tone > lvl[i]) lvl[i] = tone;
      if (f.z > 0.9 && x + 1 < w && y + 1 < ht) { if (lvl[i + 1] < 2) lvl[i + 1] = 2; if (lvl[i + w] < 2) lvl[i + w] = 2; }
    }

    // 4. tones → pixels. Lightning lifts every tone on a dark page, and
    //    washes the pattern out towards the bright page on a light one.
    const tones = [0, 1, 2, 3].map((l) => {
      let a = l * dither.step * c.dim;
      a = dither.ink ? a + dither.flash * 0.1 : a * (1 - dither.flash * 0.85);
      return ((Math.round(a * 255) << 24) | dither.ink) >>> 0;
    });
    for (let i = 0; i < lvl.length; i++) px[i] = tones[lvl[i]];
    dither.ctx.putImageData(dither.img, 0, 0);
  }

  function initDither() {
    let queued = false;
    window.addEventListener("resize", () => {
      if (queued || !dither.on) return;
      queued = true;
      requestAnimationFrame(() => { queued = false; if (!dither.on) return; sizeDither(); if (STILL.matches) { stepDither(0, true); drawDither(); } });
    });
    STILL.addEventListener("change", syncDither);
  }

  /* ----- icon tiles ----------------------------------------------------- */
  // Builds a .tile element. Favicon/image is preloaded and only swapped in on
  // a successful decode, so a blocked/broken icon never shows a broken glyph —
  // it falls back to a clean flat letter.
  function makeTile(link) {
    const t = h("div", { class: "tile" });
    const icon = link.icon || { kind: "auto" };
    const letterChar = ((link.name || "?").trim()[0] || "?").toUpperCase();
    const setLetter = (ch) => { t.innerHTML = ""; t.append(h("span", { class: "letter" }, ch || letterChar)); };
    const swapImg = (src) => {
      const img = new Image();
      img.alt = "";
      img.onload = () => { if (img.naturalWidth > 1) { t.innerHTML = ""; t.append(img); } };
      img.src = src;
    };

    if (icon.kind === "icon") { const s = iconNode(icon); if (s) { t.append(s); return t; } }
    if (icon.kind === "emoji" && icon.value) { t.append(h("span", { class: "emoji" }, icon.value)); return t; }
    if (icon.kind === "letter") { setLetter((icon.value || letterChar).slice(0, 1).toUpperCase()); return t; }
    if (icon.kind === "image" && icon.value) { setLetter(); swapImg(icon.value); return t; }
    // auto → favicon
    setLetter();
    const fav = faviconUrl(link.url);
    if (fav) swapImg(fav);
    return t;
  }

  /* ----- icon set: Lucide, via the Iconify API --------------------------- */
  // Free, ISC-licensed outline icons (lucide.dev). The picker searches and
  // fetches them from api.iconify.design only while it's open; a picked
  // icon's shapes are stored with the link / folder as
  // { kind: "icon", name: "lucide:house", body, w, h }, so tiles render
  // instantly and offline.
  const ICON_API = "https://api.iconify.design";
  const ICON_SET = "lucide";
  const ICON_STARTERS = ["house", "mail", "calendar", "message-circle", "music", "headphones", "film", "tv", "video", "camera", "image", "gamepad-2",
    "shopping-cart", "wallet", "landmark", "chart-line", "briefcase", "newspaper", "book-open", "notebook-pen", "graduation-cap", "file-text", "bookmark", "star",
    "code", "terminal", "github", "server", "database", "cpu", "cloud", "bot", "globe", "map", "plane", "utensils",
    "coffee", "dumbbell", "heart", "palette", "sparkles", "users", "rss", "podcast", "shield", "wrench", "search", "folder"];
  const iconCache = new Map(); // name → { body, w, h }

  // fetch the shapes for many icons in one request; returns the names found
  async function fetchIcons(names) {
    const need = names.filter((n) => !iconCache.has(n));
    if (need.length) {
      const r = await fetch(`${ICON_API}/${ICON_SET}.json?icons=${need.map(encodeURIComponent).join(",")}`);
      const j = await r.json();
      for (const n of need) {
        const alias = j.aliases && j.aliases[n];
        const ic = (j.icons || {})[n] || (alias && j.icons[alias.parent]);
        if (ic) iconCache.set(n, { body: ic.body, w: ic.width || j.width || 24, h: ic.height || j.height || 24 });
      }
    }
    return names.filter((n) => iconCache.has(n));
  }
  async function searchIcons(q) {
    const r = await fetch(`${ICON_API}/search?query=${encodeURIComponent(q)}&prefix=${ICON_SET}&limit=64`);
    const j = await r.json();
    return (j.icons || []).map((full) => full.split(":")[1]);
  }

  // The shapes come from a third-party API and are stored as text, so they're
  // rebuilt through DOMParser keeping only plain shape elements and presentation
  // attributes: nothing that could run script survives.
  const SVG_TAGS = new Set(["svg", "g", "path", "circle", "ellipse", "line", "polyline", "polygon", "rect"]);
  const SVG_ATTRS = new Set(["viewBox", "xmlns", "d", "cx", "cy", "r", "rx", "ry", "x", "y", "x1", "y1", "x2", "y2", "width", "height", "points", "transform", "opacity",
    "fill", "fill-rule", "fill-opacity", "clip-rule", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin", "stroke-miterlimit", "stroke-opacity", "stroke-dasharray"]);
  function iconNode(icon) {
    if (!icon || !icon.body) return null;
    const doc = new DOMParser().parseFromString(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${+icon.w || 24} ${+icon.h || 24}">${icon.body}</svg>`, "image/svg+xml");
    const root = doc.documentElement;
    if (root.nodeName !== "svg") return null;
    const clean = (el) => {
      for (const c of [...el.children]) { if (SVG_TAGS.has(c.nodeName)) clean(c); else c.remove(); }
      for (const a of [...el.attributes]) if (!SVG_ATTRS.has(a.name) || /url\s*\(|javascript:/i.test(a.value)) el.removeAttribute(a.name);
    };
    clean(root);
    const svg = document.importNode(root, true);
    svg.setAttribute("class", "ico");
    svg.setAttribute("aria-hidden", "true");
    return svg;
  }

  // drop the picked-icon fields once another kind is chosen, so they don't linger in storage
  function tidyIcon(icon) {
    if (icon.kind !== "icon") { delete icon.name; delete icon.body; delete icon.w; delete icon.h; }
    return icon;
  }

  // search box + grid of icons; onPick gets { name, body, w, h }
  function iconPicker(currentName, onPick) {
    const grid = h("div", { class: "icon-grid" });
    const status = h("p", { class: "hint icon-status", "aria-live": "polite" });
    let seq = 0, timer = null;

    async function load(q) {
      const my = ++seq;
      status.textContent = "Loading icons…";
      try {
        const cur = currentName && currentName.split(":")[1];
        const names = q ? await searchIcons(q) : [...new Set([cur, ...ICON_STARTERS].filter(Boolean))];
        const found = await fetchIcons(names);
        if (my !== seq) return; // a newer search has started
        grid.innerHTML = "";
        found.forEach((n) => {
          const full = `${ICON_SET}:${n}`, ic = iconCache.get(n);
          const b = h("button", { type: "button", title: n, "aria-label": n, "aria-pressed": String(full === currentName), class: full === currentName ? "active" : "",
            onclick: () => {
              grid.querySelectorAll(".active").forEach((x) => { x.classList.remove("active"); x.setAttribute("aria-pressed", "false"); });
              b.classList.add("active"); b.setAttribute("aria-pressed", "true");
              currentName = full;
              onPick({ name: full, body: ic.body, w: ic.w, h: ic.h });
            } });
          const s = iconNode(ic); if (s) b.append(s);
          grid.append(b);
        });
        status.textContent = found.length ? "" : `No icons match “${q}”.`;
      } catch (e) {
        if (my === seq) status.textContent = "Couldn't reach the icon library. Check your connection and try again.";
      }
    }

    const input = h("input", { type: "text", placeholder: "Search icons: music, mail, code…", spellcheck: "false",
      oninput: (e) => { clearTimeout(timer); timer = setTimeout(() => load(e.target.value.trim()), 250); } });
    load("");
    return h("div", { class: "icon-picker" }, input, grid, status,
      h("p", { class: "hint" }, "Icons from ", h("a", { href: "https://lucide.dev", target: "_blank", rel: "noopener" }, "Lucide"), " (free, ISC licence), via Iconify."));
  }

  /* ----- render --------------------------------------------------------- */
  function pad(n) { return String(n).padStart(2, "0"); }

  function renderClock() {
    const now = new Date();
    const clock = $("#clock");
    clock.innerHTML = "";
    clock.append(pad(now.getHours()), h("span", { class: "colon" }, ":"), pad(now.getMinutes()));

    const hr = now.getHours();
    const part = hr < 5 ? "evening" : hr < 12 ? "morning" : hr < 18 ? "afternoon" : hr < 22 ? "evening" : "night";
    const nm = config.name ? `, ${config.name}` : "";
    $("#greeting").textContent = `Good ${part}${nm}`;

    const len = NARROW.matches ? "short" : "long";
    $("#date").textContent = now.toLocaleDateString(undefined, { weekday: len, month: len, day: "numeric", year: "numeric" }).replace(",", " ·");

    if (config.bg.mode === "adaptive") { document.documentElement.dataset.theme = resolveTheme(); applyBackground(); }
  }

  function renderEngine() {
    $("#engine-label").textContent = ENGINES[config.engine].name;
    const menu = $("#engine-menu");
    menu.innerHTML = "";
    for (const key in ENGINES) {
      menu.append(h("button", { type: "button", role: "menuitemradio", "aria-checked": String(key === config.engine), onclick: () => { config.engine = key; saveConfig(); renderEngine(); menu.classList.remove("open"); $("#q").focus(); } },
        h("span", { class: "dot" }), ENGINES[key].name));
    }
  }

  function recordRecent(id) {
    recent = [id, ...recent.filter((x) => x !== id)].slice(0, 6);
    saveRecent();
  }

  /* ----- links & folders ------------------------------------------------ */
  // `links` is the main row, in order. An entry is a link or a folder:
  // { id, type: "folder", name, icon: { kind: "glyph" | "emoji", value }, children: [link…] }.
  // Folders hold links only (one level deep).
  const isFolder = (x) => !!x && x.type === "folder";
  const allLinks = () => links.flatMap((x) => (isFolder(x) ? x.children : [x]));
  const folderById = (id) => links.find((x) => isFolder(x) && x.id === id) || null;
  const listOf = (folderId) => (folderId ? (folderById(folderId) || {}).children : links);
  const countLabel = (n) => (n === 1 ? "1 link" : `${n} links`);
  // where a link lives: { list, index, folder } (folder is null on the main row)
  function locate(id) {
    let i = links.findIndex((x) => x.id === id);
    if (i >= 0) return { list: links, index: i, folder: null };
    for (const f of links.filter(isFolder)) {
      i = f.children.findIndex((l) => l.id === id);
      if (i >= 0) return { list: f.children, index: i, folder: f };
    }
    return null;
  }

  function makeFolderTile(folder, open) {
    const t = h("div", { class: "tile folder-tile" });
    const icon = folder.icon || {}, picked = icon.kind === "icon" && iconNode(icon);
    if (picked) t.append(picked);
    else if (icon.kind === "emoji" && icon.value) t.append(h("span", { class: "emoji" }, icon.value));
    else t.innerHTML = open ? FOLDER_OPEN : FOLDER;
    return t;
  }

  // the edit / remove pair revealed on hover
  function cardActions(onEdit, onRemove, removeLabel = "Remove") {
    const btn = (title, html, fn) => h("button", { type: "button", title, "aria-label": title, html, onclick: (e) => { e.preventDefault(); e.stopPropagation(); fn(); } });
    return h("div", { class: "card-actions" }, btn("Edit", PENCIL, onEdit), btn(removeLabel, XICON, onRemove));
  }

  function renderLinks() {
    const wrap = $("#links");
    wrap.innerHTML = "";
    links.forEach((item, i) => wrap.append(isFolder(item) ? folderCard(item, i) : linkCard(item, i)));
    wrap.append(addButton());
    if (bubbleEl) renderBubble(false);
  }

  // one "+ Add" button; it pops a small menu above it: Link / Folder
  function addButton() {
    const pick = (fn) => () => { closeAddMenu(); fn(); };
    const menu = h("div", { class: "add-menu", role: "menu" },
      h("button", { type: "button", role: "menuitem", onclick: pick(() => openLinkModal(null)) }, h("span", { class: "add-menu-ico", html: LINK }), "Link"),
      h("button", { type: "button", role: "menuitem", onclick: pick(() => openFolderModal(null)) }, h("span", { class: "add-menu-ico", html: FOLDER }), "Folder"));
    const btn = h("button", { class: "add-card", type: "button", "aria-haspopup": "menu", "aria-expanded": "false",
      onclick: () => {
        const open = !wrap.classList.contains("open");
        wrap.classList.toggle("open", open);
        btn.setAttribute("aria-expanded", String(open));
        if (open && btn.matches(":focus-visible")) menu.querySelector("button").focus();
      } }, h("span", { html: PLUS }), "Add");
    const wrap = h("div", { class: "add-wrap" }, btn, menu);
    return wrap;
  }
  function closeAddMenu() {
    document.querySelectorAll(".add-wrap.open").forEach((w) => { w.classList.remove("open"); w.querySelector(".add-card").setAttribute("aria-expanded", "false"); });
  }

  function linkCard(link, i) {
    const card = h("a", {
      class: "link-card", href: link.url || "#", draggable: String(!TOUCH.matches),
      onclick: (e) => { if (e.target.closest(".card-actions")) { e.preventDefault(); return; } recordRecent(link.id); },
    }, makeTile(link), h("span", { class: "name" }, link.name || "Untitled"), cardActions(() => openLinkModal(link), () => deleteLink(link.id)));
    if (TOUCH.matches) attachLongPress(card, () => openLinkModal(link)); else attachDrag(card, null, i);
    return card;
  }

  // a div (not a <button>) so it can hold the edit / remove buttons
  function folderCard(folder, i) {
    const open = openFolder === folder.id;
    const card = h("div", {
      class: "link-card folder-card", role: "button", tabindex: "0", "data-id": folder.id, draggable: String(!TOUCH.matches),
      "aria-haspopup": "true", "aria-expanded": String(open), "aria-label": `${folder.name || "Folder"}, ${countLabel(folder.children.length)}`,
      onclick: (e) => { if (!e.target.closest(".card-actions")) toggleBubble(folder.id, false); },
      onkeydown: (e) => { if (e.target === card && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); toggleBubble(folder.id, true); } },
    }, makeFolderTile(folder, open), h("span", { class: "name" }, folder.name || "Folder"),
      h("span", { class: "folder-count", "aria-hidden": "true" }, String(folder.children.length)),
      cardActions(() => openFolderModal(folder), () => deleteFolder(folder.id), "Remove folder"));
    if (TOUCH.matches) attachLongPress(card, () => openFolderModal(folder)); else attachDrag(card, null, i);
    return card;
  }

  /* ----- folder bubble -------------------------------------------------- */
  // Clicking a folder opens its links in a speech bubble above it (below, if
  // there's no room above), its tail pointing at the folder. It lives in
  // .app, positioned in page coordinates, so it scrolls with the page.
  // Clicking anywhere else, Esc, or the folder again closes it.
  let openFolder = null, bubbleEl = null;

  function toggleBubble(id, viaKeyboard) {
    if (openFolder === id) { closeBubble(viaKeyboard); return; }
    if (bubbleEl) bubbleEl.remove();
    bubbleEl = null;
    openFolder = id;
    syncFolderCards();
    renderBubble(true);
    if (viaKeyboard && bubbleEl) { const first = bubbleEl.querySelector(".bubble-item"); if (first) first.focus(); }
  }

  function closeBubble(focusCard) {
    const b = bubbleEl, id = openFolder;
    if (!b) return;
    bubbleEl = null; openFolder = null;
    syncFolderCards();
    b.classList.add("closing");
    b.addEventListener("animationend", (e) => { if (e.target === b) b.remove(); });
    setTimeout(() => b.remove(), 300); // in case the animation never runs
    if (focusCard) { const c = $(`.folder-card[data-id="${id}"]`); if (c) c.focus(); }
  }

  // open state on the folder cards without re-rendering the row (which would
  // flash every favicon back to its letter)
  function syncFolderCards() {
    document.querySelectorAll(".folder-card").forEach((c) => {
      const f = folderById(c.dataset.id), open = c.dataset.id === openFolder;
      c.setAttribute("aria-expanded", String(open));
      if (f) c.querySelector(".tile").replaceWith(makeFolderTile(f, open));
    });
  }

  // animate: true on open; false when re-rendering an open bubble after an edit
  function renderBubble(animate) {
    const folder = folderById(openFolder);
    const card = folder && $(`.folder-card[data-id="${folder.id}"]`);
    if (!card) { if (bubbleEl) bubbleEl.remove(); bubbleEl = null; openFolder = null; return; }

    const grid = h("div", { class: "bubble-grid" });
    folder.children.forEach((link, j) => grid.append(bubbleItem(link, folder.id, j)));
    grid.append(h("button", { class: "bubble-item bubble-add", type: "button", onclick: () => openLinkModal(null, folder.id) },
      h("span", { class: "tile", html: PLUS }), h("span", { class: "name" }, "Add link")));
    [...grid.children].forEach((el, j) => el.style.setProperty("--i", j)); // stagger
    // the items rise in from below and overshoot, which would briefly
    // overflow the grid and flash its scrollbar: no scrolling until the last
    // one has landed
    if (animate) {
      grid.classList.add("opening");
      grid.addEventListener("animationend", (e) => { if (e.target === grid.lastElementChild) grid.classList.remove("opening"); });
    }

    const b = h("div", { class: "bubble" + (animate ? "" : " static"), role: "group", "aria-label": `${folder.name || "Folder"} folder` },
      h("div", { class: "bubble-head" },
        h("span", { class: "bubble-title" }, folder.name || "Folder"),
        h("span", { class: "bubble-count" }, countLabel(folder.children.length)),
        h("button", { class: "bubble-edit", type: "button", title: "Edit folder", "aria-label": "Edit folder", html: PENCIL, onclick: () => openFolderModal(folder) })),
      grid);
    attachDropZone(b, folder.id);
    if (bubbleEl) bubbleEl.replaceWith(b); else $(".app").append(b);
    bubbleEl = b;
    placeBubble();
  }

  function bubbleItem(link, folderId, j) {
    const item = h("a", {
      class: "bubble-item", href: link.url || "#", draggable: String(!TOUCH.matches),
      onclick: (e) => { if (e.target.closest(".card-actions")) { e.preventDefault(); return; } recordRecent(link.id); },
    }, makeTile(link), h("span", { class: "name" }, link.name || "Untitled"), cardActions(() => openLinkModal(link), () => deleteLink(link.id)));
    if (TOUCH.matches) attachLongPress(item, () => openLinkModal(link)); else attachDrag(item, folderId, j);
    return item;
  }

  // centre over the folder, kept inside the page gutters; the tail tracks the
  // folder's centre even when the bubble is pushed sideways
  function placeBubble() {
    const b = bubbleEl, card = b && $(`.folder-card[data-id="${openFolder}"]`);
    if (!card) return;
    const app = $(".app").getBoundingClientRect(), c = card.getBoundingClientRect();
    const vw = document.documentElement.clientWidth, gutter = 16, gap = 13;
    const w = Math.min(400, vw - gutter * 2);
    b.style.width = w + "px";
    const cx = c.left + c.width / 2;
    const left = Math.max(gutter, Math.min(cx - w / 2, vw - gutter - w));
    const below = c.top - gap - b.offsetHeight < 8;
    const top = below ? c.bottom + gap : c.top - gap - b.offsetHeight;
    b.classList.toggle("below", below);
    b.style.left = left - app.left + "px";
    b.style.top = top - app.top + "px";
    b.style.setProperty("--tail-x", Math.max(24, Math.min(cx - left, w - 24)) + "px");
  }

  function renderRecent() {
    const el = $("#recent");
    const all = allLinks();
    const items = recent.map((id) => all.find((l) => l.id === id)).filter(Boolean);
    if (!config.showRecent || !items.length) { el.classList.add("hidden"); el.innerHTML = ""; return; }
    el.classList.remove("hidden");
    el.innerHTML = "";
    el.append(h("span", { class: "label" }, "Recent"));
    items.slice(0, 5).forEach((l) => el.append(h("a", { href: l.url, onclick: () => recordRecent(l.id) }, l.name)));
  }

  function renderAll() { applyBackground(); renderClock(); renderEngine(); renderLinks(); renderRecent(); renderWeather(); }

  /* ----- drag to reorder / file into folders ----------------------------- */
  // The dragged entry is { folder, index } (folder null = the main row).
  // Dropped on a main-row card it takes that card's place; a link dropped on
  // a folder card goes inside it; on a link in the open bubble it takes that
  // link's place; on empty space in the row or the bubble it goes to the end.
  let drag = null;
  const clearDragOver = () => document.querySelectorAll(".drag-over").forEach((c) => c.classList.remove("drag-over"));

  // where dropping on (folderId, index) sends the dragged entry, or null if
  // it can't go there; index null = the list's empty space
  function dropTarget(folderId, index) {
    const item = drag && (listOf(drag.folder) || [])[drag.index];
    if (!item || (isFolder(item) && folderId)) return null; // folders stay on the main row
    const target = index == null ? null : listOf(folderId)[index];
    if (isFolder(target) && !isFolder(item)) return target.id === drag.folder ? null : { folder: target.id, index: Infinity };
    if (index == null) return { folder: folderId, index: Infinity };
    if (folderId === drag.folder && index === drag.index) return null;
    return { folder: folderId, index };
  }

  function dropHere(e, folderId, index) {
    e.preventDefault(); e.stopPropagation(); clearDragOver();
    const t = dropTarget(folderId, index), src = drag;
    drag = null;
    if (!t) return;
    const from = listOf(src.folder), to = listOf(t.folder);
    const [moved] = from.splice(src.index, 1);
    to.splice(Math.min(t.index, to.length), 0, moved);
    saveLinks(); renderLinks(); renderRecent();
  }

  function attachDrag(el, folderId, index) {
    el.addEventListener("dragstart", (e) => { drag = { folder: folderId, index }; el.classList.add("dragging"); e.dataTransfer.effectAllowed = "move"; try { e.dataTransfer.setData("text/plain", String(index)); } catch (x) {} });
    el.addEventListener("dragend", () => { drag = null; el.classList.remove("dragging"); clearDragOver(); });
    el.addEventListener("dragover", (e) => {
      e.stopPropagation(); // a card is never its container's empty space
      if (!dropTarget(folderId, index)) return;
      e.preventDefault(); e.dataTransfer.dropEffect = "move"; el.classList.add("drag-over");
    });
    el.addEventListener("dragleave", (e) => { if (!el.contains(e.relatedTarget)) el.classList.remove("drag-over"); });
    el.addEventListener("drop", (e) => dropHere(e, folderId, index));
  }

  // the row / bubble itself, for drops on empty space
  function attachDropZone(el, folderId) {
    el.addEventListener("dragover", (e) => { if (!dropTarget(folderId, null)) return; e.preventDefault(); e.dataTransfer.dropEffect = "move"; el.classList.add("drag-over"); });
    el.addEventListener("dragleave", (e) => { if (!el.contains(e.relatedTarget)) el.classList.remove("drag-over"); });
    el.addEventListener("drop", (e) => dropHere(e, folderId, null));
  }

  /* ----- touch: press and hold a card to edit it ------------------------- */
  // Touch screens have no hover to reveal the edit / remove buttons (and a
  // long press would otherwise start a drag or the browser's link menu), so
  // holding a card opens its edit sheet instead; Delete lives in there.
  function attachLongPress(card, onHold) {
    let timer = null, x = 0, y = 0, fired = false;
    const cancel = () => { clearTimeout(timer); timer = null; };
    card.addEventListener("touchstart", (e) => {
      cancel(); fired = false;
      if (e.touches.length !== 1) return;
      x = e.touches[0].clientX; y = e.touches[0].clientY;
      timer = setTimeout(() => { timer = null; fired = true; if (navigator.vibrate) navigator.vibrate(10); onHold(); }, 500);
    }, { passive: true });
    card.addEventListener("touchmove", (e) => { const t = e.touches[0]; if (Math.hypot(t.clientX - x, t.clientY - y) > 10) cancel(); }, { passive: true });
    card.addEventListener("touchend", (e) => { cancel(); if (fired) e.preventDefault(); });
    card.addEventListener("touchcancel", cancel);
    card.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  /* ----- modals --------------------------------------------------------- */
  function openModal(node) {
    closeModal();
    const overlay = h("div", { class: "overlay", onclick: (e) => { if (e.target === overlay) closeModal(); } }, node);
    overlay.id = "overlay";
    document.body.append(overlay);
    document.addEventListener("keydown", escClose);
    // on touch screens focusing a field would throw the keyboard up over the sheet
    const f = !TOUCH.matches && overlay.querySelector("input, button, [tabindex]"); if (f) setTimeout(() => f.focus(), 30);
  }
  function closeModal() { const o = $("#overlay"); if (o) o.remove(); document.removeEventListener("keydown", escClose); }
  function escClose(e) { if (e.key === "Escape") closeModal(); }

  function seg(options, current, onPick) {
    const wrap = h("div", { class: "segmented" });
    options.forEach((o) => wrap.append(h("button", { type: "button", class: o.value === current ? "active" : "", onclick: (e) => {
      [...wrap.children].forEach((b) => b.classList.toggle("active", b === e.currentTarget));
      onPick(o.value);
    } }, o.label)));
    return wrap;
  }

  // ----- Add / Edit link -----
  // inFolder: the folder a new link starts in (from a bubble's "Add link")
  function openLinkModal(existing, inFolder) {
    const editing = !!existing;
    const draft = editing
      ? { id: existing.id, name: existing.name, url: existing.url, icon: Object.assign({ kind: "auto", value: "" }, existing.icon) }
      : { id: uid(), name: "", url: "", icon: { kind: "auto", value: "" } };
    const at = editing ? locate(existing.id) : null;
    let dest = at ? (at.folder ? at.folder.id : "") : (inFolder || "");

    // folder picker, only once there are folders to pick
    const folders = links.filter(isFolder);
    const folderSelect = folders.length ? h("select", { onchange: (e) => { dest = e.target.value; } },
      h("option", { value: "" }, "None (main row)"),
      folders.map((f) => h("option", { value: f.id }, f.name || "Folder"))) : null;
    if (folderSelect) folderSelect.value = dest;

    const nameInput = h("input", { type: "text", value: draft.name, placeholder: "GitHub", oninput: (e) => { draft.name = e.target.value; redrawPreview(); } });
    const urlInput  = h("input", { type: "url",  value: draft.url,  placeholder: "github.com", oninput: (e) => { draft.url = e.target.value; if (draft.icon.kind === "auto") redrawPreview(); } });

    const pvMeta = h("div", { class: "pv-meta" }, h("b", {}, "Preview"), h("span", {}, "How this link will look"));

    // live preview tile — always re-rendered into the #pv-tile slot
    const previewTileSlot = h("div", { class: "tile", id: "pv-tile" });
    function redrawPreview() {
      const tmp = { name: draft.name || "?", url: normalizeUrl(draft.url), icon: draft.icon };
      const t = makeTile(tmp);
      previewTileSlot.innerHTML = t.innerHTML;
    }

    // icon-kind controls container
    const iconControls = h("div", {});
    function renderIconControls() {
      iconControls.innerHTML = "";
      const k = draft.icon.kind;
      if (k === "auto") {
        iconControls.append(h("p", { class: "hint" }, "Uses the site's favicon, pulled from the URL above. Falls back to a letter tile if none is found."));
      } else if (k === "icon") {
        iconControls.append(iconPicker(draft.icon.name, (ic) => { Object.assign(draft.icon, ic); redrawPreview(); }));
      } else if (k === "emoji") {
        const inp = h("input", { type: "text", value: draft.icon.value || "", placeholder: "Paste or pick an emoji", maxlength: "4", oninput: (e) => { draft.icon.value = e.target.value; redrawPreview(); } });
        const grid = h("div", { class: "emoji-grid" });
        EMOJIS.forEach((em) => grid.append(h("button", { type: "button", onclick: () => { draft.icon.value = em; inp.value = em; redrawPreview(); } }, em)));
        iconControls.append(inp, grid);
      } else if (k === "image") {
        iconControls.append(
          h("input", { type: "url", value: draft.icon.value || "", placeholder: "https://…/icon.png", oninput: (e) => { draft.icon.value = e.target.value; redrawPreview(); } }),
          h("p", { class: "hint" }, "Paste a direct link to an image (PNG, SVG, JPG)."));
      } else if (k === "letter") {
        iconControls.append(
          h("input", { type: "text", value: draft.icon.value || "", placeholder: (draft.name || "A")[0], maxlength: "2", oninput: (e) => { draft.icon.value = e.target.value; redrawPreview(); } }),
          h("p", { class: "hint" }, "A single letter on a clean tile. Defaults to the link's first letter."));
      }
    }

    const sheet = h("div", { class: "sheet" },
      h("h2", {}, editing ? "Edit link" : "Add link"),
      h("p", { class: "sub" }, editing ? "Update the name, address, or icon." : inFolder && folderById(inFolder) ? `Add a shortcut to ${folderById(inFolder).name || "this folder"}.` : "Add a shortcut to your home page."),
      h("div", { class: "icon-preview" }, previewTileSlot, pvMeta),
      h("div", { class: "field" }, h("label", {}, "Name"), nameInput),
      h("div", { class: "field" }, h("label", {}, "URL"), urlInput),
      folderSelect ? h("div", { class: "field" }, h("label", {}, "Folder"), folderSelect) : null,
      h("div", { class: "field" },
        h("label", {}, "Icon"),
        seg([{ value: "auto", label: "Auto" }, { value: "icon", label: "Icon" }, { value: "emoji", label: "Emoji" }, { value: "image", label: "Image" }, { value: "letter", label: "Letter" }], draft.icon.kind, (v) => { draft.icon.kind = v; rerenderIconSeg(v); renderIconControls(); redrawPreview(); }),
        iconControls),
      h("div", { class: "actions" },
        editing ? h("button", { class: "btn btn-danger spacer", type: "button", onclick: () => { deleteLink(draft.id); closeModal(); } }, "Delete") : null,
        h("button", { class: "btn btn-ghost", type: "button", onclick: closeModal }, "Cancel"),
        h("button", { class: "btn btn-primary", type: "button", onclick: save }, editing ? "Save" : "Add link")));

    // keep the segmented control's active state in sync
    function rerenderIconSeg(v) {
      const segEl = sheet.querySelectorAll(".segmented")[0];
      [...segEl.children].forEach((b) => b.classList.toggle("active", b.textContent.toLowerCase() === v));
    }

    function save() {
      draft.name = (draft.name || "").trim() || domainOf(normalizeUrl(draft.url)) || "Untitled";
      draft.url = normalizeUrl(draft.url);
      tidyIcon(draft.icon);
      // same place: replace in position; another folder / the row: move to its end
      const now = editing ? locate(draft.id) : null;
      const target = listOf(dest) || links;
      if (now && now.list === target) now.list[now.index] = draft;
      else { if (now) now.list.splice(now.index, 1); target.push(draft); }
      saveLinks(); renderLinks(); renderRecent(); closeModal();
    }

    renderIconControls();
    openModal(sheet);
    redrawPreview();
  }

  function deleteLink(id) {
    const at = locate(id);
    if (at) at.list.splice(at.index, 1);
    recent = recent.filter((x) => x !== id);
    saveLinks(); saveRecent(); renderLinks(); renderRecent();
  }

  // removing a folder keeps its links: they go back onto the row in its place
  function deleteFolder(id) {
    const i = links.findIndex((x) => x.id === id);
    if (i < 0) return;
    if (openFolder === id) closeBubble(false);
    links.splice(i, 1, ...links[i].children);
    saveLinks(); renderLinks(); renderRecent();
  }

  // ----- New / Edit folder -----
  function openFolderModal(existing) {
    const editing = !!existing;
    const draft = { name: editing ? existing.name : "", icon: Object.assign({ kind: "glyph", value: "" }, editing ? existing.icon : null) };

    const previewTileSlot = h("div", { class: "tile folder-tile" });
    const redrawPreview = () => { previewTileSlot.innerHTML = makeFolderTile(draft, false).innerHTML; };

    const iconControls = h("div", {});
    function renderIconControls() {
      iconControls.innerHTML = "";
      if (draft.icon.kind === "emoji") {
        const inp = h("input", { type: "text", value: draft.icon.value || "", placeholder: "Paste or pick an emoji", maxlength: "4", oninput: (e) => { draft.icon.value = e.target.value; redrawPreview(); } });
        const grid = h("div", { class: "emoji-grid" });
        EMOJIS.forEach((em) => grid.append(h("button", { type: "button", onclick: () => { draft.icon.value = em; inp.value = em; redrawPreview(); } }, em)));
        iconControls.append(inp, grid);
      } else if (draft.icon.kind === "icon") {
        iconControls.append(iconPicker(draft.icon.name, (ic) => { Object.assign(draft.icon, ic); redrawPreview(); }));
      } else {
        iconControls.append(h("p", { class: "hint" }, "A plain folder glyph, which opens when its bubble does."));
      }
    }

    const KINDS = ["glyph", "icon", "emoji"];
    const iconSeg = seg([{ value: "glyph", label: "Folder" }, { value: "icon", label: "Icon" }, { value: "emoji", label: "Emoji" }], draft.icon.kind, (v) => {
      draft.icon.kind = v;
      [...iconSeg.children].forEach((b, i) => b.classList.toggle("active", KINDS[i] === v));
      renderIconControls(); redrawPreview();
    });

    const sheet = h("div", { class: "sheet" },
      h("h2", {}, editing ? "Edit folder" : "New folder"),
      h("p", { class: "sub" }, editing ? "Rename it or change its icon." : "Group links under one card. Click it to open them in a bubble."),
      h("div", { class: "icon-preview" }, previewTileSlot, h("div", { class: "pv-meta" }, h("b", {}, "Preview"), h("span", {}, editing ? countLabel(existing.children.length) : "Empty for now"))),
      h("div", { class: "field" }, h("label", {}, "Name"),
        h("input", { type: "text", value: draft.name, placeholder: "Work", oninput: (e) => { draft.name = e.target.value; } })),
      h("div", { class: "field" }, h("label", {}, "Icon"), iconSeg, iconControls),
      editing ? h("p", { class: "hint" }, "Deleting a folder keeps its links: they move back to the main row.") : null,
      h("div", { class: "actions" },
        editing ? h("button", { class: "btn btn-danger spacer", type: "button", onclick: () => { closeModal(); deleteFolder(existing.id); } }, "Delete") : null,
        h("button", { class: "btn btn-ghost", type: "button", onclick: closeModal }, "Cancel"),
        h("button", { class: "btn btn-primary", type: "button", onclick: save }, editing ? "Save" : "Create folder")));

    function save() {
      const name = (draft.name || "").trim() || "Folder";
      const k = draft.icon.kind;
      const icon = (k === "emoji" && draft.icon.value) || (k === "icon" && draft.icon.body) ? tidyIcon(draft.icon) : { kind: "glyph", value: "" };
      const id = editing ? existing.id : uid();
      if (editing) Object.assign(existing, { name, icon });
      else links.push({ id, type: "folder", name, icon, children: [] });
      saveLinks(); closeModal(); renderLinks();
      if (!editing) toggleBubble(id, false); // open it, ready for "Add link"
    }

    renderIconControls();
    openModal(sheet);
    redrawPreview();
  }

  // ----- Settings -----
  function openSettingsModal() {
    const sheet = h("div", { class: "sheet" });
    sheet.append(h("h2", {}, "Settings"), h("p", { class: "sub" }, "Personalize your home page."));

    // name
    sheet.append(h("div", { class: "field" }, h("label", {}, "Your name"),
      h("input", { type: "text", value: config.name, placeholder: "e.g. Alex", oninput: (e) => { config.name = e.target.value; saveConfig(); renderClock(); } })));

    // engine
    sheet.append(h("div", { class: "field" }, h("label", {}, "Search engine"),
      seg(Object.keys(ENGINES).map((k) => ({ value: k, label: ENGINES[k].name })), config.engine, (v) => { config.engine = v; saveConfig(); renderEngine(); })));

    sheet.append(h("div", { class: "section-divider" }));

    // background mode
    const bgField = h("div", { class: "field" }, h("label", {}, "Background"),
      seg([{ value: "paper", label: "Paper" }, { value: "solid", label: "Solid" }, { value: "image", label: "Image" }, { value: "adaptive", label: "Adaptive" }, { value: "dither", label: "Dither" }], config.bg.mode, (v) => { config.bg.mode = v; saveConfig(); applyBackground(); renderWeather(); renderBgControls(); }));
    const bgControls = h("div", {});
    sheet.append(bgField, bgControls);

    // the 8 swatches + a free picker (a native colour input under a swatch)
    function colourSwatches() {
      const cur = (config.bg.color || "").toLowerCase();
      const sw = h("div", { class: "swatches", style: { marginTop: "10px" } });
      SWATCHES.forEach((c) => sw.append(h("div", { class: "swatch" + (c === cur ? " active" : ""), style: { background: c }, title: c, onclick: () => { config.bg.color = c; saveConfig(); applyBackground(); renderBgControls(); } })));
      const custom = !SWATCHES.includes(cur);
      const tile = h("label", { class: "swatch swatch-custom" + (custom ? " active" : ""), title: "Custom colour", style: custom ? { background: cur } : null },
        h("span", { html: PLUS }),
        h("input", { type: "color", value: /^#[\da-f]{6}$/.test(cur) ? cur : "#f4f1ea", "aria-label": "Custom colour",
          // live while the picker is open; the row is only rebuilt once it closes
          oninput: (e) => { config.bg.color = e.target.value; tile.style.background = e.target.value; applyBackground(); },
          onchange: () => { saveConfig(); renderBgControls(); } }));
      sw.append(tile);
      return sw;
    }
    const imageInput = () => h("input", { type: "url", value: config.bg.imageUrl, placeholder: "https://…/photo.jpg", oninput: (e) => { config.bg.imageUrl = e.target.value; }, onchange: (e) => { config.bg.imageUrl = e.target.value.trim(); saveConfig(); applyBackground(); } });

    function renderBgControls() {
      bgControls.innerHTML = "";
      const m = config.bg.mode;
      if (m === "solid") {
        bgControls.append(colourSwatches());
      } else if (m === "image") {
        bgControls.append(
          h("div", { class: "field", style: { marginTop: "10px", marginBottom: "0" } },
            imageInput(),
            h("p", { class: "hint" }, "Paste any image URL. Tip: Unsplash 'Download' links work great. Text switches to light automatically — override below.")));
      } else if (m === "adaptive") {
        bgControls.append(h("p", { class: "hint", style: { marginTop: "10px" } }, "Tones shift through the day — soft light by morning, warm at dusk, deep at night."));
      } else if (m === "dither") {
        const scenes = [["live", "Live weather"], ["clear", "Clear"], ["cloud", "Cloudy"], ["fog", "Fog"], ["rain", "Rain"], ["snow", "Snow"], ["storm", "Storm"]];
        bgControls.append(
          h("div", { class: "row", style: { marginTop: "12px" } },
            h("span", { class: "hint", style: { margin: "0" } }, "Drawn over"),
            seg([{ value: "color", label: "Colour" }, { value: "image", label: "Image" }], config.bg.ditherBase, (v) => { config.bg.ditherBase = v; saveConfig(); applyBackground(); renderBgControls(); })),
          config.bg.ditherBase === "image"
            ? h("div", { class: "field", style: { marginTop: "10px", marginBottom: "0" } }, imageInput())
            : colourSwatches(),
          h("div", { class: "row", style: { marginTop: "12px" } },
            h("span", { class: "hint", style: { margin: "0" } }, "Conditions"),
            h("div", { class: "field", style: { margin: "0" } },
              h("select", { "aria-label": "Conditions", onchange: (e) => { config.bg.ditherScene = e.target.value; saveConfig(); syncDither(); } },
                scenes.map(([value, label]) => h("option", { value, selected: value === config.bg.ditherScene ? "" : null }, label))))),
          h("p", { class: "hint" }, "A quiet dithered texture that moves with the weather outside — drifting when clear, falling as rain, settling as snow. Live weather needs location access; without it the pattern simply drifts."));
      } else {
        bgControls.append(h("p", { class: "hint", style: { marginTop: "10px" } }, "Warm off-white paper — the Editorial default."));
      }
    }
    renderBgControls();

    // appearance
    sheet.append(h("div", { class: "field", style: { marginTop: "16px" } }, h("label", {}, "Text & contrast"),
      seg([{ value: "auto", label: "Auto" }, { value: "light", label: "Dark text" }, { value: "dark", label: "Light text" }], config.appearance, (v) => { config.appearance = v; saveConfig(); applyBackground(); })));

    sheet.append(h("div", { class: "section-divider" }));

    // weather
    const wToggle = h("button", { type: "button", class: "toggle" + (config.weather.enabled ? " on" : ""), role: "switch", "aria-checked": String(config.weather.enabled), onclick: () => { config.weather.enabled = !config.weather.enabled; wToggle.classList.toggle("on", config.weather.enabled); saveConfig(); renderWeather(); } });
    sheet.append(h("div", { class: "field" }, h("div", { class: "row" }, h("label", { style: { margin: "0" } }, "Weather widget"), wToggle),
      h("div", { class: "row", style: { marginTop: "12px" } },
        h("span", { class: "hint", style: { margin: "0" } }, "Temperature unit"),
        seg([{ value: "c", label: "°C" }, { value: "f", label: "°F" }], config.weather.unit, (v) => { config.weather.unit = v; saveConfig(); localStorage.removeItem(LS.weather); renderWeather(); }))));

    // recent toggle
    const rToggle = h("button", { type: "button", class: "toggle" + (config.showRecent ? " on" : ""), role: "switch", "aria-checked": String(config.showRecent), onclick: () => { config.showRecent = !config.showRecent; rToggle.classList.toggle("on", config.showRecent); saveConfig(); renderRecent(); } });
    sheet.append(h("div", { class: "field" }, h("div", { class: "row" }, h("label", { style: { margin: "0" } }, "Show recent links"), rToggle)));

    sheet.append(h("div", { class: "actions" },
      h("button", { class: "btn btn-danger spacer", type: "button", onclick: resetAll }, "Reset everything"),
      h("button", { class: "btn btn-primary", type: "button", onclick: closeModal }, "Done")));

    openModal(sheet);
  }

  function resetAll() {
    if (!confirm("Reset all links, background, and settings to defaults?")) return;
    config = structuredClone(DEFAULT_CONFIG);
    links = structuredClone(DEFAULT_LINKS);
    recent = [];
    saveConfig(); saveLinks(); saveRecent();
    localStorage.removeItem(LS.weather);
    weatherNow = null;
    closeModal(); renderAll();
  }

  /* ----- notes (always-visible rich-text notepad) ------------------------ */
  // A contenteditable surface driven by document.execCommand. It is formally
  // deprecated but still fully supported in Chrome, and it is what gives the
  // editor a native undo/redo stack shared with typing. Content is stored as
  // HTML in localStorage and synced between open tabs via the storage event.
  const EMPTY_NOTE = "<p><br></p>";
  const MOD = /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl+";
  let notesEd = null, notesBar = null, notesSaveTimer = null, notesMetaTimer = null;

  function noteTools() {
    return [
      [
        { cmd: "h2", block: "h2", title: `Title (${MOD}Alt+1)`, icon: ICON_H1 },
        { cmd: "h3", block: "h3", title: `Subheading (${MOD}Alt+2)`, icon: ICON_H2 },
      ],
      [
        { cmd: "bold", state: true, title: `Bold (${MOD}B)`, icon: ICON_BOLD },
        { cmd: "italic", state: true, title: `Italic (${MOD}I)`, icon: ICON_ITALIC },
        { cmd: "underline", state: true, title: `Underline (${MOD}U)`, icon: ICON_UNDERLINE },
        { cmd: "strikeThrough", state: true, title: "Strikethrough", icon: ICON_STRIKE },
      ],
      [
        { cmd: "insertUnorderedList", state: true, title: `Bulleted list (${MOD}Shift+8)`, icon: ICON_UL },
        { cmd: "insertOrderedList", state: true, title: `Numbered list (${MOD}Shift+7)`, icon: ICON_OL },
      ],
      [
        { cmd: "undo", title: `Undo (${MOD}Z)`, icon: ICON_UNDO },
        { cmd: "redo", title: `Redo (${MOD}Shift+Z)`, icon: ICON_REDO },
      ],
    ];
  }

  function initNotes() {
    notesEd = $("#notes-editor");
    notesBar = $("#notes-toolbar");
    try { document.execCommand("defaultParagraphSeparator", false, "p"); } catch (e) {}

    // toolbar: groups separated by hairlines, undo/redo pushed to the right
    const groups = noteTools();
    groups.forEach((group, gi) => {
      const last = gi === groups.length - 1;
      if (gi > 0 && !last) notesBar.append(h("span", { class: "note-sep", "aria-hidden": "true" }));
      const wrap = h("div", { class: "note-group" + (last ? " note-tools-end" : ""), style: { display: "flex", gap: "2px" } });
      group.forEach((t) => wrap.append(h("button", {
        type: "button", class: "note-tool", title: t.title, "aria-label": t.title.replace(/ \(.*\)$/, ""),
        "data-cmd": t.cmd, "data-block": t.block, "data-state": t.state ? "1" : null,
        "aria-pressed": t.block || t.state ? "false" : null, html: t.icon,
        // keep the caret/selection in the editor when a button is clicked
        onmousedown: (e) => e.preventDefault(),
        onclick: () => runNoteTool(t),
      })));
      notesBar.append(wrap);
    });

    let saved = "";
    try { saved = localStorage.getItem(LS.notes) || ""; } catch (e) {}
    setNotesHTML(saved);

    notesEd.addEventListener("input", () => { refreshNotes(); scheduleNotesSave(); });

    // paste as plain text so notes keep one consistent look (still undoable)
    notesEd.addEventListener("paste", (e) => {
      const text = e.clipboardData && e.clipboardData.getData("text/plain");
      if (text == null) return;
      e.preventDefault();
      document.execCommand("insertText", false, text);
    });

    notesEd.addEventListener("keydown", onNotesKey);

    document.addEventListener("selectionchange", () => {
      const sel = document.getSelection();
      if (sel && sel.anchorNode && notesEd.contains(sel.anchorNode)) updateNoteTools();
    });
    notesEd.addEventListener("blur", () => { flushNotes(); updateNoteTools(true); });

    // another new tab edited the notes → pick it up unless we're mid-edit here
    window.addEventListener("storage", (e) => {
      if (e.key !== LS.notes || document.activeElement === notesEd) return;
      setNotesHTML(e.newValue);
    });
    document.addEventListener("visibilitychange", () => { if (document.hidden) flushNotes(); });
    window.addEventListener("pagehide", flushNotes);
  }

  // Load stored HTML into the editor. Chrome's list command can leave a list
  // nested inside a <p>; the HTML parser splits that into stray empty <p>s,
  // which would otherwise add phantom gaps every time the page reloads.
  function setNotesHTML(html) {
    notesEd.innerHTML = (html || "").trim() ? html : EMPTY_NOTE;
    notesEd.querySelectorAll("p").forEach((p) => { if (!p.firstChild) p.remove(); });
    if (!notesEd.firstChild) notesEd.innerHTML = EMPTY_NOTE;
    refreshNotes();
  }

  function onNotesKey(e) {
    const mod = e.ctrlKey || e.metaKey;
    // Tab / Shift+Tab nest list items; outside a list Tab moves focus as usual
    if (e.key === "Tab" && !mod && !e.altKey) {
      if (document.queryCommandState("insertUnorderedList") || document.queryCommandState("insertOrderedList")) {
        e.preventDefault();
        execNote(e.shiftKey ? "outdent" : "indent");
      }
      return;
    }
    if (!mod) return;
    const map = {
      "alt:Digit1": "h2", "alt:Digit2": "h3",
      "shift:Digit8": "insertUnorderedList", "shift:Digit7": "insertOrderedList",
    };
    const key = (e.altKey ? "alt:" : e.shiftKey ? "shift:" : "") + e.code;
    const cmd = map[key];
    if (!cmd) return;
    e.preventDefault();
    const tool = noteTools().flat().find((t) => t.cmd === cmd);
    if (tool) runNoteTool(tool);
  }

  // make sure the editor has focus and a caret inside it before a command runs
  function focusNotes() {
    const sel = window.getSelection();
    if (document.activeElement !== notesEd) notesEd.focus();
    if (!sel.rangeCount || !notesEd.contains(sel.anchorNode)) {
      let node = notesEd;
      while (node.lastElementChild && node.lastElementChild.tagName !== "BR") node = node.lastElementChild;
      const r = document.createRange();
      r.selectNodeContents(node);
      r.collapse(false);
      sel.removeAllRanges();
      sel.addRange(r);
    }
  }

  function execNote(cmd, value) {
    document.execCommand(cmd, false, value == null ? null : value);
  }

  function runNoteTool(t) {
    focusNotes();
    if (t.block) {
      const cur = (document.queryCommandValue("formatBlock") || "").toLowerCase();
      execNote("formatBlock", cur === t.block ? "<p>" : `<${t.block}>`);
    } else {
      execNote(t.cmd);
    }
    refreshNotes();
    updateNoteTools();
    scheduleNotesSave();
  }

  function updateNoteTools(clear) {
    const block = clear ? "" : (document.queryCommandValue("formatBlock") || "").toLowerCase();
    notesBar.querySelectorAll(".note-tool").forEach((b) => {
      let on = null;
      if (b.dataset.block) on = !clear && block === b.dataset.block;
      else if (b.dataset.state) on = !clear && document.queryCommandState(b.dataset.cmd);
      if (on === null) return;
      b.classList.toggle("active", on);
      b.setAttribute("aria-pressed", String(on));
    });
  }

  function notesWordCount() {
    return (notesEd.innerText.match(/\S+/g) || []).length;
  }

  function refreshNotes() {
    const empty = !notesEd.textContent.trim() && !notesEd.querySelector("li, h2, h3");
    notesEd.classList.toggle("is-empty", empty);
    if (!notesMetaTimer) renderNotesMeta();
  }

  function renderNotesMeta(text) {
    const el = $("#notes-meta");
    el.classList.toggle("saved", !!text);
    if (text) { el.textContent = text; return; }
    const n = notesWordCount();
    el.textContent = n ? `${n} word${n === 1 ? "" : "s"}` : "";
  }

  function scheduleNotesSave() {
    clearTimeout(notesSaveTimer);
    notesSaveTimer = setTimeout(saveNotes, 400);
  }

  function saveNotes() {
    clearTimeout(notesSaveTimer);
    notesSaveTimer = null;
    const html = notesEd.classList.contains("is-empty") ? "" : notesEd.innerHTML;
    let msg = "Saved";
    try { localStorage.setItem(LS.notes, html); } catch (e) { msg = "Not saved"; }
    renderNotesMeta(msg);
    clearTimeout(notesMetaTimer);
    notesMetaTimer = setTimeout(() => { notesMetaTimer = null; renderNotesMeta(); }, 1400);
  }

  function flushNotes() { if (notesSaveTimer) saveNotes(); }

  /* ----- weather (open-meteo + geolocation, graceful) ------------------- */
  function weatherGlyph(code) {
    // grouped WMO codes → simple sun/cloud/rain/snow glyph + label
    let label = "Clear", kind = "sun";
    if (code === 0) { label = "Clear"; kind = "sun"; }
    else if (code <= 3) { label = "Partly cloudy"; kind = "cloud"; }
    else if (code === 45 || code === 48) { label = "Fog"; kind = "cloud"; }
    else if (code <= 67) { label = "Rain"; kind = "rain"; }
    else if (code <= 77) { label = "Snow"; kind = "snow"; }
    else if (code <= 82) { label = "Showers"; kind = "rain"; }
    else if (code <= 86) { label = "Snow"; kind = "snow"; }
    else { label = "Storm"; kind = "rain"; }
    return { label, svg: GLYPHS[kind] };
  }

  // The readout and the dither background share one fetch: either wanting it
  // is enough to ask, and the widget alone decides whether it shows.
  let weatherNow = null; // { temp, code, isDay, wind (km/h), windDir (° it blows from) }
  const weatherWanted = () => config.weather.enabled || config.bg.mode === "dither";

  function renderWeather(data) {
    const el = $("#weather");
    if (!weatherWanted()) { el.classList.add("hidden"); return; }
    if (data) {
      weatherNow = data;
      syncDither();
      el.classList.toggle("hidden", !config.weather.enabled);
      if (!config.weather.enabled) return;
      const g = weatherGlyph(data.code);
      el.innerHTML = "";
      el.append(h("span", { html: g.svg }), h("span", {}, `${data.temp}°`), h("span", { class: "weather-label" }, g.label));
      return;
    }
    if (!config.weather.enabled) el.classList.add("hidden");
    // try cache, else fetch (caches from before wind / day-night are refetched)
    let cached = null;
    try { cached = JSON.parse(localStorage.getItem(LS.weather)); } catch (e) {}
    if (cached && cached.unit === config.weather.unit && cached.data && cached.data.isDay != null && Date.now() - cached.t < 30 * 60 * 1000) { renderWeather(cached.data); return; }
    fetchWeather();
  }

  function fetchWeather() {
    if (!weatherWanted() || !navigator.geolocation) { $("#weather").classList.add("hidden"); return; }
    navigator.geolocation.getCurrentPosition(async (pos) => {
      try {
        const { latitude, longitude } = pos.coords;
        const unit = config.weather.unit === "f" ? "fahrenheit" : "celsius";
        const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude.toFixed(3)}&longitude=${longitude.toFixed(3)}&current=temperature_2m,weather_code,is_day,wind_speed_10m,wind_direction_10m&temperature_unit=${unit}`);
        const c = (await r.json()).current;
        const data = { temp: Math.round(c.temperature_2m), code: c.weather_code, isDay: c.is_day !== 0, wind: c.wind_speed_10m || 0, windDir: c.wind_direction_10m || 0 };
        localStorage.setItem(LS.weather, JSON.stringify({ t: Date.now(), unit: config.weather.unit, data }));
        renderWeather(data);
      } catch (e) { $("#weather").classList.add("hidden"); }
    }, () => { $("#weather").classList.add("hidden"); }, { maximumAge: 30 * 60 * 1000, timeout: 9000 });
  }

  /* ----- rain radar (BoM loop, pulled straight into the page) ------------ */
  // BoM publishes each scan as a transparent PNG named by its UTC scan time
  // (e.g. /radar/IDR634.T.202610030450.png) and drops it after a few hours.
  // Their frame list isn't readable cross-origin, and scan times aren't on a
  // fixed grid (some radars run offset, e.g. :04 :14 :24), so we probe every
  // minute, newest first, a few at a time, and stop once the loop is full.
  // Map layers are fixed PNGs stacked under and over the rain.
  //
  // Time safety: filenames are UTC, so daylight saving and timezone changes
  // don't matter (only the displayed times follow the PC's local clock). Each
  // refresh also probes a few minutes past max(PC clock, newest frame), so a
  // slow or rewound PC clock still finds new scans: after the first load the
  // loop follows BoM's own timestamps rather than the PC's.
  const RADAR = {
    id: "IDR634",                  // Darwin (Berrimah), 64 km
    name: "Darwin",
    host: "https://reg.bom.gov.au",
    frames: 7,                     // frames in the loop (matches BoM's page)
    lookbackMin: 90,               // how far back to search; older frames are dropped
    aheadMin: 10,                  // also probe this far past the PC clock / newest frame
    staleMin: 30,                  // flag the loop when the newest scan is older than this
    parallel: 4,                   // probes in flight at once (be gentle on BoM)
    refreshMs: 5 * 60 * 1000,      // check for new scans this often
    checkMs: 60 * 1000,            // how often to ask "is a refresh due?"
    frameMs: 333,                  // time per frame
    holdMs: 1800,                  // linger on the newest frame
  };
  let radarFrames = [];            // [{ t, img }] oldest → newest
  let radarIndex = 0, radarPlaying = true, radarTimer = null, radarBusy = false, radarPolled = 0;

  function utcStamp(t) {
    const d = new Date(t);
    return d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()) + pad(d.getUTCHours()) + pad(d.getUTCMinutes());
  }
  const radarFrameUrl = (t) => `${RADAR.host}/radar/${RADAR.id}.T.${utcStamp(t)}.png`;
  const radarLayerUrl = (name) => `${RADAR.host}/products/radar_transparencies/${RADAR.id}.${name}.png`;

  // every whole minute in (fromT, toT], newest first
  function radarSlots(fromT, toT) {
    const out = [];
    const start = new Date(toT); start.setUTCSeconds(0, 0);
    for (let t = start.getTime(); t > fromT; t -= 60000) out.push(t);
    return out;
  }

  // Walks the slots newest → oldest with a few probes in flight and stops
  // once `want` frames have loaded. The query string is per poll, so a "not
  // published yet" miss the browser (or BoM's CDN) cached earlier can't hide a
  // scan that has since appeared.
  async function probeRadar(slots, want) {
    const found = [];
    const bust = Math.floor(Date.now() / 60000);
    let next = 0;
    async function worker() {
      while (next < slots.length && found.length < want) {
        const t = slots[next++];
        const img = await loadImage(`${radarFrameUrl(t)}?${bust}`);
        if (img) found.push({ t, img });
      }
    }
    await Promise.all(Array.from({ length: RADAR.parallel }, worker));
    return found;
  }

  // resolves to the decoded image, or null if it's missing / blocked
  function loadImage(src) {
    return new Promise((resolve) => {
      const img = new Image();
      img.alt = "";
      img.referrerPolicy = "no-referrer";
      const timer = setTimeout(() => resolve(null), 15000);
      img.onload = () => { clearTimeout(timer); resolve(img.naturalWidth > 1 ? img : null); };
      img.onerror = () => { clearTimeout(timer); resolve(null); };
      img.src = src;
    });
  }

  // Probe only the minutes newer than the newest frame we already hold, so a
  // routine refresh costs about five small requests.
  async function refreshRadar() {
    if (radarBusy) return;
    radarBusy = true;
    const now = radarPolled = Date.now();
    const lookback = RADAR.lookbackMin * 60000;
    const newest = radarNewest();
    const slots = radarSlots(Math.max(newest, now - lookback), Math.max(now, newest) + RADAR.aheadMin * 60000);
    const found = await probeRadar(slots, RADAR.frames);
    radarBusy = false;

    if (found.length) {
      const wasOnNewest = radarIndex === radarFrames.length - 1;
      // after a long gap (sleep, outage) drop frames that no longer belong
      // with the new ones, measured against BoM's newest scan, not the PC clock
      const all = radarFrames.concat(found).sort((a, b) => a.t - b.t);
      const latest = all[all.length - 1].t;
      radarFrames = all.filter((f) => f.t >= latest - lookback).slice(-RADAR.frames);
      renderRadarFrames();
      showRadarFrame(!radarPlaying && !wasOnNewest ? Math.min(radarIndex, radarFrames.length - 1) : radarFrames.length - 1);
      radarTick();
    }
    renderRadarStatus();
  }

  const radarNewest = () => (radarFrames.length ? radarFrames[radarFrames.length - 1].t : 0);
  const radarStale = () => radarFrames.length > 0 && Date.now() - radarNewest() > RADAR.staleMin * 60000;

  function renderRadarStatus() {
    const status = $("#radar-status");
    const stale = radarStale();
    status.hidden = radarFrames.length > 0 && !stale;
    status.classList.toggle("corner", stale);
    if (!radarFrames.length) status.textContent = "Radar unavailable";
    else if (stale) status.textContent = `No new scans since ${radarTime(radarNewest())}`;
    $("#radar-time").classList.toggle("latest", radarIndex === radarFrames.length - 1 && !stale);
  }

  function renderRadarFrames() {
    const wrap = $("#radar-frames"), ticks = $("#radar-ticks");
    wrap.innerHTML = "";
    ticks.innerHTML = "";
    radarFrames.forEach((f, i) => {
      wrap.append(f.img);
      ticks.append(h("button", { type: "button", title: radarTime(f.t), "aria-label": `Show ${radarTime(f.t)}`,
        onclick: (e) => { e.stopPropagation(); setRadarPlaying(false); showRadarFrame(i); } }));
    });
  }

  function radarTime(t) { const d = new Date(t); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; }

  function showRadarFrame(i) {
    radarIndex = i;
    radarFrames.forEach((f, j) => f.img.classList.toggle("on", j === i));
    [...$("#radar-ticks").children].forEach((b, j) => b.classList.toggle("on", j === i));
    const time = $("#radar-time");
    time.textContent = radarFrames[i] ? radarTime(radarFrames[i].t) : "";
    time.classList.toggle("latest", i === radarFrames.length - 1 && !radarStale());
  }

  function radarTick() {
    clearTimeout(radarTimer);
    if (!radarPlaying || document.hidden || radarFrames.length < 2) return;
    const onNewest = radarIndex === radarFrames.length - 1;
    radarTimer = setTimeout(() => { showRadarFrame((radarIndex + 1) % radarFrames.length); radarTick(); }, onNewest ? RADAR.holdMs : RADAR.frameMs);
  }

  function setRadarPlaying(on) {
    radarPlaying = on;
    const btn = $("#radar-play");
    btn.innerHTML = on ? ICON_PAUSE : ICON_PLAY;
    btn.title = on ? "Pause" : "Play";
    btn.setAttribute("aria-label", btn.title);
    radarTick();
  }

  function initRadar() {
    $("#radar").setAttribute("aria-label", `Rain radar · ${RADAR.name}`);
    $("#radar-src").href = `${RADAR.host}/products/${RADAR.id}.loop.shtml`;
    $("#radar-bg").src = radarLayerUrl("background");
    $("#radar-places").src = radarLayerUrl("locations");
    $("#radar-play").addEventListener("click", (e) => { e.stopPropagation(); setRadarPlaying(!radarPlaying); });
    $("#radar-src").addEventListener("click", (e) => e.stopPropagation());
    $("#radar-view").addEventListener("click", () => setRadarPlaying(!radarPlaying));
    setRadarPlaying(true);

    refreshRadar();
    // A short "is it due?" tick rather than one long interval, so waking from
    // sleep, a clock change or a reconnect is caught within a minute. A clock
    // that moved backwards (negative elapsed time) also counts as due.
    const check = () => {
      if (document.hidden) return;
      const since = Date.now() - radarPolled;
      if (since >= RADAR.refreshMs || since < 0) refreshRadar();
      else renderRadarStatus();
    };
    setInterval(check, RADAR.checkMs);
    document.addEventListener("visibilitychange", () => { check(); radarTick(); });
    window.addEventListener("online", refreshRadar);
  }

  /* ----- inline SVG glyphs (simple geometric) --------------------------- */
  const PENCIL = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>`;
  const XICON  = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></svg>`;
  const PLUS   = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`;
  const GEAR   = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"/></svg>`;
  const MAG    = `<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.5" y2="16.5"/></svg>`;
  const CHEV   = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="opacity:.7"><polyline points="6 9 12 15 18 9"/></svg>`;
  const FOLDER = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"><path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h4.3l2 2.2h8.7A1.5 1.5 0 0 1 21 9.7v8.8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5Z"/></svg>`;
  const FOLDER_OPEN = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round" stroke-linecap="round"><path d="M3 18.5v-11A1.5 1.5 0 0 1 4.5 6h4.3l2 2.2h7.2a1.5 1.5 0 0 1 1.5 1.5V11"/><path d="M3 18.5 5.4 12a1.5 1.5 0 0 1 1.4-1h13.5a1 1 0 0 1 .95 1.3l-2 6.6a1.5 1.5 0 0 1-1.44 1.1H4.5A1.5 1.5 0 0 1 3 18.5Z"/></svg>`;
  const LINK = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`;
  // notes toolbar (Lucide-style, 16px)
  const tb = (paths) => `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
  const ICON_H1        = tb(`<path d="M4 12h8"/><path d="M4 18V6"/><path d="M12 18V6"/><path d="m17 12 3-2v8"/>`);
  const ICON_H2        = tb(`<path d="M4 12h8"/><path d="M4 18V6"/><path d="M12 18V6"/><path d="M21 18h-4c0-4 4-3 4-6 0-1.5-2-2.5-4-1"/>`);
  const ICON_BOLD      = tb(`<path d="M14 12a4 4 0 0 0 0-8H6v8"/><path d="M15 20a4 4 0 0 0 0-8H6v8Z"/>`);
  const ICON_ITALIC    = tb(`<line x1="19" x2="10" y1="4" y2="4"/><line x1="14" x2="5" y1="20" y2="20"/><line x1="15" x2="9" y1="4" y2="20"/>`);
  const ICON_UNDERLINE = tb(`<path d="M6 4v6a6 6 0 0 0 12 0V4"/><line x1="4" x2="20" y1="20" y2="20"/>`);
  const ICON_STRIKE    = tb(`<path d="M16 4H9a3 3 0 0 0-2.83 4"/><path d="M14 12a4 4 0 0 1 0 8H6"/><line x1="4" x2="20" y1="12" y2="12"/>`);
  const ICON_UL        = tb(`<line x1="9" x2="21" y1="6" y2="6"/><line x1="9" x2="21" y1="12" y2="12"/><line x1="9" x2="21" y1="18" y2="18"/><circle cx="4" cy="6" r="1" fill="currentColor"/><circle cx="4" cy="12" r="1" fill="currentColor"/><circle cx="4" cy="18" r="1" fill="currentColor"/>`);
  const ICON_OL        = tb(`<line x1="10" x2="21" y1="6" y2="6"/><line x1="10" x2="21" y1="12" y2="12"/><line x1="10" x2="21" y1="18" y2="18"/><path d="M4 6h1v4"/><path d="M4 10h2"/><path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1"/>`);
  const ICON_UNDO      = tb(`<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11"/>`);
  const ICON_REDO      = tb(`<path d="m15 14 5-5-5-5"/><path d="M20 9H9.5A5.5 5.5 0 0 0 4 14.5A5.5 5.5 0 0 0 9.5 20H13"/>`);
  const ICON_PLAY      = tb(`<path d="M7 4.5v15l12-7.5Z" fill="currentColor"/>`);
  const ICON_PAUSE     = tb(`<rect x="6.5" y="4.5" width="3.5" height="15" rx="1" fill="currentColor" stroke="none"/><rect x="14" y="4.5" width="3.5" height="15" rx="1" fill="currentColor" stroke="none"/>`);
  const GLYPHS = {
    sun:   `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#e8a13a" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4" fill="#e8a13a" stroke="none"/><line x1="12" y1="2.5" x2="12" y2="5"/><line x1="12" y1="19" x2="12" y2="21.5"/><line x1="2.5" y1="12" x2="5" y2="12"/><line x1="19" y1="12" x2="21.5" y2="12"/><line x1="5.6" y1="5.6" x2="7.3" y2="7.3"/><line x1="16.7" y1="16.7" x2="18.4" y2="18.4"/><line x1="5.6" y1="18.4" x2="7.3" y2="16.7"/><line x1="16.7" y1="7.3" x2="18.4" y2="5.6"/></svg>`,
    cloud: `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M17 18a4 4 0 0 0 0-8 5.5 5.5 0 0 0-10.6 1.5A3.5 3.5 0 0 0 7 18Z"/></svg>`,
    rain:  `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M17 14a4 4 0 0 0 0-8 5.5 5.5 0 0 0-10.6 1.5A3.5 3.5 0 0 0 7 14Z"/><line x1="9" y1="18" x2="8" y2="21"/><line x1="13" y1="18" x2="12" y2="21"/></svg>`,
    snow:  `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M17 14a4 4 0 0 0 0-8 5.5 5.5 0 0 0-10.6 1.5A3.5 3.5 0 0 0 7 14Z"/><circle cx="9" cy="19.5" r="0.6" fill="currentColor"/><circle cx="13" cy="19.5" r="0.6" fill="currentColor"/></svg>`,
  };

  /* ----- init ----------------------------------------------------------- */
  function init() {
    load();

    // static glyphs
    $("#mag").innerHTML = MAG;
    $("#engine-chev").innerHTML = CHEV;
    $("#settings-btn").innerHTML = GEAR;

    renderAll();
    initDither();
    initNotes();
    initRadar();

    // clock ticking
    setInterval(renderClock, 1000);
    // a tab left open keeps up with the weather (served from the 30-min cache
    // until it goes stale)
    setInterval(() => renderWeather(), 10 * 60 * 1000);

    // search submit
    $("#search-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const q = $("#q").value.trim();
      if (!q) return;
      // allow direct domains: if it looks like a url, go there
      if (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(q) && !q.includes(" ")) { window.location.href = normalizeUrl(q); return; }
      window.location.href = ENGINES[config.engine].url + encodeURIComponent(q);
    });

    // engine menu
    const eBtn = $("#engine-btn"), eMenu = $("#engine-menu");
    eBtn.addEventListener("click", (e) => { e.stopPropagation(); eMenu.classList.toggle("open"); });
    document.addEventListener("click", (e) => { if (!eMenu.contains(e.target) && !eBtn.contains(e.target)) eMenu.classList.remove("open"); });

    // buttons
    $("#settings-btn").addEventListener("click", openSettingsModal);

    // folders: drops on the row's empty space; the bubble closes on a click
    // anywhere off it (capture phase, and click rather than pointerdown so a
    // drag from the row into the open bubble doesn't close it) or on Esc
    attachDropZone($("#links"), null);
    document.addEventListener("click", (e) => {
      if (!bubbleEl || bubbleEl.contains(e.target) || e.target.closest(".folder-card, #overlay")) return;
      closeBubble(false);
    }, true);
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && bubbleEl && !$("#overlay")) closeBubble(true); });

    // the "+ Add" menu closes on a click off it or Esc
    document.addEventListener("click", (e) => { if (!e.target.closest(".add-wrap")) closeAddMenu(); });
    document.addEventListener("keydown", (e) => {
      const open = e.key === "Escape" && $(".add-wrap.open");
      if (open) { closeAddMenu(); open.querySelector(".add-card").focus(); }
    });
    window.addEventListener("resize", placeBubble);

    // Chrome new-tab: the browser grabs the address bar after the page loads,
    // overriding earlier focus() calls. Retrying at 300ms fires after Chrome's
    // omnibox sequence completes.
    const q = $("#q");
    // …but never pull focus away from the notes if they've already been clicked.
    // (phones skip it: there's no omnibox to beat, and it would raise the keyboard)
    const reFocus = () => { if (!TOUCH.matches && !document.querySelector("#overlay") && document.activeElement !== notesEd) q.focus(); };
    reFocus();
    setTimeout(reFocus, 300);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
