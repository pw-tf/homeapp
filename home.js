/* ==========================================================================
   Editorial New Tab — app logic (vanilla JS, no build step)
   Sections: state · helpers · theme/background · tiles · render · drag ·
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
    bg: { mode: "paper", color: "#f4f1ea", imageUrl: "" }, // paper | solid | image | adaptive
    weather: { enabled: true, unit: "c" },               // c | f
    showRecent: true,
  };

  /* ----- state ---------------------------------------------------------- */
  let config = structuredClone(DEFAULT_CONFIG);
  let links = [];
  let recent = [];

  const LS = { config: "nt_config", links: "nt_links", recent: "nt_recent", weather: "nt_weather", notes: "nt_notes", palette: "nt_palette" };

  function load() {
    try { const c = JSON.parse(localStorage.getItem(LS.config)); if (c) config = Object.assign(structuredClone(DEFAULT_CONFIG), c, { bg: Object.assign({}, DEFAULT_CONFIG.bg, c.bg), weather: Object.assign({}, DEFAULT_CONFIG.weather, c.weather) }); } catch (e) {}
    try { const l = JSON.parse(localStorage.getItem(LS.links)); links = Array.isArray(l) ? l : structuredClone(DEFAULT_LINKS); } catch (e) { links = structuredClone(DEFAULT_LINKS); }
    if (!links.length) links = structuredClone(DEFAULT_LINKS);
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

  function resolveTheme() {
    if (config.appearance === "light") return "light";
    if (config.appearance === "dark") return "dark";
    const m = config.bg.mode;
    if (m === "image") return "dark";
    if (m === "adaptive") return adaptiveSlot().theme;
    if (m === "solid") return luminance(config.bg.color) > 0.55 ? "light" : "dark";
    return "light"; // paper
  }

  function applyBackground() {
    const b = document.body;
    const m = config.bg.mode;
    b.style.backgroundImage = "none";
    b.style.backgroundColor = "";
    document.documentElement.style.setProperty("--bg", "#f4f1ea");
    if (m === "paper") {
      b.style.backgroundColor = "#f4f1ea";
    } else if (m === "solid") {
      b.style.backgroundColor = config.bg.color || "#f4f1ea";
    } else if (m === "image" && config.bg.imageUrl) {
      b.style.backgroundColor = "#15171c";
      b.style.backgroundImage = `url("${config.bg.imageUrl}")`;
    } else if (m === "adaptive") {
      const a = adaptiveSlot();
      b.style.backgroundImage = a.bg;
    } else {
      b.style.backgroundColor = "#f4f1ea";
    }
    document.documentElement.dataset.theme = resolveTheme();
    updateRadarPalette();
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

  function updateRadarPalette() {
    const m = config.bg.mode;
    if (m === "image" && config.bg.imageUrl) return paletteFromImage(config.bg.imageUrl);
    if (m === "solid") return applyRadarPalette(paletteFromColor(config.bg.color || "#f4f1ea"));
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
      if (!palette || config.bg.mode !== "image" || config.bg.imageUrl !== url) return;
      applyRadarPalette(palette);
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

    if (icon.kind === "emoji" && icon.value) { t.append(h("span", { class: "emoji" }, icon.value)); return t; }
    if (icon.kind === "letter") { setLetter((icon.value || letterChar).slice(0, 1).toUpperCase()); return t; }
    if (icon.kind === "image" && icon.value) { setLetter(); swapImg(icon.value); return t; }
    // auto → favicon
    setLetter();
    const fav = faviconUrl(link.url);
    if (fav) swapImg(fav);
    return t;
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

    $("#date").textContent = now.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" }).replace(",", " ·");

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

  function renderLinks() {
    const wrap = $("#links");
    wrap.innerHTML = "";
    links.forEach((link, i) => {
      const card = h("a", {
        class: "link-card", href: link.url || "#", "data-index": i, draggable: "true",
        onclick: (e) => { if (e.target.closest(".card-actions")) { e.preventDefault(); return; } recordRecent(link.id); },
      });
      card.append(makeTile(link), h("span", { class: "name" }, link.name || "Untitled"));
      const actions = h("div", { class: "card-actions" },
        h("button", { type: "button", title: "Edit", "aria-label": "Edit", onclick: (e) => { e.preventDefault(); e.stopPropagation(); openLinkModal(link); }, html: PENCIL }),
        h("button", { type: "button", title: "Remove", "aria-label": "Remove", onclick: (e) => { e.preventDefault(); e.stopPropagation(); deleteLink(link.id); }, html: XICON }));
      card.append(actions);
      attachDrag(card, i);
      wrap.append(card);
    });
    wrap.append(h("button", { class: "add-card", type: "button", onclick: () => openLinkModal(null) }, h("span", { html: PLUS }), "Add link"));
  }

  function renderRecent() {
    const el = $("#recent");
    const items = recent.map((id) => links.find((l) => l.id === id)).filter(Boolean);
    if (!config.showRecent || !items.length) { el.classList.add("hidden"); el.innerHTML = ""; return; }
    el.classList.remove("hidden");
    el.innerHTML = "";
    el.append(h("span", { class: "label" }, "Recent"));
    items.slice(0, 5).forEach((l) => el.append(h("a", { href: l.url, onclick: () => recordRecent(l.id) }, l.name)));
  }

  function renderAll() { applyBackground(); renderClock(); renderEngine(); renderLinks(); renderRecent(); renderWeather(); }

  /* ----- drag to reorder ------------------------------------------------ */
  let dragFrom = null;
  function attachDrag(card, index) {
    card.addEventListener("dragstart", (e) => { dragFrom = index; card.classList.add("dragging"); e.dataTransfer.effectAllowed = "move"; try { e.dataTransfer.setData("text/plain", String(index)); } catch (x) {} });
    card.addEventListener("dragend", () => { dragFrom = null; card.classList.remove("dragging"); document.querySelectorAll(".link-card").forEach((c) => c.classList.remove("drag-over")); });
    card.addEventListener("dragover", (e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; card.classList.add("drag-over"); });
    card.addEventListener("dragleave", () => card.classList.remove("drag-over"));
    card.addEventListener("drop", (e) => {
      e.preventDefault();
      card.classList.remove("drag-over");
      const to = index;
      if (dragFrom == null || dragFrom === to) return;
      const [moved] = links.splice(dragFrom, 1);
      links.splice(to, 0, moved);
      saveLinks(); renderLinks(); renderRecent();
    });
  }

  /* ----- modals --------------------------------------------------------- */
  function openModal(node) {
    closeModal();
    const overlay = h("div", { class: "overlay", onclick: (e) => { if (e.target === overlay) closeModal(); } }, node);
    overlay.id = "overlay";
    document.body.append(overlay);
    document.addEventListener("keydown", escClose);
    const f = overlay.querySelector("input, button, [tabindex]"); if (f) setTimeout(() => f.focus(), 30);
  }
  function closeModal() { const o = $("#overlay"); if (o) o.remove(); document.removeEventListener("keydown", escClose); }
  function escClose(e) { if (e.key === "Escape") closeModal(); }

  function seg(options, current, onPick) {
    const wrap = h("div", { class: "segmented" });
    options.forEach((o) => wrap.append(h("button", { type: "button", class: o.value === current ? "active" : "", onclick: () => onPick(o.value) }, o.label)));
    return wrap;
  }

  // ----- Add / Edit link -----
  function openLinkModal(existing) {
    const editing = !!existing;
    const draft = editing
      ? { id: existing.id, name: existing.name, url: existing.url, icon: Object.assign({ kind: "auto", value: "" }, existing.icon) }
      : { id: uid(), name: "", url: "", icon: { kind: "auto", value: "" } };

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
      h("p", { class: "sub" }, editing ? "Update the name, address, or icon." : "Add a shortcut to your home page."),
      h("div", { class: "icon-preview" }, previewTileSlot, pvMeta),
      h("div", { class: "field" }, h("label", {}, "Name"), nameInput),
      h("div", { class: "field" }, h("label", {}, "URL"), urlInput),
      h("div", { class: "field" },
        h("label", {}, "Icon"),
        seg([{ value: "auto", label: "Auto" }, { value: "emoji", label: "Emoji" }, { value: "image", label: "Image" }, { value: "letter", label: "Letter" }], draft.icon.kind, (v) => { draft.icon.kind = v; rerenderIconSeg(v); renderIconControls(); redrawPreview(); }),
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
      if (editing) { const i = links.findIndex((l) => l.id === draft.id); if (i >= 0) links[i] = draft; }
      else links.push(draft);
      saveLinks(); renderLinks(); renderRecent(); closeModal();
    }

    renderIconControls();
    openModal(sheet);
    redrawPreview();
  }

  function deleteLink(id) {
    links = links.filter((l) => l.id !== id);
    recent = recent.filter((x) => x !== id);
    saveLinks(); saveRecent(); renderLinks(); renderRecent();
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
      seg(Object.keys(ENGINES).map((k) => ({ value: k, label: ENGINES[k].name })), config.engine, (v) => { config.engine = v; saveConfig(); renderEngine(); reSeg(0, v); })));

    sheet.append(h("div", { class: "section-divider" }));

    // background mode
    const bgField = h("div", { class: "field" }, h("label", {}, "Background"),
      seg([{ value: "paper", label: "Paper" }, { value: "solid", label: "Solid" }, { value: "image", label: "Image" }, { value: "adaptive", label: "Adaptive" }], config.bg.mode, (v) => { config.bg.mode = v; saveConfig(); applyBackground(); reSeg(1, v); renderBgControls(); }));
    const bgControls = h("div", {});
    sheet.append(bgField, bgControls);

    function renderBgControls() {
      bgControls.innerHTML = "";
      const m = config.bg.mode;
      if (m === "solid") {
        const sw = h("div", { class: "swatches", style: { marginTop: "10px" } });
        SWATCHES.forEach((c) => sw.append(h("div", { class: "swatch" + (c.toLowerCase() === (config.bg.color || "").toLowerCase() ? " active" : ""), style: { background: c }, title: c, onclick: () => { config.bg.color = c; saveConfig(); applyBackground(); renderBgControls(); } })));
        bgControls.append(sw);
      } else if (m === "image") {
        bgControls.append(
          h("div", { class: "field", style: { marginTop: "10px", marginBottom: "0" } },
            h("input", { type: "url", value: config.bg.imageUrl, placeholder: "https://…/photo.jpg", oninput: (e) => { config.bg.imageUrl = e.target.value; }, onchange: (e) => { config.bg.imageUrl = e.target.value.trim(); saveConfig(); applyBackground(); } }),
            h("p", { class: "hint" }, "Paste any image URL. Tip: Unsplash 'Download' links work great. Text switches to light automatically — override below.")));
      } else if (m === "adaptive") {
        bgControls.append(h("p", { class: "hint", style: { marginTop: "10px" } }, "Tones shift through the day — soft light by morning, warm at dusk, deep at night."));
      } else {
        bgControls.append(h("p", { class: "hint", style: { marginTop: "10px" } }, "Warm off-white paper — the Editorial default."));
      }
    }
    renderBgControls();

    // appearance
    sheet.append(h("div", { class: "field", style: { marginTop: "16px" } }, h("label", {}, "Text & contrast"),
      seg([{ value: "auto", label: "Auto" }, { value: "light", label: "Dark text" }, { value: "dark", label: "Light text" }], config.appearance, (v) => { config.appearance = v; saveConfig(); applyBackground(); reSeg(2, v); })));

    sheet.append(h("div", { class: "section-divider" }));

    // weather
    const wToggle = h("button", { type: "button", class: "toggle" + (config.weather.enabled ? " on" : ""), role: "switch", "aria-checked": String(config.weather.enabled), onclick: () => { config.weather.enabled = !config.weather.enabled; wToggle.classList.toggle("on", config.weather.enabled); saveConfig(); renderWeather(); } });
    sheet.append(h("div", { class: "field" }, h("div", { class: "row" }, h("label", { style: { margin: "0" } }, "Weather widget"), wToggle),
      h("div", { class: "row", style: { marginTop: "12px" } },
        h("span", { class: "hint", style: { margin: "0" } }, "Temperature unit"),
        seg([{ value: "c", label: "°C" }, { value: "f", label: "°F" }], config.weather.unit, (v) => { config.weather.unit = v; saveConfig(); localStorage.removeItem(LS.weather); reSeg(4, v); renderWeather(); }))));

    // recent toggle
    const rToggle = h("button", { type: "button", class: "toggle" + (config.showRecent ? " on" : ""), role: "switch", "aria-checked": String(config.showRecent), onclick: () => { config.showRecent = !config.showRecent; rToggle.classList.toggle("on", config.showRecent); saveConfig(); renderRecent(); } });
    sheet.append(h("div", { class: "field" }, h("div", { class: "row" }, h("label", { style: { margin: "0" } }, "Show recent links"), rToggle)));

    sheet.append(h("div", { class: "actions" },
      h("button", { class: "btn btn-danger spacer", type: "button", onclick: resetAll }, "Reset everything"),
      h("button", { class: "btn btn-primary", type: "button", onclick: closeModal }, "Done")));

    // helper: refresh a segmented control's active buttons after external change
    function reSeg(idx, v) {
      const all = sheet.querySelectorAll(".segmented");
      const segEl = all[idx]; if (!segEl) return;
      [...segEl.children].forEach((b) => b.classList.toggle("active", b.textContent.replace("°", "").toLowerCase() === v.replace("°", "").toLowerCase()));
    }

    openModal(sheet);
  }

  function resetAll() {
    if (!confirm("Reset all links, background, and settings to defaults?")) return;
    config = structuredClone(DEFAULT_CONFIG);
    links = structuredClone(DEFAULT_LINKS);
    recent = [];
    saveConfig(); saveLinks(); saveRecent();
    localStorage.removeItem(LS.weather);
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

  function renderWeather(data) {
    const el = $("#weather");
    if (!config.weather.enabled) { el.classList.add("hidden"); return; }
    if (data) {
      const g = weatherGlyph(data.code);
      el.classList.remove("hidden");
      el.innerHTML = "";
      el.append(h("span", { html: g.svg }), h("span", {}, `${data.temp}° ${g.label}`));
      return;
    }
    // try cache, else fetch
    let cached = null;
    try { cached = JSON.parse(localStorage.getItem(LS.weather)); } catch (e) {}
    if (cached && cached.unit === config.weather.unit && Date.now() - cached.t < 30 * 60 * 1000) { renderWeather(cached.data); return; }
    fetchWeather();
  }

  function fetchWeather() {
    if (!config.weather.enabled || !navigator.geolocation) { $("#weather").classList.add("hidden"); return; }
    navigator.geolocation.getCurrentPosition(async (pos) => {
      try {
        const { latitude, longitude } = pos.coords;
        const unit = config.weather.unit === "f" ? "fahrenheit" : "celsius";
        const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude.toFixed(3)}&longitude=${longitude.toFixed(3)}&current=temperature_2m,weather_code&temperature_unit=${unit}`);
        const j = await r.json();
        const data = { temp: Math.round(j.current.temperature_2m), code: j.current.weather_code };
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
    initNotes();
    initRadar();

    // clock ticking
    setInterval(renderClock, 1000);

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

    // Chrome new-tab: the browser grabs the address bar after the page loads,
    // overriding earlier focus() calls. Retrying at 300ms fires after Chrome's
    // omnibox sequence completes.
    const q = $("#q");
    // …but never pull focus away from the notes if they've already been clicked.
    const reFocus = () => { if (!document.querySelector("#overlay") && document.activeElement !== notesEd) q.focus(); };
    reFocus();
    setTimeout(reFocus, 300);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
