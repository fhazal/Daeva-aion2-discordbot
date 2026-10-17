"use strict";

(() => {
  const REFRESH_MS = 30_000;
  const SOON_MS = 15 * 60_000;
  const STORAGE_KEY = "daeva.region";
  const HOME_SERVER = "beritra";

  const $ = (id) => document.getElementById(id);
  const els = {
    region: $("region"),
    clock: $("clock"),
    zone: $("zone"),
    banner: $("banner"),
    gartua: $("gartua"),
    gBar: $("gartua-bar"),
    gCount: $("gartua-count"),
    gPhase: $("gartua-phase"),
    gWhen: $("gartua-when"),
    gSource: $("gartua-source"),
    tiles: $("tiles"),
    nowSection: $("now-section"),
    nowList: $("now-list"),
    nextList: $("next-list"),
    status: $("status"),
    statusList: $("status-list"),
    statusUpdated: $("status-updated"),
  };

  let data = null;
  let clockOffset = 0; // server time minus device time, in ms
  let regionId = readRegion();
  let refreshTimer = null;

  const timeFmt = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" });
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
  }

  function render() {
    if (!data) return;
    const { active, upcoming } = split(now());
    renderTiles(upcoming);
    renderNow(active);
    renderNext(upcoming);
    renderStatus();
    tick();
  }

  function tile(label, sub) {
    const box = el("div", "tile");
    const value = el("p", "tile-value", "--");
    box.append(el("p", "tile-label", label), value, el("p", "tile-sub", sub));
    return { box, value };
  }

  function renderTiles(upcoming) {
    const tiles = [];
    for (const id of ["spacetime_rift", "shugo_festival", "daily_reset"]) {
      const hit = upcoming.find((u) => u.event.id === id);
      if (!hit) continue;
      const { box, value } = tile(`Next ${hit.event.shortName.toLowerCase()}`, `At ${when(new Date(hit.occ.startsAt))}`);
      value.dataset.to = hit.occ.startsAt;
      tiles.push(box);
    }

    const home = data.status && data.status.servers.find((s) => s.name.toLowerCase() === HOME_SERVER);
    if (home) {
      const pop = home.populationPercent != null ? `${Math.round(home.populationPercent)}% population` : "Population unknown";
      const { box, value } = tile(`${home.name} status`, pop);
      value.textContent = home.status;
      value.dataset.tone = home.status === "Online" ? "good" : home.status === "Maintenance" ? "warn" : "bad";
      tiles.push(box);
    } else {
      const weekly = upcoming.find((u) => u.event.id === "weekly_reset");
      if (weekly) {
        const { box, value } = tile("Weekly reset", `At ${when(new Date(weekly.occ.startsAt))}`);
        value.dataset.to = weekly.occ.startsAt;
        tiles.push(box);
      }
    }

    els.tiles.replaceChildren(...tiles);
    els.tiles.hidden = tiles.length === 0;
  }

  function renderNow(active) {
    els.nowSection.hidden = active.length === 0;
    els.nowList.replaceChildren(...active.map(({ event, occ }) => {
      const card = el("article", "card");
      const tags = el("div", "tags");
      tags.append(el("span", "tag tag-live", "Live"), el("span", "tag", event.shortName));
      const count = el("p", "card-count", "--");
      count.dataset.to = occ.endsAt;
      card.append(
        el("h3", "card-title", `${event.emoji} ${event.name}`),
        tags,
        el("p", "card-label", `Ends at ${when(new Date(occ.endsAt))}`),
        count,
      );
      return card;
    }));
  }

  function renderNext(upcoming) {
    els.nextList.replaceChildren(...upcoming.map(({ event, occ }) => {
      const tr = el("tr");
      tr.dataset.start = occ.startsAt;

      const name = el("td");
      const wrap = el("span", "ev");
      const label = el("span");
      label.append(el("span", "ev-name", event.name));
      if (event.confidence === "low") label.append(el("span", "ev-note", "Time not yet confirmed"));
      wrap.append(el("span", "ev-emoji", event.emoji), label);
      name.append(wrap);

      const startCell = el("td", "when", when(new Date(occ.startsAt)));
      const inCell = el("td", "num");
      const count = el("span", "in", "--");
      count.dataset.to = occ.startsAt;
      inCell.append(count);

      tr.append(name, startCell, inCell);
      return tr;
    }));
  }

  function renderStatus() {
    const s = data.status;
    if (!s || s.servers.length === 0) {
      els.status.hidden = true;
      return;
    }
    els.status.hidden = false;

    const servers = [...s.servers].sort((a, b) => {
      const ah = a.name.toLowerCase() === HOME_SERVER ? 0 : 1;
      const bh = b.name.toLowerCase() === HOME_SERVER ? 0 : 1;
      return ah - bh || a.name.localeCompare(b.name);
    });

    els.statusList.replaceChildren(...servers.map((x) => {
      const tr = el("tr");
      const name = el("td", null, x.name);
      if (x.name.toLowerCase() === HOME_SERVER) {
        tr.dataset.home = "";
        name.append(el("span", "home-tag", "Our server"));
      }
      const pop = el("td", "num");
      pop.append(el("span", "pop", x.populationPercent != null ? `${Math.round(x.populationPercent)}%` : "–"));
      const state = el("td", "num");
      const badge = el("span", "state", x.status);
      badge.dataset.status = x.status;
      state.append(badge);
      tr.append(name, pop, state);
      return tr;
    }));

    els.statusUpdated.textContent = s.fetchedAt ? `Checked ${ago(now() - Date.parse(s.fetchedAt))}` : "";
  }

  function renderGartua(t) {
    if (!data || data.region.id !== "asia") {
      els.gartua.hidden = true;
      return;
    }
    els.gartua.hidden = false;
    const g = data.gartua;

    if (!g) {
      els.gartua.dataset.state = "unknown";
      els.gBar.style.width = "0%";
      els.gCount.textContent = "--:--";
      els.gPhase.textContent = "no estimate yet";
      els.gWhen.textContent = "No respawn time has been reported yet. Trusted members can set one with /gartua set in Discord.";
      els.gSource.textContent = "";
      return;
    }

    const spawn = Date.parse(g.spawnAt);
    const remaining = spawn - t;
    const progress = Math.min(1, Math.max(0, 1 - remaining / (g.cycleHours * 3_600_000)));
    els.gBar.style.width = `${(progress * 100).toFixed(2)}%`;

    if (remaining > 0) {
      els.gartua.dataset.state = "waiting";
      els.gCount.textContent = countdown(remaining);
      els.gPhase.textContent = "until respawn";
      els.gWhen.replaceChildren("Expected at ", strong(when(new Date(spawn))), " your time.");
    } else {
      els.gartua.dataset.state = "due";
      els.gCount.textContent = "Due";
      els.gPhase.textContent = ago(-remaining);
      els.gWhen.replaceChildren("Respawn time reached at ", strong(when(new Date(spawn))), ". It may be up, or already taken.");
    }

    const reported = g.reportedAt ? ago(t - Date.parse(g.reportedAt)) : null;
    els.gSource.dataset.source = g.source;
    els.gSource.textContent = g.source === "aion2timers"
      ? `From Aion2Timers kill reports${reported ? `, updated ${reported}` : ""}.`
      : `Set by a trusted member in Discord${reported ? ` ${reported}` : ""}.`;
  }

  function strong(text) {
    return el("strong", null, text);
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
    for (const tr of els.nextList.querySelectorAll("tr")) {
      const left = Date.parse(tr.dataset.start) - t;
      tr.toggleAttribute("data-soon", left > 0 && left <= SOON_MS);
    }

    // Something just started or ended: re-sort from what we have and fetch
    // fresh times shortly.
    if (stale) {
      render();
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(load, 1_000);
    }
  }

  /* Players ----------------------------------------------------------------- */

  // Official character search. A "{name}" placeholder, if present, is filled in.
  const OFFICIAL_SEARCH_URL = "https://www.aion2timers.com/player-search/";
  const ROSTER_REFRESH_MS = 5 * 60_000;

  const roster = {
    table: $("roster-table"),
    list: $("roster-list"),
    empty: $("roster-empty"),
    count: $("roster-count"),
  };

  function outLink(text, href, label) {
    const a = el("a", null, text);
    a.href = href;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.setAttribute("aria-label", label);
    return a;
  }

  async function loadRoster() {
    try {
      const res = await fetch("/api/roster", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { members, legion } = await res.json();
      const ours = typeof legion === "string" ? legion.toLowerCase() : "";
      roster.count.textContent = members.length === 1 ? "1 member" : `${members.length} members`;
      roster.table.hidden = members.length === 0;
      roster.empty.hidden = members.length !== 0;
      roster.list.replaceChildren(...members.map((m) => {
        const tr = el("tr");
        const linkCell = el("td", "num links");
        const official = outLink("Official", m.profileUrl, `${m.characterName} on the official AION 2 site`);
        linkCell.append(official);
        if (m.armoryUrl) {
          linkCell.append(outLink("Armory", m.armoryUrl, `${m.characterName} on Aion2Timers Armory`));
        }
        const classCell = el("td");
        classCell.append(el("span", "class-tag", m.className));
        const levelCell = el("td", "num pop", m.level != null ? String(m.level) : "–");
        const cpCell = el("td", "num pop", m.combatPower != null ? m.combatPower.toLocaleString() : "–");
        const legionCell = el("td");
        if (m.legion) {
          const isOurs = m.legion.toLowerCase() === ours;
          const name = m.legion.charAt(0).toUpperCase() + m.legion.slice(1);
          legionCell.append(el("span", isOurs ? "legion-tag ours" : "legion-tag", name));
          if (isOurs) tr.dataset.home = "";
        } else {
          legionCell.append(el("span", "when", "–"));
        }
        tr.append(el("td", "char-name", m.characterName), classCell, levelCell, cpCell, legionCell, el("td", "when", m.server), linkCell);
        return tr;
      }));
    } catch {
      roster.count.textContent = "";
      roster.table.hidden = true;
      roster.empty.hidden = false;
      roster.empty.textContent = "The roster couldn't be loaded. It will retry in a few minutes.";
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
    findNote.textContent = OFFICIAL_SEARCH_URL.includes("{name}")
      ? `Opened the official search for "${name}".`
      : copied
        ? `"${name}" is copied. Paste it into the search box on the official site.`
        : `Type "${name}" into the search box on the official site.`;
  });

  /* Wiring ------------------------------------------------------------------ */

  els.zone.textContent = zoneName;
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
})();
