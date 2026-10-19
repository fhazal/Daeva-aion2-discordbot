"use strict";

// Daeva Timers front end. Icons: Lucide (lucide.dev, ISC licence); class
// glyphs are our own artwork, shared with Daeva Meter.
(() => {
  const ICONS = {
  "timer": "<line x1=\"10\" x2=\"14\" y1=\"2\" y2=\"2\" /><line x1=\"12\" x2=\"15\" y1=\"14\" y2=\"11\" /><circle cx=\"12\" cy=\"14\" r=\"8\" />",
  "swords": "<path d=\"m13 19 6-6\" /><path d=\"M14.5 17.5 3.586 6.586A2 2 0 013 5.172V3h2.172a2 2 0 011.414.586L17.5 14.5\" /><path d=\"m14.828 6.172 2.586-2.586A2 2 0 0118.828 3H21v2.172a2 2 0 01-.586 1.414l-2.586 2.586\" /><path d=\"m16 16 4 4\" /><path d=\"m19 21 2-2\" /><path d=\"m5 14 4 4\" /><path d=\"m5 21-2-2\" /><path d=\"M7.5 16.5 4 20\" />",
  "castle": "<path d=\"M10 5V3\" /><path d=\"M14 5V3\" /><path d=\"M15 21v-3a3 3 0 0 0-6 0v3\" /><path d=\"M18 3v8\" /><path d=\"M18 5H6\" /><path d=\"M22 11H2\" /><path d=\"M22 9v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9\" /><path d=\"M6 3v8\" />",
  "server": "<rect width=\"20\" height=\"8\" x=\"2\" y=\"2\" rx=\"2\" ry=\"2\" /><rect width=\"20\" height=\"8\" x=\"2\" y=\"14\" rx=\"2\" ry=\"2\" /><line x1=\"6\" x2=\"6.01\" y1=\"6\" y2=\"6\" /><line x1=\"6\" x2=\"6.01\" y1=\"18\" y2=\"18\" />",
  "users": "<path d=\"M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2\" /><path d=\"M16 3.128a4 4 0 0 1 0 7.744\" /><path d=\"M22 21v-2a4 4 0 0 0-3-3.87\" /><circle cx=\"9\" cy=\"7\" r=\"4\" />",
  "bell-ring": "<path d=\"M10.268 21a2 2 0 0 0 3.464 0\" /><path d=\"M22 8c0-2.3-.8-4.3-2-6\" /><path d=\"M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326\" /><path d=\"M4 2C2.8 3.7 2 5.7 2 8\" />",
  "globe": "<circle cx=\"12\" cy=\"12\" r=\"10\" /><path d=\"M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20\" /><path d=\"M2 12h20\" />",
  "calendar-clock": "<path d=\"M16 14v2.2l1.6 1\" /><path d=\"M16 2v3\" /><path d=\"M21 7.338V5a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2h2.338\" /><path d=\"M3 9h5.859\" /><path d=\"M8 2v3\" /><circle cx=\"16\" cy=\"16\" r=\"6\" />",
  "skull": "<path d=\"m12.5 17-.5-1-.5 1h1z\" /><path d=\"M15 22a1 1 0 0 0 1-1v-1a2 2 0 0 0 1.56-3.25 8 8 0 1 0-11.12 0A2 2 0 0 0 8 20v1a1 1 0 0 0 1 1z\" /><circle cx=\"15\" cy=\"12\" r=\"1\" /><circle cx=\"9\" cy=\"12\" r=\"1\" />",
  "shield": "<path d=\"M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z\" />",
  "download": "<path d=\"M12 15V3\" /><path d=\"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4\" /><path d=\"m7 10 5 5 5-5\" />",
  "search": "<path d=\"m21 21-4.34-4.34\" /><circle cx=\"11\" cy=\"11\" r=\"8\" />",
  "chevron-right": "<path d=\"m9 18 6-6-6-6\" />",
  "clock": "<circle cx=\"12\" cy=\"12\" r=\"10\" /><path d=\"M12 6v6l4 2\" />",
  "sparkles": "<path d=\"M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z\" /><path d=\"M20 2v4\" /><path d=\"M22 4h-4\" /><circle cx=\"4\" cy=\"20\" r=\"2\" />",
  "activity": "<path d=\"M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2\" />",
  "refresh-cw": "<path d=\"M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8\" /><path d=\"M21 3v5h-5\" /><path d=\"M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16\" /><path d=\"M8 16H3v5\" />",
  "message-circle": "<path d=\"M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719\" />",
  "gift": "<path d=\"M12 7v14\" /><path d=\"M20 11v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8\" /><path d=\"M7.5 7a1 1 0 0 1 0-5A4.8 8 0 0 1 12 7a4.8 8 0 0 1 4.5-5 1 1 0 0 1 0 5\" /><rect x=\"3\" y=\"7\" width=\"18\" height=\"4\" rx=\"1\" />",
  "trophy": "<path d=\"M10 14.66V17a1 1 0 0 1-1 1 2 2 0 0 0-2 2v2\" /><path d=\"M14 14.66V17a1 1 0 0 0 1 1 2 2 0 0 1 2 2v2\" /><path d=\"M17.916 10H19.5A2.5 2.5 0 0 0 22 7.5V5a1 1 0 0 0-1-1h-3\" /><path d=\"M4 22h16\" /><path d=\"M6 9a6 6 0 0 0 12 0V3a1 1 0 0 0-1-1H7a1 1 0 0 0-1 1z\" /><path d=\"M6.084 10H4.5A2.5 2.5 0 0 1 2 7.5V5a1 1 0 0 1 1-1h3\" />",
  "map-pin": "<path d=\"M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0\" /><circle cx=\"12\" cy=\"10\" r=\"3\" />",
  "arrow-right": "<path d=\"M5 12h14\" /><path d=\"m12 5 7 7-7 7\" />",
  "eye": "<path d=\"M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0\" /><circle cx=\"12\" cy=\"12\" r=\"3\" />",
  "heart": "<path d=\"M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5\" />",
  "external-link": "<path d=\"M15 3h6v6\" /><path d=\"M10 14 21 3\" /><path d=\"M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6\" />",
  "circle-alert": "<circle cx=\"12\" cy=\"12\" r=\"10\" /><line x1=\"12\" x2=\"12\" y1=\"8\" y2=\"12\" /><line x1=\"12\" x2=\"12.01\" y1=\"16\" y2=\"16\" />",
  "coffee": "<path d=\"M10 2v2\" /><path d=\"M14 2v2\" /><path d=\"M16 8a1 1 0 0 1 1 1v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1h14a4 4 0 1 1 0 8h-1\" /><path d=\"M6 2v2\" />",
  "user-plus": "<path d=\"M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2\" /><circle cx=\"9\" cy=\"7\" r=\"4\" /><line x1=\"19\" x2=\"19\" y1=\"8\" y2=\"14\" /><line x1=\"22\" x2=\"16\" y1=\"11\" y2=\"11\" />",
  "signal": "<path d=\"M2 20h.01\" /><path d=\"M7 20v-4\" /><path d=\"M12 20v-8\" /><path d=\"M17 20V8\" /><path d=\"M22 4v16\" />",
  "lock": "<rect width=\"18\" height=\"11\" x=\"3\" y=\"11\" rx=\"2\" ry=\"2\" /><path d=\"M7 11V7a5 5 0 0 1 10 0v4\" />",
  "badge-plus": "<path d=\"M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z\" /><line x1=\"12\" x2=\"12\" y1=\"8\" y2=\"16\" /><line x1=\"8\" x2=\"16\" y1=\"12\" y2=\"12\" />",
  "wrench": "<path d=\"M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.106-3.105c.32-.322.863-.22.983.218a6 6 0 0 1-8.259 7.057l-7.91 7.91a1 1 0 0 1-2.999-3l7.91-7.91a6 6 0 0 1 7.057-8.259c.438.12.54.662.219.984z\" />",
  "power-off": "<path d=\"M18.36 6.64A9 9 0 0 1 20.77 15\" /><path d=\"M6.16 6.16a9 9 0 1 0 12.68 12.68\" /><path d=\"M12 2v4\" /><path d=\"m2 2 20 20\" />",
  "circle-check": "<circle cx=\"12\" cy=\"12\" r=\"10\" /><path d=\"m16 9-5.5 5.5L8 12\" />",
  };

  // Original line-art class glyphs (16x16), shared with Daeva Meter.
  const CLASS_GLYPHS = {
    gladiator: '<path d="M3 13l7-7M10 6l2.5-2.5L13 3l-.5.5L10 6"/><path d="M4.5 9.5l2 2M2.5 13.5l1-1"/>',
    templar: '<path d="M8 2l5 2v4c0 3-2.2 5-5 6-2.8-1-5-3-5-6V4z"/><path d="M8 5v6M6 7.5h4"/>',
    assassin: '<path d="M3 13l6.5-6.5M9.5 6.5L13 3l-.6 3.4z"/><path d="M5 9.5l1.5 1.5M10 13l1.5-1.5L13 13"/>',
    ranger: '<path d="M4 2.5c4.5 2 4.5 9 0 11"/><path d="M4 2.5v11"/><path d="M2.5 8h10M10.5 6l2 2-2 2"/>',
    sorcerer: '<path d="M8 2.5c2 2.2 3.5 3.8 3.5 6a3.5 3.5 0 0 1-7 0c0-1.6.9-2.7 1.8-3.5.1 1.2.7 2 1.4 2.2C7.4 5.5 7.6 4 8 2.5z"/>',
    elementalist: '<path d="M8 8a2 2 0 1 1 2-2c0 2.8-2.2 5-5 5"/><path d="M8 8a2 2 0 1 0-2 2c2.8 0 5-2.2 5-5"/><circle cx="8" cy="8" r="6"/>',
    spiritmaster: '<path d="M8 8a2 2 0 1 1 2-2c0 2.8-2.2 5-5 5"/><circle cx="8" cy="8" r="6"/>',
    cleric: '<path d="M8 2v12M4.5 5.5h7"/><circle cx="8" cy="5.5" r="2.2"/>',
    chanter: '<circle cx="8" cy="8" r="5.5"/><circle cx="8" cy="8" r="2.5"/><path d="M8 2.5v2.5M8 11v2.5M2.5 8H5M11 8h2.5"/>',
    unknown: '<circle cx="8" cy="6" r="3"/><path d="M3 14c.6-2.8 2.6-4.2 5-4.2s4.4 1.4 5 4.2"/>',
  };

  const EVENT_ICON = {
    spacetime_rift: "sparkles", shugo_festival: "gift", dimensional_invasion: "swords", watcher_kaira: "eye",
    artifact_siege: "castle", executor_bosses: "skull", guardian_nahma: "shield", arena_of_tactics: "trophy",
    daily_reset: "refresh-cw", weekly_reset: "calendar-clock",
  };

  const svgNS = "http://www.w3.org/2000/svg";
  function lucide(name) {
    const svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("class", "lu");
    svg.setAttribute("aria-hidden", "true");
    svg.innerHTML = ICONS[name] || ICONS["circle-alert"];
    return svg;
  }
  function drawIcons(root) {
    for (const node of (root || document).querySelectorAll("[data-icon]")) {
      if (!node.firstChild) node.append(lucide(node.dataset.icon));
    }
  }
  function icon(name, className) {
    const span = el("span", className || "ic");
    span.dataset.icon = name;
    span.append(lucide(name));
    return span;
  }
  function classBadge(className) {
    const key = String(className || "").toLowerCase().replace(/[^a-z]/g, "");
    const glyph = CLASS_GLYPHS[key] || CLASS_GLYPHS.unknown;
    const span = el("span", "cb");
    span.dataset.class = CLASS_GLYPHS[key] ? key : "unknown";
    const svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("viewBox", "0 0 16 16");
    svg.setAttribute("aria-hidden", "true");
    svg.innerHTML = glyph;
    span.append(svg);
    return span;
  }

  const REFRESH_MS = 30_000;
  const SOON_MS = 15 * 60_000;
  const STORAGE_KEY = "daeva.region";
  const HOME_SERVER = "beritra";
  const DAY_HOURS = 21;

  const $ = (id) => document.getElementById(id);
  const els = {
    region: $("region"),
    clock: $("clock"),
    zone: $("zone"),
    banner: $("banner"),
    heroRegion: $("hero-region"),
    stats: $("stats"),
    track: $("track"),
    hours: $("hours"),
    events: $("events"),
    nextList: $("next-list"),
    statusList: $("status-list"),
    statusEmpty: $("status-empty"),
    statusUpdated: $("status-updated"),
    statusSub: $("status-sub"),
  };

  let data = null;
  let clockOffset = 0; // server time minus device time, in ms
  let regionId = readRegion();
  let refreshTimer = null;

  const timeFmt = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" });
  const hourFmt = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" });
  const dayTimeFmt = new Intl.DateTimeFormat(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit" });
  const zoneName = (() => {
    try {
      const part = new Intl.DateTimeFormat(undefined, { timeZoneName: "short" })
        .formatToParts(new Date())
        .find((p) => p.type === "timeZoneName");
      return part ? part.value : "";
    } catch {
      return "";
    }
  })();

  function readRegion() {
    try {
      return localStorage.getItem(STORAGE_KEY) || "asia";
    } catch {
      return "asia";
    }
  }

  function saveRegion(id) {
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {
      /* private browsing: the choice just isn't remembered */
    }
  }

  const now = () => Date.now() + clockOffset;
  const pad = (n) => String(n).padStart(2, "0");

  function countdown(ms) {
    const total = Math.max(0, Math.floor(ms / 1000));
    const d = Math.floor(total / 86400);
    const h = Math.floor((total % 86400) / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    if (d > 0) return `${d}d ${h}h`;
    if (h > 0) return `${h}:${pad(m)}:${pad(s)}`;
    return `${m}:${pad(s)}`;
  }

  function ago(ms) {
    const mins = Math.round(ms / 60_000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins} min ago`;
    const hours = Math.round(mins / 60);
    if (hours < 48) return `${hours} h ago`;
    return `${Math.round(hours / 24)} days ago`;
  }

  function when(date) {
    const today = new Date(now());
    const same = date.getFullYear() === today.getFullYear()
      && date.getMonth() === today.getMonth()
      && date.getDate() === today.getDate();
    return same ? timeFmt.format(date) : dayTimeFmt.format(date);
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  /* Data -------------------------------------------------------------------- */

  async function load() {
    clearTimeout(refreshTimer);
    try {
      const res = await fetch(`/api/overview?region=${encodeURIComponent(regionId)}`, { cache: "no-store" });
      if (res.status === 404 && regionId !== "asia") {
        regionId = "asia";
        saveRegion(regionId);
        return load();
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      data = await res.json();
      clockOffset = Date.parse(data.now) - Date.now();
      els.banner.hidden = true;
      renderRegions();
      render();
    } catch {
      els.banner.textContent = data
        ? "Can't reach the timer service. These are the last times received; the page will retry by itself."
        : "Can't reach the timer service. Retrying in 30 seconds.";
      els.banner.hidden = false;
    }
    refreshTimer = setTimeout(load, REFRESH_MS);
  }

  function split(t) {
    const active = [];
    const upcoming = [];
    for (const event of data.events) {
      const live = event.occurrences.find((o) => Date.parse(o.startsAt) <= t && Date.parse(o.endsAt) > t);
      if (live) active.push({ event, occ: live });
      const next = event.occurrences.find((o) => Date.parse(o.startsAt) > t);
      if (next) upcoming.push({ event, occ: next });
    }
    active.sort((a, b) => Date.parse(a.occ.endsAt) - Date.parse(b.occ.endsAt));
    upcoming.sort((a, b) => Date.parse(a.occ.startsAt) - Date.parse(b.occ.startsAt));
    return { active, upcoming };
  }

  /* Rendering --------------------------------------------------------------- */

  function renderRegions() {
    if (els.region.options.length !== data.regions.length) {
      els.region.replaceChildren(...data.regions.map((r) => {
        const opt = el("option", null, r.label);
        opt.value = r.id;
        return opt;
      }));
    }
    els.region.value = data.region.id;
    els.heroRegion.textContent = data.region.id === "asia" ? "AION 2 · Asia · Beritra" : `AION 2 · ${data.region.label}`;
  }

  function render() {
    if (!data) return;
    const t = now();
    const { active, upcoming } = split(t);
    renderStats(active, upcoming);
    renderTimeline(t);
    renderEvents(active, upcoming);
    renderSchedule(upcoming);
    renderStatus();
    tick();
  }

  function homeServer() {
    return data.status && data.status.servers.find((s) => s.name.toLowerCase() === HOME_SERVER);
  }

  function stat(ev, iconName, label, sub) {
    const box = el("div", "stat");
    box.dataset.ev = ev;
    const value = el("div", "sv", "--");
    const subEl = el("div", "sm", sub);
    const text = el("div");
    text.append(el("div", "sl", label), value, subEl);
    box.append(icon(iconName, "si"), text);
    return { box, value, sub: subEl };
  }

  function renderStats(active, upcoming) {
    const tiles = [];
    if (data.region.id === "asia") {
      const g = stat("gartua", "skull", "Immortal Gartua", "");
      g.value.dataset.gartua = "count";
      g.sub.dataset.gartua = "sub";
      tiles.push(g.box);
    }
    const rift = upcoming.find((u) => u.event.id === "spacetime_rift");
    if (rift) {
      const s = stat("spacetime_rift", "sparkles", "Next Rift", `At ${when(new Date(rift.occ.startsAt))}`);
      s.value.dataset.to = rift.occ.startsAt;
      tiles.push(s.box);
    }
    const live = active[0];
    if (live) {
      const s = stat(live.event.id, EVENT_ICON[live.event.id] || "activity", `${live.event.shortName} · live`, `Ends ${when(new Date(live.occ.endsAt))}`);
      s.value.dataset.to = live.occ.endsAt;
      tiles.push(s.box);
    } else {
      const shugo = upcoming.find((u) => u.event.id === "shugo_festival");
      if (shugo) {
        const s = stat("shugo_festival", "gift", "Next Shugo Festival", `At ${when(new Date(shugo.occ.startsAt))}`);
        s.value.dataset.to = shugo.occ.startsAt;
        tiles.push(s.box);
      }
    }
    const home = homeServer();
    if (home) {
      const pop = home.populationPercent != null ? `${Math.round(home.populationPercent)}% population` : "Population unknown";
      const s = stat("server", "server", home.name, pop);
      s.value.textContent = home.status;
      tiles.push(s.box);
    } else {
      const daily = upcoming.find((u) => u.event.id === "daily_reset");
      if (daily) {
        const s = stat("daily_reset", "refresh-cw", "Daily reset", `At ${when(new Date(daily.occ.startsAt))}`);
        s.value.dataset.to = daily.occ.startsAt;
        tiles.push(s.box);
      }
    }
    els.stats.replaceChildren(...tiles);
  }

  function renderTimeline(t) {
    const start = t;
    const end = t + DAY_HOURS * 3_600_000;
    const span = end - start;
    const items = [];
    for (const event of data.events) {
      for (const o of event.occurrences) {
        const a = Date.parse(o.startsAt);
        const b = Date.parse(o.endsAt);
        if (b <= start || a >= end) continue;
        items.push({ event, a: Math.max(a, start), b: Math.min(b, end) });
      }
    }
    if (data.region.id === "asia" && data.gartua) {
      const g = Date.parse(data.gartua.spawnAt);
      if (g > start && g < end) items.push({ event: { id: "gartua", shortName: "Gartua ≈" }, a: g, b: g + 10 * 60_000 });
    }
    items.sort((x, y) => x.a - y.a);

    const blocks = [];
    const laneEnd = [-Infinity, -Infinity];
    // Label widths in % of the track, so labels never overlap at any width.
    const trackPx = Math.max(640, els.track.clientWidth || 1000);
    const labelPct = (text) => ((text.length * 7 + 10) / trackPx) * 100;
    for (const it of items) {
      const left = ((it.a - start) / span) * 100;
      const width = Math.max(0.6, ((it.b - it.a) / span) * 100);
      const blk = el("div", "blk");
      blk.dataset.ev = it.event.id;
      blk.style.left = `${left.toFixed(2)}%`;
      blk.style.width = `${width.toFixed(2)}%`;
      blk.title = `${it.event.name || it.event.shortName} · ${when(new Date(it.a))}`;
      const lane = left > laneEnd[0] ? 0 : left > laneEnd[1] ? 1 : -1;
      if (lane >= 0) {
        blk.append(el("span", lane === 0 ? "up" : "dn", it.event.shortName));
        laneEnd[lane] = left + labelPct(it.event.shortName);
      }
      blocks.push(blk);
    }
    const nowLine = el("div", "nowl");
    nowLine.style.left = "0%";
    els.track.replaceChildren(...blocks, nowLine);

    // Hour labels every 3 hours, on the hour, in local time.
    const labels = [];
    const first = new Date(start);
    first.setMinutes(0, 0, 0);
    first.setHours(first.getHours() + 1);
    while (first.getHours() % 3 !== 0) first.setHours(first.getHours() + 1);
    for (let h = first.getTime(); h < end; h += 3 * 3_600_000) {
      const pos = ((h - start) / span) * 100;
      if (pos < labelPct("Now 00:00")) continue; // keep clear of the "Now" marker
      const s = el("span", null, hourFmt.format(new Date(h)));
      s.style.left = `${pos.toFixed(2)}%`;
      labels.push(s);
    }
    els.hours.replaceChildren(...labels);
  }

  function eventCard({ event, occ }, live) {
    const card = el("article", "card ev");
    card.dataset.ev = event.id;
    const top = el("div", "ev-top");
    top.append(icon(EVENT_ICON[event.id] || "activity", "si"));
    const t = now();
    const startsIn = Date.parse(occ.startsAt) - t;
    top.append(el("span", live ? "pill live" : startsIn <= SOON_MS * 4 ? "pill soon" : "pill later", live ? "Live" : startsIn <= SOON_MS * 4 ? "Soon" : "Upcoming"));
    card.append(top, el("h3", null, event.name));
    const count = el("div", "when", "--");
    count.dataset.to = live ? occ.endsAt : occ.startsAt;
    card.append(count);
    const meta = el("div", "meta");
    meta.append(icon("clock"), el("span", null, live ? `Ends ${when(new Date(occ.endsAt))}` : `Starts ${when(new Date(occ.startsAt))}`));
    if (event.confidence === "low") meta.append(el("span", null, "· time not yet confirmed"));
    card.append(meta);
    if (live) {
      const bar = el("div", "bar");
      const fill = el("i");
      fill.dataset.from = occ.startsAt;
      fill.dataset.until = occ.endsAt;
      bar.append(fill);
      card.append(bar);
    }
    return card;
  }

  function gartuaCard() {
    const card = el("article", "card ev");
    card.dataset.ev = "gartua";
    const top = el("div", "ev-top");
    const pill = el("span", "pill later", "Estimate");
    pill.dataset.gartua = "pill";
    top.append(icon("skull", "si"), pill);
    const count = el("div", "when", "--");
    count.dataset.gartua = "count";
    const meta = el("div", "meta");
    meta.dataset.gartua = "when";
    const bar = el("div", "bar");
    const fill = el("i");
    fill.dataset.gartua = "bar";
    bar.append(fill);
    const note = el("p", "note");
    note.dataset.gartua = "source";
    card.append(top, el("h3", null, "Immortal Gartua"), count, meta, bar, note);
    return card;
  }

  function renderEvents(active, upcoming) {
    const cards = [];
    if (data.region.id === "asia") cards.push(gartuaCard());
    for (const a of active) cards.push(eventCard(a, true));
    const liveIds = new Set(active.map((a) => a.event.id));
    for (const u of upcoming) {
      if (cards.length >= 6) break;
      if (liveIds.has(u.event.id)) continue;
      cards.push(eventCard(u, false));
    }
    els.events.replaceChildren(...cards.slice(0, 6));
  }

  function renderSchedule(upcoming) {
    els.nextList.replaceChildren(...upcoming.map(({ event, occ }) => {
      const row = el("div", "er");
      row.dataset.ev = event.id;
      row.dataset.start = occ.startsAt;
      const name = el("div", "en");
      name.append(el("b", null, event.name));
      if (event.confidence === "low") name.append(el("span", null, "Time not yet confirmed"));
      else if (event.description) name.append(el("span", null, event.description));
      const startsIn = Date.parse(occ.startsAt) - now();
      const pill = el("span", startsIn <= SOON_MS * 4 ? "pill soon" : "pill later", startsIn <= SOON_MS * 4 ? "Soon" : "Upcoming");
      const count = el("span", "cd", "--");
      count.dataset.to = occ.startsAt;
      row.append(icon(EVENT_ICON[event.id] || "activity", "si"), name, pill, el("span", "at", when(new Date(occ.startsAt))), count);
      return row;
    }));
  }

  // One or two icons per server: open, creation blocked, new, maintenance or offline.
  function stateIcons(x) {
    const box = el("span", "state");
    const put = (name, kind, label) => {
      const i = icon(name, `ni ${kind}`);
      i.title = label;
      i.setAttribute("role", "img");
      i.setAttribute("aria-label", label);
      box.append(i);
    };
    const note = x.note || "";
    if (x.status === "Offline") put("power-off", "off", note || "Offline");
    else if (x.status === "Maintenance") put("wrench", "mnt", note || "Under maintenance");
    else {
      if (/new server/i.test(note)) put("badge-plus", "new", note);
      if (/creation blocked|blocked/i.test(note)) put("lock", "lock", note);
      if (!box.firstChild) put("circle-check", "ok", note || "Online · open for new characters");
    }
    return box;
  }

  function renderStatus() {
    const s = data.status;
    const rows = s && s.servers.length ? s.servers : [];
    els.statusEmpty.hidden = rows.length !== 0;
    els.statusSub.hidden = rows.length === 0;
    const servers = [...rows].sort((a, b) => {
      const ah = a.name.toLowerCase() === HOME_SERVER ? 0 : 1;
      const bh = b.name.toLowerCase() === HOME_SERVER ? 0 : 1;
      return ah - bh || a.name.localeCompare(b.name);
    });
    els.statusList.replaceChildren(...servers.map((x) => {
      const row = el("div", "sv-row");
      if (x.name.toLowerCase() === HOME_SERVER) row.dataset.home = "";
      const dot = el("span", "dot");
      dot.dataset.status = x.status;
      const pop = el("div", "pop");
      const fill = el("i");
      const pct = x.populationPercent;
      if (pct != null) {
        fill.style.width = `${Math.max(2, Math.min(100, pct))}%`;
        fill.dataset.level = pct >= 80 ? "busy" : pct < 45 ? "low" : "normal";
      }
      pop.append(fill);
      row.append(dot, el("b", null, x.name), pop, el("span", "pct", pct != null ? `${Math.round(pct)}%` : "–"), stateIcons(x));
      return row;
    }));
    els.statusUpdated.textContent = s && s.fetchedAt ? `Checked ${ago(now() - Date.parse(s.fetchedAt))}` : "";
  }

  function renderGartua(t) {
    const nodes = document.querySelectorAll("[data-gartua]");
    if (!nodes.length) return;
    const set = (key, fn) => document.querySelectorAll(`[data-gartua="${key}"]`).forEach(fn);
    const g = data && data.gartua;
    if (!g) {
      set("count", (n) => { n.textContent = "--"; });
      set("sub", (n) => { n.textContent = "no estimate yet"; });
      set("when", (n) => { n.textContent = "No respawn reported yet. Trusted members can set one with /gartua set in Discord."; });
      set("source", (n) => { n.textContent = ""; });
      return;
    }
    const spawn = Date.parse(g.spawnAt);
    const remaining = spawn - t;
    const progress = Math.min(1, Math.max(0, 1 - remaining / (g.cycleHours * 3_600_000)));
    set("bar", (n) => { n.style.width = `${(progress * 100).toFixed(2)}%`; });
    if (remaining > 0) {
      set("count", (n) => { n.textContent = countdown(remaining); });
      set("sub", (n) => { n.textContent = `≈ ${when(new Date(spawn))} · estimate`; });
      set("when", (n) => { n.textContent = `Expected ≈ ${when(new Date(spawn))} your time`; });
      set("pill", (n) => { n.className = "pill later"; n.textContent = "Estimate"; });
    } else {
      set("count", (n) => { n.textContent = "Due"; });
      set("sub", (n) => { n.textContent = `reached ${ago(-remaining)}`; });
      set("when", (n) => { n.textContent = `Respawn time reached at ${when(new Date(spawn))}. It may be up, or already taken.`; });
      set("pill", (n) => { n.className = "pill due"; n.textContent = "Due"; });
    }
    const reported = g.reportedAt ? ago(t - Date.parse(g.reportedAt)) : null;
    set("source", (n) => {
      n.textContent = (g.source === "aion2timers"
        ? `From Aion2Timers kill reports${reported ? `, updated ${reported}` : ""}.`
        : `Set by a trusted member in Discord${reported ? ` ${reported}` : ""}.`) + " Check the Field Boss list in-game before you fly out.";
    });
  }

  function tick() {
    const t = now();
    els.clock.textContent = timeFmt.format(new Date(t));
    renderGartua(t);

    let stale = false;
    for (const node of document.querySelectorAll("[data-to]")) {
      const left = Date.parse(node.dataset.to) - t;
      if (left <= 0) stale = true;
      node.textContent = countdown(left);
    }
    for (const fill of document.querySelectorAll("[data-from][data-until]")) {
      const a = Date.parse(fill.dataset.from);
      const b = Date.parse(fill.dataset.until);
      fill.style.width = `${Math.min(100, Math.max(0, ((t - a) / (b - a)) * 100)).toFixed(1)}%`;
    }
    for (const row of els.nextList.querySelectorAll(".er")) {
      const left = Date.parse(row.dataset.start) - t;
      row.toggleAttribute("data-soon", left > 0 && left <= SOON_MS);
    }

    // Something just started or ended: re-sort from what we have and fetch
    // fresh times shortly.
    if (stale) {
      render();
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(load, 1_000);
    }
  }

  // The timeline is redrawn each minute so "now" stays at the left edge.
  setInterval(() => { if (data) renderTimeline(now()); }, 60_000);
  window.addEventListener("resize", () => { if (data) renderTimeline(now()); });

  /* Players ----------------------------------------------------------------- */

  const OFFICIAL_SEARCH_URL = "https://www.aion2timers.com/player-search/";
  const ROSTER_REFRESH_MS = 5 * 60_000;
  const roster = { list: $("roster-list"), empty: $("roster-empty"), count: $("roster-count") };

  function outLink(text, href, label) {
    const a = el("a", null, text);
    a.href = href;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.setAttribute("aria-label", label);
    return a;
  }

  // Portrait with the class emblem in its corner, or the emblem alone until a portrait is known.
  const EMBLEMS = new Set(["gladiator", "templar", "assassin", "ranger", "sorcerer", "elementalist", "cleric", "chanter"]);
  function portrait(m) {
    let key = String(m.className || "").toLowerCase().replace(/[^a-z]/g, "");
    if (key === "spiritmaster") key = "elementalist";
    const box = el("div", m.portrait ? "pt" : "pt none");
    box.dataset.class = CLASS_GLYPHS[key] ? key : "unknown";
    const em = el("span", "emb");
    if (EMBLEMS.has(key)) {
      const ei = document.createElement("img");
      ei.src = `/emblems/${key}.png`;
      ei.alt = m.className;
      em.append(ei);
    } else {
      return classBadge(m.className);
    }
    if (m.portrait) {
      const pi = document.createElement("img");
      pi.className = "por";
      pi.src = m.portrait;
      pi.alt = "";
      pi.loading = "lazy";
      // If the portrait can't be loaded, fall back to the large emblem.
      pi.addEventListener("error", () => { pi.remove(); box.className = "pt none"; });
      box.append(pi);
    }
    box.append(em);
    return box;
  }

  async function loadRoster() {
    try {
      const res = await fetch("/api/roster", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { members, legion } = await res.json();
      const ours = typeof legion === "string" ? legion.toLowerCase() : "";
      roster.count.textContent = members.length === 1 ? "1 character" : `${members.length} characters`;
      roster.empty.hidden = members.length !== 0;
      roster.list.hidden = members.length === 0;
      roster.list.replaceChildren(...members.map((m) => {
        const card = el("div", "rc");
        const isOurs = m.legion && m.legion.toLowerCase() === ours;
        if (isOurs) card.dataset.home = "";
        const info = el("div", "rn");
        const name = el("b", null, m.characterName);
        if (m.faction === "Elyos" || m.faction === "Asmodian") {
          const f = el("span", "faction");
          f.dataset.f = m.faction;
          const fi = document.createElement("img");
          fi.src = `/emblems/${m.faction.toLowerCase()}.png`;
          fi.alt = "";
          f.append(fi, m.faction);
          name.append(f);
        }
        const bits = [m.className || "Unknown class"];
        if (m.level != null) bits.push(`Lv ${m.level}`);
        if (m.legion && !isOurs) bits.push(m.legion.charAt(0).toUpperCase() + m.legion.slice(1));
        else if (m.server) bits.push(m.server);
        const links = el("div", "links");
        if (m.profileUrl) links.append(outLink("Official", m.profileUrl, `${m.characterName} on the official AION 2 site`));
        if (m.armoryUrl) links.append(outLink("Armory", m.armoryUrl, `${m.characterName} on Aion2Timers Armory`));
        info.append(name, el("span", null, bits.join(" · ")), links);
        const cp = el("div", "cp");
        cp.append(el("b", null, m.combatPower != null ? m.combatPower.toLocaleString() : "–"), el("span", null, m.itemLevel != null ? `CP · iLv ${m.itemLevel}` : "CP"));
        card.append(portrait(m), info, cp);
        return card;
      }));
    } catch {
      roster.count.textContent = "";
      roster.list.hidden = true;
      roster.empty.hidden = false;
      roster.empty.textContent = "The roster couldn't be loaded. It will retry in a few minutes.";
    }
  }

  /* DPS today (shared from Daeva Meter) -------------------------------------- */

  const DPS_REFRESH_MS = 60_000;
  const dps = {
    list: $("dps-list"), join: $("dps-join"), lead: $("dps-join-lead"), foot: $("dps-foot"), since: $("dps-since"),
    cls: $("cls-list"), count: $("cls-count"),
  };
  const ALL_CLASSES = ["Gladiator", "Templar", "Assassin", "Ranger", "Sorcerer", "Elementalist", "Cleric", "Chanter"];
  const JOIN_BELOW = 6;

  function shortNum(n) {
    if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e7 ? 1 : 2)}M`;
    if (n >= 1e4) return `${(n / 1e3).toFixed(1)}k`;
    return Math.round(n).toLocaleString();
  }
  function mmss(sec) {
    return `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, "0")}`;
  }

  async function loadDps() {
    try {
      const res = await fetch("/api/dps-today", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const b = await res.json();
      dps.since.textContent = `since ${timeFmt.format(new Date(b.startsAt))} reset`;
      dps.count.textContent = b.fights === 1 ? "1 fight" : `${b.fights} fights`;

      // Few players so far: show how to join underneath, so the card stays full.
      dps.list.hidden = b.top.length === 0;
      dps.join.hidden = b.top.length >= JOIN_BELOW;
      dps.foot.hidden = !dps.join.hidden;
      dps.lead.textContent = b.top.length === 0 ? "No fights shared yet today. Be the first:" : "Want to see your name here?";
      dps.list.replaceChildren(...b.top.map((p, i) => {
        const row = el("div", "dps-row");
        const who = el("div", "who");
        who.append(el("b", null, p.name), el("span", null, [p.className, p.target, mmss(p.duration)].filter(Boolean).join(" · ")));
        const val = el("div", "val");
        const num = el("b", null, shortNum(p.dps));
        if (p.verified) {
          const v = el("i", "ver", "✓");
          v.title = "Verified: the meter counted every hit on this boss (HP check)";
          num.append(v);
        }
        val.append(num, el("span", null, "DPS"));
        row.append(el("span", "rank", String(i + 1)), classBadge(p.className), who, val);
        return row;
      }));

      const max = Math.max(1, ...b.classes.map((c) => c.best)) * 1.04;
      // Every class is listed; classes without fights yet sit at the bottom.
      const seen = new Set(b.classes.map((c) => c.className));
      const rows = [...b.classes, ...ALL_CLASSES.filter((n) => !seen.has(n)).map((n) => ({ className: n, average: 0, best: 0, fights: 0 }))];
      dps.cls.replaceChildren(...rows.map((c) => {
        const row = el("div", "cls-row");
        if (!c.fights) row.dataset.none = "";
        row.dataset.class = String(c.className).toLowerCase();
        const bar = el("div", "cbar");
        const avg = el("i");
        avg.style.width = `${(c.average / max) * 100}%`;
        const best = el("u");
        best.style.left = `${(c.best / max) * 100}%`;
        best.title = `Best fight ${shortNum(c.best)} DPS`;
        bar.append(avg);
        if (c.fights) bar.append(best);
        const num = el("div", "num2");
        num.append(el("b", null, c.fights ? shortNum(c.average) : "–"), el("span", null, c.fights === 1 ? "1 fight" : `${c.fights} fights`));
        row.append(classBadge(c.className), el("span", "nm", c.className), bar, num);
        return row;
      }));
    } catch {
      dps.list.hidden = true;
      dps.join.hidden = false;
      dps.foot.hidden = true;
    }
  }

  const findForm = $("find-form");
  const findName = $("find-name");
  const findNote = $("find-note");

  findForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const name = findName.value.trim();
    if (!name) return;

    // Start the copy while this tab still has focus, then open the tab
    // straight away so popup blockers see it as part of the click.
    const copying = navigator.clipboard ? navigator.clipboard.writeText(name) : Promise.reject();
    const url = OFFICIAL_SEARCH_URL.includes("{name}")
      ? OFFICIAL_SEARCH_URL.replace("{name}", encodeURIComponent(name))
      : OFFICIAL_SEARCH_URL;
    window.open(url, "_blank", "noopener");

    let copied = false;
    try {
      await copying;
      copied = true;
    } catch {
      /* clipboard blocked: the name stays in the box to copy by hand */
    }

    findNote.dataset.done = "";
    findNote.textContent = copied
      ? `"${name}" is copied. Paste it into the search box on Aion2Timers.`
      : `Type "${name}" into the search box on Aion2Timers.`;
  });

  /* Wiring ------------------------------------------------------------------ */

  drawIcons();
  els.zone.textContent = zoneName;
  for (const id of ["day-sub", "up-sub"]) {
    const node = $(id);
    if (node && zoneName) node.textContent += ` (${zoneName})`;
  }
  els.region.addEventListener("change", () => {
    regionId = els.region.value;
    saveRegion(regionId);
    load();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") load();
  });

  setInterval(tick, 1_000);
  load();
  loadRoster();
  setInterval(loadRoster, ROSTER_REFRESH_MS);
  loadDps();
  setInterval(loadDps, DPS_REFRESH_MS);
})();
