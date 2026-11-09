"use strict";

const ICONS = {
  teams: '<path d="M2.5 3h11a1 1 0 0 1 1 1v6.5a1 1 0 0 1-1 1H8.5L5 14v-2.5H2.5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M5.5 6.25h5M8 6.25v3"/>',
  email: '<rect x="1.5" y="3" width="13" height="10" rx="1.5"/><path d="M2 4l6 4.5L14 4"/>',
  calendar: '<rect x="1.5" y="3" width="13" height="11" rx="1.5"/><path d="M1.5 6.5h13M5 1.5v3M11 1.5v3"/>',
  accept: '<rect x="1.5" y="3" width="13" height="11" rx="1.5"/><path d="M1.5 6.5h13M5 1.5v3M11 1.5v3M5.5 10.2l1.8 1.8 3.2-3.4"/>',
  tentative: '<path d="M3 3.5h10M3 8h7M3 12.5h4"/>',
  decline: '<path d="M4 4l8 8M12 4l-8 8"/>',
  delete: '<path d="M4.5 4.5l7 7M11.5 4.5l-7 7"/>',
  dismiss: '<path d="M3 8.5l3.2 3.2L13 4.8"/>',
  open: '<path d="M9 2.5h4.5V7M13.5 2.5L7.5 8.5M12 9.5v3a1 1 0 0 1-1 1H3.5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1H6.5"/>',
  app: '<rect x="1.5" y="2.5" width="13" height="11" rx="1.5"/><path d="M1.5 5.5h13M4 4h.01M6 4h.01"/>',
  search: '<circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5L14 14"/>',
  alert: '<circle cx="8" cy="8" r="6"/><path d="M8 4.8v3.6M8 11v.01"/>',
  check: '<circle cx="8" cy="8" r="6"/><path d="M5.2 8.2l2 2 3.6-4"/>',
  send: '<path d="M2 3l12 5-12 5 2-5zM4 8h10"/>',
  back: '<path d="M7 3L2.5 8 7 13M3 8h10.5"/>',
};

const SOURCES = {
  teams: { label: "Teams", appLabel: "Teams", where: "Teams app", color: "var(--violet)" },
  email: { label: "Outlook", appLabel: "Outlook", where: "Outlook app", color: "var(--blue)" },
  calendar: { label: "Calendar", appLabel: "Outlook", where: "Outlook app", color: "var(--green)" },
};

const FILTERS = [
  ["all", "All", () => true],
  ["action", "Action", (item) => item.status === "action"],
  ["fyi", "FYI", (item) => item.status === "fyi"],
  ["teams", "Teams", (item) => item.source === "teams", "teams"],
  ["email", "Email", (item) => item.source === "email", "email"],
  ["calendar", "Calendar", (item) => item.source === "calendar", "calendar"],
];

const ROLES = {
  mention: { label: "@MENTION", hint: "You are @mentioned" },
  to: { label: "TO", hint: "You are a direct recipient" },
  cc: { label: "CC", hint: "You are on CC, or the thread went to a group" },
  bcc: { label: "BCC / DL", hint: "You received this through a distribution list or BCC" },
};

const $ = (id) => document.getElementById(id);
const workspace = $("workspace");
const list = $("list");
const search = $("search");
const detailScroll = $("detailScroll");
const drafts = new Map();
const leaving = new Map();
const pending = new Map();
const filterEls = new Map();
const roleEls = new Map();

let items = [];
let updatedAt = null;
let filter = "all";
let roleFilter = null;
let query = "";
let loaded = false;
let connected = true;
let refreshing = false;
let activeId = null;
let selectedId = null;
let calendarEvents = [];
let agendaUpdatedAt = null;
let agendaLoaded = false;
let agendaAutoTried = false;
let agendaRefreshing = false;
let agendaError = null;
let agendaDay = "all";
let agendaOpenNarrow = false;
let intel = null;
let intelSeq = 0;
let briefing = null;
let briefingSeq = 0;
let briefingConversationId = null;
const expandedPrep = new Set();
const prepData = new Map();
let detail = null;
let detailSeq = 0;
let statusTimer = null;
let detailStatusTimer = null;
let detailRetryTimer = null;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function icon(name) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", `i i-${name}`);
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("aria-hidden", "true");
  svg.innerHTML = ICONS[name] ?? "";
  return svg;
}

function minutesSince(iso) {
  return Math.round((Date.now() - new Date(iso).getTime()) / 60000);
}

function compact(iso) {
  if (!iso) return "";
  const min = minutesSince(iso);
  if (min < 1) return "now";
  if (min < 60) return `${min}m`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.round(hr / 24);
  return day < 7 ? `${day}d` : new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function ago(iso) {
  const text = compact(iso);
  return text === "now" ? "just now" : /^\d+[mhd]$/.test(text) ? `${text} ago` : text;
}

function formatTime(value) {
  if (!value) return "";
  let iso = value;
  if (typeof value === "object") {
    const raw = String(value.dateTime ?? "").trim();
    const zone = String(value.timeZone ?? "").trim();
    iso = (/^(utc|etc\/gmt)$/i.test(zone) && !/(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw))
      ? `${raw.replace(/\.0+$/, "")}Z`
      : raw;
  }
  if (!iso) return "";
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function formatBytes(size) {
  const bytes = Number(size ?? 0);
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function personName(person, fallback = "") {
  if (!person) return fallback;
  if (typeof person === "string") return person;
  return person.name || person.email || person.address || fallback;
}

function dedupeClientPeople(people) {
  const out = [];
  const seen = new Set();
  for (const person of Array.isArray(people) ? people : []) {
    if (!person) continue;
    const name = typeof person === "string" ? person.trim() : String(person.name ?? "").trim();
    const email = typeof person === "string" ? "" : String(person.email ?? person.address ?? "").trim();
    const key = (email || name).toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(typeof person === "string" ? { name, email: "", address: "" } : person);
  }
  return out;
}

function peopleText(people) {
  return dedupeClientPeople(people).map((person) => personName(person)).filter(Boolean).join(", ") || "None";
}

function humanizeResponse(value) {
  const key = String(value ?? "").trim().toLowerCase().replace(/[\s_-]+/g, "");
  if (key === "accepted") return "Accepted";
  if (key === "tentativelyaccepted" || key === "tentative") return "Tentative";
  if (key === "declined") return "Declined";
  if (key === "organizer") return "Organizer";
  return "No response";
}

function safeUrl(value) {
  const raw = String(value ?? "").replaceAll("&amp;", "&").trim();
  if (!raw || /[\u0000-\u001f\u007f]|%0a|%0d/i.test(raw)) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "mailto:") return null;
    if (url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
}

async function post(path, body) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}

function setStatus(message, isError = false) {
  const status = $("status");
  status.dataset.kind = isError ? "error" : "ok";
  status.replaceChildren(icon(isError ? "alert" : "check"), el("span", "", message));
  $("foot").classList.add("has-status");
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => $("foot").classList.remove("has-status"), isError ? 7000 : 3500);

  const detailStatus = $("detailStatus");
  if (detailStatus) {
    detailStatus.hidden = false;
    detailStatus.dataset.kind = isError ? "error" : "ok";
    detailStatus.replaceChildren(icon(isError ? "alert" : "check"), el("span", "", message));
    if (message) detailStatus.title = message;
    else detailStatus.removeAttribute("title");
    clearTimeout(detailStatusTimer);
    detailStatusTimer = setTimeout(() => {
      detailStatus.hidden = true;
      detailStatus.removeAttribute("title");
      detailStatus.replaceChildren();
    }, isError ? 7000 : 4000);
  }
}

function visible() {
  const test = FILTERS.find(([key]) => key === filter)[2];
  const needle = query.trim().toLowerCase();
  const shown = [...items, ...[...leaving.values()].filter((item) => !items.some((entry) => entry.id === item.id))];
  return shown.filter(
    (item) =>
      test(item) &&
      (!roleFilter || item.recipientRole === roleFilter) &&
      (!needle || `${item.title} ${item.sender} ${item.summary}`.toLowerCase().includes(needle)),
  );
}

const rowEl = (id) => list.querySelector(`li.row[data-id="${CSS.escape(id)}"]`);
const itemById = (id) => items.find((item) => item.id === id && !leaving.has(item.id));
const isCanceledItem = (item) =>
  Boolean(item?.isCancelled) ||
  /^\s*(?:canceled|cancelled):/i.test(String(item?.title ?? "")) ||
  (detail?.id === item?.id && Boolean(detail?.isCancelled || detail?.meeting?.isCancelled));
const canRespond = (item) => item?.source === "calendar" && item.status === "action" && !isCanceledItem(item);

function roleBadge(role) {
  const badge = el("span", "role", ROLES[role].label);
  badge.dataset.role = role;
  badge.title = ROLES[role].hint;
  return badge;
}

function actionButton(label, glyph, { className = "", title = label, onClick, disabled = false, busy = false, key = "" } = {}) {
  const button = el("button", `btn ${className}`.trim());
  button.type = "button";
  button.title = title;
  button.disabled = disabled;
  if (busy) button.dataset.busy = "true";
  button.append(icon(glyph), el("span", "ring"));
  button.append(el("span", "", label));
  if (key) button.append(el("kbd", "", key));
  button.onclick = onClick;
  return button;
}

function buildFilters() {
  const bar = $("filters");
  for (const [key, label, , glyph] of FILTERS) {
    const button = el("button", "seg");
    button.type = "button";
    button.dataset.filter = key;
    button.title = label;
    if (glyph) button.append(icon(glyph));
    const count = el("span", "n");
    button.append(el("span", glyph ? "src-lbl" : "", label), count);
    button.onclick = () => {
      filter = key;
      updateFilters();
      reconcileVisibleSelection();
    };
    filterEls.set(key, { button, count });
    bar.append(button);
  }
}

function updateFilters() {
  for (const [key, , test] of FILTERS) {
    const entry = filterEls.get(key);
    entry.button.setAttribute("aria-pressed", String(key === filter));
    entry.count.textContent = items.filter(test).length;
  }
}

function buildRoles() {
  const bar = $("roles");
  bar.append(el("span", "lead", "Addressed"));
  for (const [role, data] of Object.entries(ROLES)) {
    const button = el("button", "chip");
    button.type = "button";
    button.dataset.role = role;
    button.title = `${data.hint}. Select to filter.`;
    const dot = el("span", "dot");
    dot.setAttribute("aria-hidden", "true");
    const count = el("span", "n");
    button.append(dot, el("span", "", data.label), count);
    button.onclick = () => {
      roleFilter = roleFilter === role ? null : role;
      updateRoles();
      reconcileVisibleSelection();
    };
    roleEls.set(role, { button, count });
    bar.append(button);
  }
}

function updateRoles() {
  for (const [role, entry] of roleEls) {
    entry.button.setAttribute("aria-pressed", String(roleFilter === role));
    entry.count.textContent = items.filter((item) => item.recipientRole === role).length;
  }
}

function updateCount() {
  const actionCount = items.filter((item) => item.status === "action").length;
  const nodes = [el("b", "", String(items.length)), " unread"];
  if (actionCount) {
    const action = el("span", "act");
    action.append(el("b", "", String(actionCount)), " need action");
    nodes.push(" · ", action);
  }
  $("count").replaceChildren(...nodes);
}

function updateSync() {
  const sync = $("sync");
  sync.dataset.state = !connected ? "offline" : "";
  if (refreshing) sync.textContent = "Syncing Microsoft 365…";
  else if (!connected) sync.textContent = "Reconnecting…";
  else sync.textContent = updatedAt ? `Synced ${ago(updatedAt)}` : "";
}

function renderRow(item) {
  const source = SOURCES[item.source] ?? SOURCES.email;
  const busy = pending.has(item.id) || leaving.has(item.id);
  const row = el("li", "row");
  row.dataset.id = item.id;
  row.dataset.source = item.source;
  row.dataset.status = item.status;
  if (ROLES[item.recipientRole]) row.dataset.role = item.recipientRole;
  if (item.id === activeId) row.dataset.active = "true";
  if (item.id === selectedId) row.dataset.selected = "true";
  row.tabIndex = -1;
  if (busy) row.classList.add("busy");
  row.onclick = () => toggleItem(item);

  const glyph = el("span", "glyph");
  glyph.append(icon(item.source));
  const meta = el("div", "meta");
  if (ROLES[item.recipientRole]) meta.append(roleBadge(item.recipientRole));
  const sender = el("span", "sender", item.sender || (item.source === "teams" ? "Teams chat" : "Unknown sender"));
  sender.title = source.label;
  meta.append(sender);
  if (item.status === "action") meta.append(el("span", "flag", item.source === "calendar" ? "Needs response" : "Action"));
  if (item.receivedAt) {
    const time = el("time", "", compact(item.receivedAt));
    time.dateTime = item.receivedAt;
    time.title = formatTime(item.receivedAt);
    meta.append(time);
  }

  const subject = el("a", "subject", item.title);
  subject.href = "#";
  subject.tabIndex = -1;
  subject.onclick = (event) => {
    event.preventDefault();
    event.stopPropagation();
    toggleItem(item);
  };
  const main = el("div", "row-main");
  main.append(meta, subject);
  if (item.summary) main.append(el("div", "summary", item.summary));

  const actions = el("div", "row-actions");
  const open = actionButton("Open", "open", {
    className: "ghost",
    title: `Open in ${source.where} (O)`,
    onClick: (event) => {
      event.stopPropagation();
      openItem(item);
    },
  });
  const del = actionButton("Delete", "delete", {
    className: "ghost delete-btn",
    title: `Delete in ${source.label}`,
    disabled: busy,
    busy: pending.get(item.id) === "delete",
    onClick: (event) => {
      event.stopPropagation();
      deleteItem(item);
    },
  });
  const dismiss = actionButton("Done", "dismiss", {
    className: "ghost",
    title: `Done — mark read in ${source.label} (E)`,
    disabled: busy,
    busy: pending.get(item.id) === "dismiss",
    onClick: (event) => {
      event.stopPropagation();
      dismissItem(item);
    },
  });
  actions.append(open, del, dismiss);
  const clip = el("div", "clip");
  const body = el("div", "body");
  body.append(glyph, main, actions);
  clip.append(body);
  row.append(clip);
  return row;
}

function renderSkeleton() {
  list.replaceChildren(...Array.from({ length: 5 }, () => {
    const row = el("li", "skeleton");
    row.setAttribute("aria-hidden", "true");
    row.append(el("i"), el("i"), el("i"));
    return row;
  }));
}

function renderEmpty(shown) {
  const empty = $("empty");
  empty.hidden = !loaded || shown.length > 0;
  if (empty.hidden) return;
  if (!items.length) {
    const glyph = icon("check");
    glyph.classList.add("ok");
    empty.replaceChildren(glyph, el("h2", "", "Inbox zero"), el("p", "", "Nothing needs triage. Use Refresh to check Microsoft 365 again."));
    return;
  }
  const reset = actionButton("Show all", "search", {
    onClick: () => {
      filter = "all";
      roleFilter = null;
      query = "";
      search.value = "";
      updateFilters();
      updateRoles();
      renderList();
    },
  });
  empty.replaceChildren(icon("search"), el("h2", "", "No matches"), el("p", "", "No unread items match these filters."), reset);
}

function renderList() {
  updateCount();
  updateFilters();
  updateRoles();
  list.setAttribute("aria-busy", String(!loaded));
  if (!loaded) return renderSkeleton();
  const shown = visible();
  if (activeId && !shown.some((item) => item.id === activeId)) activeId = null;
  list.replaceChildren(...shown.map(renderRow));
  renderEmpty(shown);
}

function setActive(id, focus = false) {
  activeId = id;
  for (const row of list.querySelectorAll("li.row")) {
    if (row.dataset.id === id) {
      row.dataset.active = "true";
      if (focus) {
        row.focus({ preventScroll: true });
        row.scrollIntoView({ block: "nearest" });
      }
    } else {
      delete row.dataset.active;
    }
  }
}

function move(delta) {
  const ids = visible().filter((item) => !leaving.has(item.id)).map((item) => item.id);
  if (!ids.length) return;
  const index = ids.indexOf(activeId);
  const next = index < 0 ? (delta > 0 ? 0 : ids.length - 1) : Math.min(ids.length - 1, Math.max(0, index + delta));
  setActive(ids[next], true);
  if (innerWidth >= 780 && selectedId) {
    selectItem(itemById(ids[next]));
    rowEl(ids[next])?.focus({ preventScroll: true });
  }
}

function activeItem() {
  return itemById(activeId);
}

function showDetailLoading() {
  $("detailLoading").hidden = false;
  $("detailError").hidden = true;
  $("detailContent").replaceChildren();
  $("detailDock").replaceChildren();
}

function showDetailError(error) {
  $("detailLoading").hidden = true;
  $("detailContent").replaceChildren();
  const target = $("detailError");
  target.hidden = false;
  target.replaceChildren(
    icon("alert"),
    el("h2", "", "Could not load this item"),
    el("p", "", error.message),
    actionButton("Try again", "open", { onClick: () => selectItem(itemById(selectedId)) }),
  );
}

function toggleItem(item) {
  if (!item) return;
  if (selectedId === item.id) backToQueue();
  else selectItem(item);
}

async function selectItem(item) {
  if (!item || pending.has(item.id)) return;
  clearTimeout(detailRetryTimer);
  detailRetryTimer = null;
  selectedId = item.id;
  setActive(item.id);
  detail = null;
  const seq = ++detailSeq;
  agendaOpenNarrow = false;
  syncPane();
  renderList();
  renderDetailHeader(item);
  showDetailLoading();
  try {
    const result = await post("/api/detail", { id: item.id });
    if (seq !== detailSeq || selectedId !== item.id) return;
    detail = result;
    $("detailLoading").hidden = true;
    $("detailError").hidden = true;
    renderDetail(result);
    // Selecting an item reads only local context; the X-Ray button fetches the directory and related items on demand.
    loadIntel(item, { localOnly: true });
  } catch (error) {
    if (seq !== detailSeq || selectedId !== item.id) return;
    showDetailError(error);
    setStatus(`Detail failed: ${error.message}`, true);
  }
}

async function clearPublishedSelection() {
  try {
    await post("/api/detail", { clearSelection: true });
  } catch {
    // Reading-pane navigation remains local if an older extension host is still running.
  }
}

function renderDetailHeader(item) {
  const source = SOURCES[item.source] ?? SOURCES.email;
  const heading = $("detailHeading");
  const title = el("h2", "detail-title", item.title);
  const subtitle = el("div", "detail-subtitle", `${source.label} · ${item.sender || "Microsoft 365"}`);
  heading.replaceChildren(title, subtitle);
  const open = actionButton(`Open in ${source.appLabel ?? source.label}`, "open", {
    onClick: () => openItem(item),
    key: "O",
  });
  const del = actionButton("Delete", "delete", {
    className: "delete-btn",
    title: `Delete in ${source.label}`,
    onClick: () => deleteItem(item),
    disabled: pending.has(item.id),
    busy: pending.get(item.id) === "delete",
  });
  const dismiss = actionButton("Done", "dismiss", {
    title: `Done — mark read in ${source.label} (E)`,
    onClick: () => dismissItem(item),
    disabled: pending.has(item.id),
    busy: pending.get(item.id) === "dismiss",
    key: "E",
  });
  $("detailActions").replaceChildren(open, del, dismiss);
}

function definitionList(rows, className = "address-grid") {
  const dl = el("dl", className);
  for (const [label, value] of rows) {
    const dd = el("dd");
    if (value instanceof Node) dd.append(value);
    else dd.textContent = value || "—";
    dl.append(el("dt", "", label), dd);
  }
  return dl;
}

function appendPeopleRow(parent, label, people, { showResponse = false } = {}) {
  const deduped = dedupeClientPeople(people);
  const dt = el("dt", "", label);
  const dd = el("dd", "people-cell");
  if (!deduped.length) {
    dd.textContent = "None";
    parent.append(dt, dd);
    return;
  }
  const wrap = el("div", showResponse ? "people-chips attendee-list" : "people-chips");
  for (const [index, person] of deduped.entries()) {
    const labelText = personName(person, "Unknown");
    const chip = el("span", showResponse ? "person-chip attendee" : "person-chip", labelText);
    if (showResponse || person.response !== undefined) {
      const normalizedKey = String(person.response ?? "none").trim().toLowerCase().replace(/[\s_-]+/g, "");
      chip.dataset.response = normalizedKey;
      const humanResponse = humanizeResponse(person.response);
      const fullLabel = `${labelText} — ${humanResponse}`;
      chip.title = fullLabel;
      chip.setAttribute("aria-label", fullLabel);
    } else {
      const addr = String(person.email ?? person.address ?? "").trim();
      const fullLabel = addr && addr.toLowerCase() !== labelText.toLowerCase() ? `${labelText} <${addr}>` : labelText;
      chip.title = fullLabel;
      chip.setAttribute("aria-label", fullLabel);
    }
    if (index >= 3) {
      chip.hidden = true;
      chip.dataset.overflow = "true";
    }
    wrap.append(chip);
  }
  if (deduped.length > 3) {
    const extraCount = deduped.length - 3;
    const toggle = el("button", "chip-overflow-btn", `+${extraCount} more`);
    toggle.type = "button";
    toggle.setAttribute("aria-expanded", "false");
    toggle.onclick = () => {
      const expanded = toggle.getAttribute("aria-expanded") === "true";
      for (const node of wrap.querySelectorAll('[data-overflow="true"]')) {
        node.hidden = expanded;
      }
      toggle.setAttribute("aria-expanded", String(!expanded));
      toggle.textContent = expanded ? `+${extraCount} more` : "Show less";
    };
    wrap.append(toggle);
  }
  dd.append(wrap);
  parent.append(dt, dd);
}

function buildInlineRuns(text, links = []) {
  const source = String(text ?? "");
  const matches = [];
  const urlRe = /https:\/\/[^\s<>"')]+/g;
  let m;
  while ((m = urlRe.exec(source))) {
    const url = m[0].replace(/[.,;:!?]+$/, "");
    if (url) matches.push({ start: m.index, end: m.index + url.length, href: url });
  }
  for (const link of Array.isArray(links) ? links : []) {
    const label = String(link?.label ?? "");
    if (!label || !link?.href) continue;
    let from = 0;
    for (;;) {
      const at = source.indexOf(label, from);
      if (at < 0) break;
      matches.push({ start: at, end: at + label.length, href: link.href });
      from = at + label.length;
    }
  }
  matches.sort((a, b) => a.start - b.start || b.end - a.end);
  const runs = [];
  let cursor = 0;
  for (const match of matches) {
    if (match.start < cursor) continue;
    if (match.start > cursor) runs.push({ text: source.slice(cursor, match.start) });
    runs.push({ text: source.slice(match.start, match.end), href: match.href });
    cursor = match.end;
  }
  if (cursor < source.length) runs.push({ text: source.slice(cursor) });
  return runs.length ? runs : [{ text: source }];
}

function linksForBlock(block) {
  return block?.links ?? (block?.runs ?? []).filter((r) => r?.href).map((r) => ({ label: r.text, href: r.href }));
}

function renderRuns(container, block) {
  const hasRuns = Array.isArray(block?.runs) && block.runs.length;
  const runs = hasRuns && (block.runs.some((r) => r.href) || !block?.links?.length)
    ? block.runs
    : buildInlineRuns(block?.text ?? "", block?.links ?? []);
  for (const run of runs) {
    const text = String(run?.text ?? "");
    const href = run?.href ? safeUrl(run.href) : null;
    let node = null;
    if (href) {
      node = el("a", "inline-link", text || href);
      node.href = href;
      node.title = href;
      node.target = "_blank";
      node.rel = "noreferrer noopener";
    } else if (text) {
      node = document.createTextNode(text);
    }
    if (!node) continue;
    for (const [flag, tag] of [["code", "code"], ["italic", "em"], ["bold", "strong"]]) {
      if (!run[flag]) continue;
      const wrapper = document.createElement(tag);
      wrapper.append(node);
      node = wrapper;
    }
    container.append(node);
  }
}

function renderTable(block) {
  const wrap = el("div", "table-wrap");
  const table = el("table", "data-table");
  const headRows =
    Array.isArray(block.headerRows) && block.headerRows.length
      ? block.headerRows
      : Array.isArray(block.headers) && block.headers.length
        ? [block.headers]
        : [];
  if (headRows.length) {
    const head = document.createElement("thead");
    for (const cells of headRows) {
      const row = document.createElement("tr");
      for (const cell of cells) {
        const th = document.createElement("th");
        if (cell?.colspan > 1) th.colSpan = cell.colspan;
        if (cell?.rowspan > 1) th.rowSpan = cell.rowspan;
        renderRuns(th, cell);
        row.append(th);
      }
      head.append(row);
    }
    table.append(head);
  }
  const body = document.createElement("tbody");
  for (const cells of block.rows ?? []) {
    const row = document.createElement("tr");
    for (const cell of cells) {
      const node = document.createElement(cell?.header ? "th" : "td");
      if (cell?.colspan > 1) node.colSpan = cell.colspan;
      if (cell?.rowspan > 1) node.rowSpan = cell.rowspan;
      renderRuns(node, cell);
      row.append(node);
    }
    body.append(row);
  }
  table.append(body);
  wrap.append(table);
  return wrap;
}

const CALENDAR_ENVELOPE_LINE_RE =
  /^(?:-{3,}\s*Original Appointment\s*-{3,}|(?:From|Sent|To|Cc|Bcc|Subject|When|Where)\s*:\s*.*)$/i;
const TEAMS_FOOTER_START_RE =
  /^(?:Microsoft Teams\b.*|(?:Join the meeting now|Meeting ID\s*:|Dial in by phone|Find a local number|Join on a video conferencing device).*)$/i;
const TEAMS_FOOTER_MARKER_RE =
  /(?:Meeting ID\s*:|Passcode\s*:|Dial in by phone|Find a local number|Join on a video conferencing device|For organizers\s*:\s*Meeting options)/i;
const QUOTED_HEADER_START_RE =
  /^(?:-{3,}\s*Original Message\s*-{3,}|On .+ wrote:)$/i;

function isQuotedEnvelopeBlock(text) {
  const value = String(text ?? "").trim();
  if (QUOTED_HEADER_START_RE.test(value)) return true;
  const hasFrom = /(?:^|\n)\s*From:\s*.+/i.test(value);
  const hasSentOrDate = /(?:^|\n)\s*(?:Sent|Date):\s*.+/i.test(value);
  const hasToOrSubject = /(?:^|\n)\s*(?:To|Subject):\s*.+/i.test(value);
  return hasFrom && hasSentOrDate && hasToOrSubject;
}

function stripCalendarHeaderFromBlock(block) {
  if (!block || block.type === "hr" || block.type === "code" || block.type === "table") return block;
  const lines = String(block.text ?? "").split(/\n/);
  const keptLines = lines.filter((line) => !CALENDAR_ENVELOPE_LINE_RE.test(line.trim()));
  if (keptLines.length === lines.length) return block;
  const nextText = keptLines.join("\n").trim();
  if (!nextText) return null;
  return {
    ...block,
    text: nextText,
    links: block.links,
    runs: buildInlineRuns(nextText, linksForBlock(block)),
  };
}

function foldReaderBlocks(blocks, { source = "email" } = {}) {
  const input = (Array.isArray(blocks) ? blocks : []).filter(Boolean);
  if (!input.length) return [];

  let working = input;
  if (source === "calendar") {
    const stripped = [];
    let seenSubstantive = false;
    for (const block of input) {
      if (!seenSubstantive) {
        const cleaned = stripCalendarHeaderFromBlock(block);
        if (!cleaned) continue;
        if (cleaned.type !== "hr" && cleaned.text) seenSubstantive = true;
        stripped.push(cleaned);
      } else {
        stripped.push(block);
      }
    }
    if (stripped.some((block) => block.type !== "hr" && block.text)) {
      working = stripped;
    }
  }

  // Split any combined block where substantive text is followed inline by Teams footer or Original Message
  const expanded = [];
  for (const block of working) {
    if (block.type === "p" && block.text && block.text.includes("\n")) {
      const lines = block.text.split("\n");
      const splitIndex = lines.findIndex(
        (line, idx) =>
          idx > 0 &&
          (TEAMS_FOOTER_START_RE.test(line.trim()) || QUOTED_HEADER_START_RE.test(line.trim())),
      );
      if (splitIndex > 0) {
        const headText = lines.slice(0, splitIndex).join("\n").trim();
        const tailText = lines.slice(splitIndex).join("\n").trim();
        const blockLinks = linksForBlock(block);
        if (headText) {
          expanded.push({ type: "p", text: headText, links: block.links, runs: buildInlineRuns(headText, blockLinks) });
        }
        if (tailText) {
          expanded.push({ type: "p", text: tailText, links: block.links, runs: buildInlineRuns(tailText, blockLinks) });
        }
        continue;
      }
    }
    expanded.push(block);
  }
  working = expanded;

  // A calendar body that is only the Teams join block duplicates the ledger's join row, so fold all of it.
  const hasTeamsFooterMarker = working.some((block) => TEAMS_FOOTER_MARKER_RE.test(block.text ?? ""));
  const firstText = working.find((block) => block.type !== "hr" && String(block.text ?? "").trim() && !/^_{8,}$/.test(String(block.text).trim()));
  const teamsOnly =
    source === "calendar" && hasTeamsFooterMarker && /^(?:Microsoft Teams\b|Join\b|Meeting ID\s*:)/i.test(String(firstText?.text ?? "").trim());
  if (teamsOnly) {
    working = [{ type: "details", summary: "Show meeting dial-in details", blocks: working }];
  } else if (hasTeamsFooterMarker) {
    let footerStart = -1;
    let substantiveBefore = 0;
    for (let i = 0; i < working.length; i++) {
      const block = working[i];
      const text = String(block.text ?? "").trim();
      if (
        substantiveBefore >= 1 &&
        (TEAMS_FOOTER_START_RE.test(text) || TEAMS_FOOTER_MARKER_RE.test(text))
      ) {
        footerStart = i > 0 && working[i - 1].type === "hr" && substantiveBefore >= 1 ? i - 1 : i;
        break;
      }
      if (block.type !== "hr" && text) substantiveBefore++;
    }
    if (footerStart > 0) {
      const head = working.slice(0, footerStart);
      const tail = working.slice(footerStart);
      if (head.some((block) => block.type !== "hr" && block.text)) {
        working = [
          ...head,
          {
            type: "details",
            summary: "Show meeting dial-in details",
            blocks: tail,
          },
        ];
      }
    }
  }

  // Detect quoted email history starting after at least 1 substantive block
  let quoteStart = -1;
  let substantiveCount = 0;
  for (let i = 0; i < working.length; i++) {
    const block = working[i];
    if (block.type === "details") continue;
    if (substantiveCount >= 1 && isQuotedEnvelopeBlock(block.text)) {
      quoteStart = i > 0 && working[i - 1].type === "hr" ? i - 1 : i;
      break;
    }
    if (block.type !== "hr" && block.text) substantiveCount++;
  }
  if (quoteStart > 0) {
    const head = working.slice(0, quoteStart);
    const tail = working.slice(quoteStart);
    if (head.some((block) => block.type !== "hr" && block.text)) {
      working = [
        ...head,
        {
          type: "details",
          summary: "Show quoted history",
          blocks: tail,
        },
      ];
    }
  }

  return working;
}

function appendListItem(target, stack, block) {
  const depth = Math.max(0, Math.min(5, Number(block.depth) || 0));
  const ordered = Boolean(block.ordered);
  while (stack.length > depth + 1) stack.pop();
  if (stack.length === depth + 1 && stack[depth].ordered !== ordered) stack.length = depth;
  while (stack.length < depth + 1) {
    const level = stack.length;
    const isLeaf = level === depth;
    const list = document.createElement(isLeaf && ordered ? "ol" : "ul");
    const parent = level === 0 ? target : (stack[level - 1].lastItem ?? stack[level - 1].list);
    parent.append(list);
    stack.push({ list, ordered: isLeaf && ordered, lastItem: null });
  }
  const li = document.createElement("li");
  renderRuns(li, block);
  stack[depth].list.append(li);
  stack[depth].lastItem = li;
}

function renderBlocks(target, blocks, options = {}) {
  const rawList = Array.isArray(blocks) ? blocks : [];
  const fallbackText = options.fallbackText ?? "";
  const sourceList = rawList.length
    ? rawList
    : fallbackText
      ? [{ type: "p", text: String(fallbackText), runs: [{ text: String(fallbackText) }] }]
      : [];
  const processed = options.disableFold ? sourceList : foldReaderBlocks(sourceList, options);
  let listStack = [];
  for (const block of processed) {
    if (block.type !== "li") listStack = [];
    if (block.type === "hr") {
      target.append(document.createElement("hr"));
      continue;
    }
    if (block.type === "details") {
      const details = el("details", "quoted-block");
      const summary = el("summary", "", block.summary || "Show more");
      const body = el("div", "quoted-body");
      renderBlocks(body, block.blocks, { ...options, disableFold: true });
      details.append(summary, body);
      target.append(details);
      continue;
    }
    if (block.type === "li") {
      appendListItem(target, listStack, block);
      continue;
    }
    if (block.type === "code") {
      target.append(el("pre", "", block.text ?? ""));
      continue;
    }
    if (block.type === "table") {
      target.append(renderTable(block));
      continue;
    }
    const tag = block.type === "h" ? "h3" : block.type === "quote" ? "blockquote" : "p";
    const node = document.createElement(tag);
    renderRuns(node, block);
    target.append(node);
  }
}

const RICH_TAGS = new Set([
  "div", "p", "span", "table", "thead", "tbody", "tfoot", "tr", "th", "td", "caption", "colgroup", "col",
  "ul", "ol", "li", "dl", "dt", "dd", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "pre", "code", "hr", "br",
  "strong", "b", "em", "i", "u", "s", "sub", "sup", "small", "a", "details", "summary", "img",
]);
const RICH_DROP_TAGS = new Set([
  "script", "style", "iframe", "frame", "frameset", "object", "embed", "applet", "form", "svg", "math", "head",
  "title", "xml", "noscript", "template", "textarea", "select", "button", "meta", "link", "base",
]);
const RICH_ATTRS = new Set([
  "colspan", "rowspan", "align", "valign", "width", "cellpadding", "cellspacing", "border", "dir", "role", "title", "start",
]);
const RICH_STYLE_BLOCKED = /url\s*\(|image-set|expression|@import|javascript:|vbscript:|position|z-index|\\|[<>]/i;

function richHref(value) {
  try {
    const url = new URL(String(value ?? "").trim());
    if (!["https:", "mailto:"].includes(url.protocol) || url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
}

// The server already sanitizes; this second pass rebuilds the DOM from an allowlist as defense in depth.
function cleanRichNode(source, target) {
  for (const node of source.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      target.append(document.createTextNode(node.textContent));
      continue;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) continue;
    const tag = node.localName;
    if (RICH_DROP_TAGS.has(tag)) continue;
    if (!RICH_TAGS.has(tag)) {
      cleanRichNode(node, target);
      continue;
    }
    if (tag === "img") {
      const src = node.getAttribute("src") ?? "";
      if (!/^data:image\/(?:png|jpeg|gif|webp);base64,[a-z0-9+/=]+$/i.test(src)) continue;
      const image = document.createElement("img");
      image.src = src;
      image.alt = node.getAttribute("alt") ?? "";
      target.append(image);
      continue;
    }
    const copy = document.createElement(tag);
    for (const attr of node.attributes) {
      if (RICH_ATTRS.has(attr.name)) copy.setAttribute(attr.name, attr.value);
      else if (attr.name === "style" && !RICH_STYLE_BLOCKED.test(attr.value)) copy.setAttribute("style", attr.value);
    }
    if (tag === "a") {
      const href = richHref(node.getAttribute("href"));
      if (!href) {
        cleanRichNode(node, target);
        continue;
      }
      copy.href = href;
      copy.target = "_blank";
      copy.rel = "noopener noreferrer";
    }
    cleanRichNode(node, copy);
    target.append(copy);
  }
}

function renderRichSurface(html, className = "", label = "") {
  const surface = el("div", `rich-email-surface ${className}`.trim());
  surface.tabIndex = 0;
  surface.setAttribute("role", "region");
  surface.setAttribute("aria-label", label || (className ? "Earlier messages in thread" : "Message content"));
  cleanRichNode(new DOMParser().parseFromString(String(html ?? ""), "text/html").body, surface);
  return surface;
}

// Prefers the sanitized HTML document; falls back to structured blocks for plain or synthetic content.
function renderMessageBody(reader, value, { source, emptyText = "" }) {
  const hasBodyHtml = Boolean(String(value.bodyHtml ?? "").trim());
  if (hasBodyHtml || (source === "calendar" && String(value.teamsHtml ?? "").trim())) {
    if (hasBodyHtml) reader.append(renderRichSurface(value.bodyHtml));
    if (String(value.teamsHtml ?? "").trim()) {
      const fold = el("details", "quoted-block teams-dialin-fold");
      fold.append(el("summary", "", "Show meeting dial-in details"), renderRichSurface(value.teamsHtml, "quoted-surface", "Meeting dial-in details"));
      reader.append(fold);
    }
    if (String(value.quotedHtml ?? "").trim()) {
      const history = el("details", "thread-history");
      history.append(el("summary", "", "Earlier messages in thread"), renderRichSurface(value.quotedHtml, "quoted-surface"));
      reader.append(history);
    }
    return;
  }
  const body = el("div", "message-body");
  renderBlocks(body, value.blocks, { source, fallbackText: value.bodyText });
  if (!body.childElementCount && (value.bodyText || emptyText)) body.append(el("p", "", value.bodyText || emptyText));
  reader.append(body);
}

function renderDetailWarning(value, reader) {
  if (!value.warning) return;
  const warning = el("div", "detail-warning");
  warning.setAttribute("role", "status");
  warning.append(icon("alert"), el("span", "", `Cached preview: ${value.warning}`));
  reader.prepend(warning);
}

function renderAttachments(attachments) {
  const container = el("div", "attachments");
  for (const attachment of Array.isArray(attachments) ? attachments : []) {
    if (attachment.isInline) continue;
    const chip = el("span", "attachment");
    chip.title = attachment.name;
    chip.append(icon("app"), el("span", "", attachment.name), el("small", "", formatBytes(attachment.size)));
    container.append(chip);
  }
  return container.childElementCount ? container : null;
}

function renderEmailDetail(value) {
  const reader = el("article", "detail-reader");
  renderDetailWarning(value, reader);
  const grid = el("dl", "address-grid");
  const fromName = personName(value.from, "Unknown sender");
  const fromAddr = String(value.from?.email ?? value.from?.address ?? "").trim();
  const fromLabel = fromAddr && fromAddr.toLowerCase() !== fromName.toLowerCase() ? `${fromName} <${fromAddr}>` : fromName;
  grid.append(el("dt", "", "From"), el("dd", "", fromLabel));
  appendPeopleRow(grid, "To", value.to);
  if ((value.cc ?? []).length) appendPeopleRow(grid, "Cc", value.cc);
  grid.append(el("dt", "", "Sent"), el("dd", "", formatTime(value.receivedAt) || "—"));
  if (value.importance === "high") {
    const dd = el("dd");
    const pill = el("span", "status-pill", "High importance");
    pill.dataset.status = "declined";
    dd.append(pill);
    grid.append(el("dt", "", "Priority"), dd);
  }
  reader.append(grid);
  const attachments = renderAttachments(value.attachments);
  if (attachments) reader.append(attachments);
  renderMessageBody(reader, value, { source: "email", emptyText: "No message body is available." });
  return reader;
}

function sameMessageGroup(prev, msg) {
  if (!prev || !msg) return false;
  if (Boolean(prev.isMe) !== Boolean(msg.isMe)) return false;
  const prevId = String(prev.senderId ?? "").trim().toLowerCase();
  const msgId = String(msg.senderId ?? "").trim().toLowerCase();
  const prevSender = String(prev.sender ?? prev.from ?? "").trim().toLowerCase();
  const msgSender = String(msg.sender ?? msg.from ?? "").trim().toLowerCase();
  const sameSender =
    (prevId && prevId === msgId) ||
    (!prevId && !msgId && prevSender && prevSender === msgSender);
  if (!sameSender) return false;
  const prevTime = Date.parse(prev.createdDateTime);
  const msgTime = Date.parse(msg.createdDateTime);
  if (!Number.isFinite(prevTime) || !Number.isFinite(msgTime)) return false;
  return Math.abs(msgTime - prevTime) <= 5 * 60 * 1000;
}

function renderTeamsRoster(members) {
  const deduped = dedupeClientPeople(members);
  if (!deduped.length) return null;
  const bar = el("div", "teams-roster");
  bar.append(el("span", "roster-label", "Members"));
  for (const [index, member] of deduped.entries()) {
    const labelText = personName(member, "Unknown");
    const chip = el("span", "person-chip", labelText);
    const addr = String(member.email ?? member.address ?? "").trim();
    chip.title = addr && addr.toLowerCase() !== labelText.toLowerCase() ? `${labelText} <${addr}>` : labelText;
    if (index >= 3) {
      chip.hidden = true;
      chip.dataset.overflow = "true";
    }
    bar.append(chip);
  }
  if (deduped.length > 3) {
    const extraCount = deduped.length - 3;
    const toggle = el("button", "chip-overflow-btn", `+${extraCount} others`);
    toggle.type = "button";
    toggle.setAttribute("aria-expanded", "false");
    toggle.onclick = () => {
      const expanded = toggle.getAttribute("aria-expanded") === "true";
      for (const node of bar.querySelectorAll('[data-overflow="true"]')) {
        node.hidden = expanded;
      }
      toggle.setAttribute("aria-expanded", String(!expanded));
      toggle.textContent = expanded ? `+${extraCount} others` : "Show less";
    };
    bar.append(toggle);
  }
  return bar;
}

function renderReplyQuote(reply) {
  const quote = el("blockquote", "teams-reply-quote");
  quote.append(el("strong", "", reply?.sender || "Quoted message"));
  if (reply?.preview) quote.append(el("span", "", reply.preview));
  return quote;
}

function renderTeamsAttachments(attachments) {
  const container = el("div", "attachments chat-attachments");
  for (const attachment of Array.isArray(attachments) ? attachments : []) {
    const href = safeUrl(attachment?.contentUrl);
    const chip = href ? el("a", "attachment") : el("span", "attachment");
    if (href) {
      chip.href = href;
      chip.target = "_blank";
      chip.rel = "noopener noreferrer";
    }
    chip.title = attachment?.name || "Attachment";
    chip.append(icon("app"), el("span", "", attachment?.name || "Attachment"));
    container.append(chip);
  }
  return container.childElementCount ? container : null;
}

const REACTION_GLYPHS = { like: "👍", heart: "❤️", laugh: "😆", surprised: "😮", sad: "😢", angry: "😠" };

function renderReactions(reactions) {
  const container = el("div", "reactions");
  for (const reaction of Array.isArray(reactions) ? reactions : []) {
    const glyph = REACTION_GLYPHS[reaction?.type] ?? reaction?.type ?? "";
    if (!glyph) continue;
    const badge = el("span", "reaction-badge");
    badge.title = String(reaction.type);
    badge.append(el("span", "", glyph), el("span", "n", String(reaction.count ?? 1)));
    container.append(badge);
  }
  return container.childElementCount ? container : null;
}

function renderTeamsDetail(value) {
  const reader = el("article", "detail-reader wide");
  renderDetailWarning(value, reader);
  const roster = renderTeamsRoster(value.members);
  if (roster) reader.append(roster);
  const stream = el("div", "message-stream");
  const messages = Array.isArray(value.messages) ? value.messages : [];
  let currentGroup = null;
  let prevMsg = null;
  for (const message of messages) {
    const isContinuation = sameMessageGroup(prevMsg, message);
    if (!isContinuation || !currentGroup) {
      currentGroup = el("section", `chat-group${message.isMe ? " is-me" : ""}`);
      const meta = el("div", "chat-head message-meta");
      meta.append(el("strong", "", message.sender || message.from || "Unknown sender"));
      if (message.isMe) meta.append(el("span", "you", "You"));
      if (message.createdDateTime) {
        const time = el("time", "", formatTime(message.createdDateTime));
        time.dateTime = message.createdDateTime;
        meta.append(time);
      }
      currentGroup.append(meta);
      stream.append(currentGroup);
    }
    const card = el(
      "article",
      `message chat-message${message.isMe ? " is-me" : ""}${isContinuation ? " is-continuation" : ""}`,
    );
    const bubble = el("div", "bubble teams-bubble");
    if (message.createdDateTime) bubble.title = formatTime(message.createdDateTime);
    for (const reply of Array.isArray(message.replyTo) ? message.replyTo : []) bubble.append(renderReplyQuote(reply));
    renderBlocks(bubble, message.blocks, { source: "teams", fallbackText: message.body });
    const chips = renderTeamsAttachments(message.attachments);
    if (chips) bubble.append(chips);
    const reactions = renderReactions(message.reactions);
    if (reactions) bubble.append(reactions);
    card.append(bubble);
    currentGroup.append(card);
    prevMsg = message;
  }
  if (!stream.childElementCount) stream.append(el("p", "", "No readable messages are available."));
  reader.append(stream);
  return reader;
}

function statusPillForCalendar(value, meeting) {
  const isCancelled = Boolean(value.isCancelled ?? meeting.isCancelled);
  if (isCancelled) {
    const pill = el("span", "status-pill", "Cancelled");
    pill.dataset.status = "cancelled";
    return pill;
  }
  const raw = String(value.responseStatus ?? meeting.responseStatus ?? "Needs response").trim();
  const key = raw.toLowerCase().replace(/[\s_-]+/g, "");
  const label =
    key === "accepted"
      ? "Accepted"
      : key === "tentative" || key === "tentativelyaccepted"
        ? "Tentative"
        : key === "declined"
          ? "Declined"
          : key === "organizer"
            ? "Organizer"
            : "Needs response";
  const slug =
    label === "Accepted"
      ? "accepted"
      : label === "Tentative"
        ? "tentative"
        : label === "Declined"
          ? "declined"
          : label === "Organizer"
            ? "organizer"
            : "needs-response";
  const pill = el("span", "status-pill", label);
  pill.dataset.status = slug;
  return pill;
}

const SCHEDULE_ADJACENT_MS = 15 * 60_000;

// Used only when the server could not attach a schedule; mirrors the server rules against the loaded agenda.
function resolveClientMeetingSchedule(value, meeting) {
  if (meeting.schedule) return meeting.schedule;
  const start = Date.parse(meeting.start?.dateTime ?? meeting.start ?? "");
  if (value.isCancelled || meeting.isCancelled || !Number.isFinite(start) || !agendaLoaded) return null;
  const end = Date.parse(meeting.end?.dateTime ?? meeting.end ?? "") || start;
  const dayStart = startOfDay(new Date(start));
  const dayEnd = addDays(dayStart, 1);
  const onDay = calendarEvents.filter((event) => endMs(event) > dayStart.getTime() && startMs(event) < dayEnd.getTime());
  const timed = onDay.filter((event) => !event.isAllDay);
  const subject = subjectKey(value.item?.title);
  const isInvite = (event) =>
    (value.item?.eventId && event.id === value.item.eventId) ||
    (subjectKey(event.subject) === subject && Math.abs(startMs(event) - start) <= 60_000);
  const blocking = (event) => !isInvite(event) && event.showAs !== "free" && event.responseStatus !== "Declined";
  const conflicts = meeting.isAllDay ? [] : timed.filter((event) => blocking(event) && startMs(event) < end && start < endMs(event));
  const adjacent = timed.filter((event) => {
    if (!blocking(event) || conflicts.includes(event)) return false;
    const before = start - endMs(event);
    const after = startMs(event) - end;
    return (before >= 0 && before <= SCHEDULE_ADJACENT_MS) || (after >= 0 && after <= SCHEDULE_ADJACENT_MS);
  });
  const dayEvents = timed.map((event) => ({
    ...event,
    isInvite: isInvite(event),
    isConflict: conflicts.includes(event),
    isAdjacent: adjacent.includes(event),
  }));
  if (!meeting.isAllDay && !dayEvents.some((event) => event.isInvite)) {
    dayEvents.push({
      id: value.item?.eventId || value.id,
      subject: value.item?.title || "(no subject)",
      start: new Date(start).toISOString(),
      end: new Date(end).toISOString(),
      isAllDay: false,
      showAs: "tentative",
      organizer: meeting.organizer ?? {},
      responseStatus: meeting.responseStatus || "Needs response",
      isInvite: true,
      isConflict: conflicts.length > 0,
      isAdjacent: false,
    });
  }
  dayEvents.sort((a, b) => startMs(a) - startMs(b) || Number(b.isInvite) - Number(a.isInvite));
  const busy = timed.filter(
    (event) => isBusyTimed(event) && event.responseStatus !== "Declined" && (!isInvite(event) || ["Accepted", "Organizer"].includes(event.responseStatus)),
  );
  const status = meeting.isAllDay ? "all-day" : conflicts.length ? "conflict" : adjacent.length ? "adjacent" : "clear";
  return {
    status,
    coverage: "cached",
    dayStart: dayStart.toISOString(),
    dayEnd: dayEnd.toISOString(),
    conflicts,
    adjacent,
    dayEvents,
    allDayEvents: onDay.filter((event) => event.isAllDay),
    bookedMinutes: bookedMinutes(
      busy.map((event) => ({
        ...event,
        start: new Date(Math.max(startMs(event), dayStart.getTime())).toISOString(),
        end: new Date(Math.min(endMs(event), dayEnd.getTime())).toISOString(),
      })),
    ),
    meetingCount: busy.length,
  };
}

const scheduleLoadText = (schedule) =>
  `${plural(schedule.meetingCount, "meeting")} (${hoursText(schedule.bookedMinutes)} booked) that day`;

function conflictBadge(text, title = text) {
  const badge = el("span", "overlap-badge");
  badge.title = title;
  badge.append(icon("alert"), el("span", "", text));
  return badge;
}

function renderScheduleLedgerValue(schedule, meeting) {
  const root = el("span", "schedule-value");
  const pill = (text, status) => {
    const node = el("span", "status-pill", text);
    node.dataset.status = status;
    return node;
  };
  if (schedule.status === "clear") {
    root.append(pill("No conflicts · Free to accept", "accepted"), ` · ${scheduleLoadText(schedule)}`);
  } else if (schedule.status === "adjacent") {
    const names = schedule.adjacent.map((entry) => entry.subject).join(", ");
    root.append(pill("No overlap", "accepted"), ` Back-to-back with ${names} · ${scheduleLoadText(schedule)}`);
  } else if (schedule.status === "conflict") {
    const text = `Conflicts with ${schedule.conflicts
      .map((entry) => `${entry.subject} (${clockText(startMs(entry))}–${clockText(endMs(entry))})`)
      .join(", ")}`;
    root.append(conflictBadge(text));
  } else if (schedule.status === "all-day") {
    root.append(`All-day event · ${plural(schedule.meetingCount, "timed meeting")} (${hoursText(schedule.bookedMinutes)} booked) that day`);
  } else {
    root.append(pill("Schedule unavailable — refresh schedule to check conflicts", "tentative"));
  }
  return root;
}

function renderInviteScheduleCard(value, meeting, schedule) {
  if (!schedule?.dayStart || schedule.status === "cancelled") return null;
  const section = el("section", "invite-schedule");
  section.setAttribute("aria-label", "Calendar schedule for this meeting");
  const dayLabel = new Date(schedule.dayStart).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
  const head = el("div", "invite-schedule-head");
  const titles = el("div", "invite-schedule-title");
  titles.append(el("h3", "", `Schedule for ${dayLabel}`));
  const readout = el("p", "invite-schedule-readout");
  readout.append(`${plural(schedule.meetingCount, "meeting")} · ${hoursText(schedule.bookedMinutes)} booked`);
  if (schedule.status === "conflict") {
    readout.append(" · ", el("span", "invite-conflict-count", plural(schedule.conflicts.length, "conflict")));
  } else if (schedule.status === "clear" || schedule.status === "adjacent") {
    readout.append(" · ", el("span", "invite-clear-count", "No conflicts for this slot"));
  } else if (schedule.status === "unavailable") {
    readout.append(" · ", el("span", "invite-conflict-count", "Schedule unavailable"));
  }
  titles.append(readout);
  const refresh = actionButton("Refresh schedule", "open", {
    className: "ghost",
    disabled: agendaRefreshing,
    busy: agendaRefreshing,
    onClick: async () => {
      await refreshAgenda();
      if (selectedId === value.id) selectItem(itemById(value.id));
    },
  });
  head.append(titles, refresh);
  section.append(head);
  if (schedule.allDayEvents?.length) {
    const allDay = el("p", "invite-allday");
    allDay.append(el("b", "", "All day: "), schedule.allDayEvents.map((entry) => entry.subject).join(" · "));
    section.append(allDay);
  }
  if (schedule.dayEvents?.length) {
    const listEl = el("ol", "agenda-events invite-day-events");
    for (const event of schedule.dayEvents) listEl.append(renderInviteDayEvent(event, schedule));
    section.append(listEl);
  }
  return section;
}

function renderInviteDayEvent(event, schedule) {
  const li = el("li", "agenda-event");
  li.dataset.eventId = event.id;
  if (event.isInvite) li.dataset.invite = "true";
  if (event.isInvite || event.isConflict) li.dataset.conflict = String(Boolean(event.isConflict));
  const main = el("div", "event-main");
  const time = el("div", "event-time");
  time.append(el("b", "", clockText(startMs(event))), el("span", "", clockText(endMs(event))));
  const body = el("div", "event-body");
  body.append(el("div", "event-title", event.subject));
  const meta = el("div", "event-meta");
  if (event.isInvite) {
    meta.append(el("span", "invite-slot-pill", "This invite"));
    if (event.isConflict) {
      meta.append(conflictBadge(`Conflicts with ${schedule.conflicts.map((entry) => entry.subject).join(", ")}`));
    } else {
      const free = el("span", "status-pill", "Slot is free");
      free.dataset.status = "accepted";
      meta.append(free);
    }
  } else if (event.isConflict) {
    meta.append(conflictBadge("Overlaps this invite"));
  }
  if (event.isAdjacent) {
    const adjacent = el("span", "status-pill", "Back-to-back");
    adjacent.dataset.status = "tentative";
    meta.append(adjacent);
  }
  if (event.organizer?.name) meta.append(el("span", "", event.organizer.name));
  const response = event.responseStatus;
  if (response && !(event.isInvite && response === "Needs response")) {
    const pill = el("span", "status-pill", response);
    pill.dataset.status = { Accepted: "accepted", Organizer: "accepted", Tentative: "tentative" }[response] ?? "needs-response";
    meta.append(pill);
  }
  body.append(meta);
  main.append(time, body);
  li.append(main);
  return li;
}

function renderCalendarDetail(value) {
  const meeting = value.meeting ?? {};
  const schedule = resolveClientMeetingSchedule(value, meeting);
  const reader = el("article", "detail-reader");
  renderDetailWarning(value, reader);
  const allDayDate = meeting.isAllDay && meeting.start
    ? new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
        .format(new Date(/(?:Z|[+-]\d\d:?\d\d)$/i.test(String(meeting.start?.dateTime ?? meeting.start)) ? (meeting.start?.dateTime ?? meeting.start) : `${meeting.start?.dateTime ?? meeting.start}Z`))
    : "";
  const when = allDayDate
    ? `All day · ${allDayDate}`
    : meeting.start
    ? `${formatTime(meeting.start?.dateTime ?? meeting.start)}${meeting.end ? ` – ${formatTime(meeting.end?.dateTime ?? meeting.end)}` : ""}`
    : "Not available";
  const joinHref = safeUrl(value.joinUrl ?? meeting.joinUrl);
  const whereNode = el("span");
  whereNode.append(el("span", "", meeting.location || (joinHref ? "Microsoft Teams" : "Not specified")));
  if (joinHref && !Boolean(value.isCancelled ?? meeting.isCancelled)) {
    whereNode.append(document.createTextNode(" · "));
    const join = el("a", "join-link", "Join Teams Meeting");
    join.href = joinHref;
    join.title = joinHref;
    join.target = "_blank";
    join.rel = "noreferrer noopener";
    whereNode.append(join);
  }
  const rows = [
    ["Status", statusPillForCalendar(value, meeting)],
    ["When", when],
  ];
  if (meeting.recurrence) rows.push(["Recurrence", meeting.recurrence]);
  if (schedule && schedule.status !== "cancelled") rows.push(["Schedule", renderScheduleLedgerValue(schedule, meeting)]);
  rows.push(
    ["Where", whereNode],
    ["Organizer", personName(meeting.organizer, value.from ? personName(value.from) : "Not specified")],
  );
  const ledger = definitionList(rows, "meeting-ledger");
  appendPeopleRow(ledger, "Attendees", meeting.attendees ?? [], { showResponse: true });
  reader.append(ledger);
  const card = schedule ? renderInviteScheduleCard(value, meeting, schedule) : null;
  if (card) reader.append(card);
  renderMessageBody(reader, value, { source: "calendar" });
  return reader;
}

function ensureDraft(target) {
  const id = typeof target === "string" ? target : target?.id ?? target?.item?.id ?? "";
  if (!drafts.has(id)) {
    drafts.set(id, { body: "", mode: "reply", to: "", expanded: false, note: "" });
  }
  return drafts.get(id);
}

const draftFor = ensureDraft;

function handleInputEscape(event) {
  if (event.key !== "Escape") return false;
  event.preventDefault();
  event.stopPropagation();
  event.currentTarget?.blur?.();
  if (detail?.source === "email") {
    const draft = ensureDraft(detail);
    if (draft.expanded) {
      draft.expanded = false;
      renderDock(detail);
    }
  }
  return true;
}

function renderDraftTextarea(item, placeholder) {
  const draft = ensureDraft(item);
  const textarea = el("textarea", "composer");
  textarea.id = "replyBody";
  textarea.value = draft.body;
  textarea.placeholder = placeholder;
  textarea.setAttribute("aria-label", placeholder);
  textarea.oninput = () => {
    draft.body = textarea.value;
  };
  textarea.onkeydown = (event) => {
    if (handleInputEscape(event)) return;
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      sendReply(Boolean(event.shiftKey));
    }
  };
  return textarea;
}

function renderTeamsComposer(item) {
  const dock = el("section", "composer-dock");
  dock.append(renderDraftTextarea(item, "Reply to chat…"));
  const actions = el("div", "composer-actions");
  const send = actionButton("Send", "send", {
    className: "primary",
    onClick: () => sendReply(false),
    key: "⌘↵",
  });
  const sendDismiss = actionButton("Send & Dismiss", "dismiss", {
    onClick: () => sendReply(true),
    key: "⇧⌘↵",
  });
  actions.append(send, sendDismiss);
  dock.append(actions);
  return dock;
}

function setEmailMode(mode, expand = true) {
  if (!detail || detail.source !== "email") return;
  const draft = ensureDraft(detail.item);
  draft.mode = mode;
  draft.expanded = expand;
  renderDock(detail);
  if (expand) {
    requestAnimationFrame(() => $("detailDock").querySelector(".composer")?.focus());
  }
}

function resolveReplyAllPreview(value) {
  if (Array.isArray(value?.replyAllRecipients) && value.replyAllRecipients.length) {
    return value.replyAllRecipients;
  }
  const seed = value?.replyTo?.length ? value.replyTo : [value?.from].filter(Boolean);
  return dedupeClientPeople([...seed, ...(value?.to ?? []), ...(value?.cc ?? [])]);
}

function renderEmailComposer(item, value) {
  const draft = ensureDraft(item);
  if (!draft.expanded) {
    const bar = el("section", "composer-bar");
    bar.setAttribute("aria-label", "Email reply actions");
    for (const [mode, label, key] of [
      ["reply", "Reply", "R"],
      ["replyAll", "Reply all", "⇧R"],
      ["forward", "Forward", "F"],
    ]) {
      const button = el("button", "btn", label);
      button.type = "button";
      button.dataset.mode = mode;
      button.append(el("kbd", "", key));
      button.onclick = () => setEmailMode(mode, true);
      bar.append(button);
    }
    if (draft.body.trim().length > 0) {
      bar.append(el("span", "draft-indicator", "Draft saved"));
    }
    return bar;
  }

  const dock = el("section", "composer-dock");
  const modes = el("div", "mode-switch composer-modes");
  modes.setAttribute("role", "group");
  modes.setAttribute("aria-label", "Email reply mode");
  for (const [mode, label, key] of [
    ["reply", "Reply", "R"],
    ["replyAll", "Reply all", "⇧R"],
    ["forward", "Forward", "F"],
  ]) {
    const button = el("button", "btn ghost", label);
    button.type = "button";
    button.dataset.mode = mode;
    button.setAttribute("aria-pressed", String(draft.mode === mode));
    button.append(el("kbd", "", key));
    button.onclick = () => setEmailMode(mode, true);
    modes.append(button);
  }
  const collapse = el("button", "btn ghost collapse-composer", "Collapse");
  collapse.type = "button";
  collapse.append(el("kbd", "", "Esc"));
  collapse.onclick = () => {
    draft.expanded = false;
    renderDock(detail);
  };
  modes.append(collapse);
  dock.append(modes);
  if (draft.mode === "forward") {
    const to = el("input", "recipient-field");
    to.type = "text";
    to.placeholder = "To: recipient@example.com";
    to.value = draft.to;
    to.setAttribute("aria-label", "Forward recipients");
    to.oninput = () => {
      draft.to = to.value;
    };
    to.onkeydown = (event) => {
      handleInputEscape(event);
    };
    dock.append(to);
  } else {
    const recipients = draft.mode === "replyAll"
      ? resolveReplyAllPreview(value)
      : (value.replyTo?.length ? value.replyTo : [value.from].filter(Boolean));
    dock.append(el("div", "recipient-preview", `To: ${peopleText(recipients)}`));
  }
  dock.append(renderDraftTextarea(item, draft.mode === "forward" ? "Forward message…" : "Reply to email…"));
  const actions = el("div", "composer-actions");
  actions.append(
    actionButton("Send", "send", { className: "primary", onClick: () => sendReply(false), key: "⌘↵" }),
    actionButton("Send & Dismiss", "dismiss", { onClick: () => sendReply(true), key: "⇧⌘↵" }),
  );
  dock.append(actions);
  return dock;
}

function renderCalendarDock(item, currentDetail = detail) {
  const isCancelled = Boolean(currentDetail?.isCancelled ?? currentDetail?.meeting?.isCancelled);
  const draft = ensureDraft(item);
  const dock = el("section", "action-dock");
  const noteInput = el("input", "rsvp-note");
  noteInput.type = "text";
  noteInput.maxLength = 500;
  noteInput.placeholder = isCancelled ? "This meeting was canceled" : "Add an optional note to organizer…";
  noteInput.setAttribute("aria-label", "Add an optional note to organizer");
  noteInput.disabled = isCancelled || pending.has(item.id);
  noteInput.value = draft.note ?? "";
  noteInput.oninput = () => {
    draft.note = noteInput.value;
  };
  noteInput.onkeydown = (event) => {
    handleInputEscape(event);
  };
  dock.append(noteInput);
  const actions = el("div", "rsvp-actions");
  for (const [response, label, glyph, className, key] of [
    ["accept", "Accept", "accept", "success", "A"],
    ["tentative", "Tentative", "tentative", "primary", "T"],
    ["decline", "Decline", "decline", "danger", "D"],
  ]) {
    actions.append(actionButton(label, glyph, {
      className,
      disabled: isCancelled || pending.has(item.id),
      busy: pending.get(item.id) === response,
      onClick: () => rsvpItem(item, response),
      key,
    }));
  }
  dock.append(actions);
  return dock;
}

function renderDock(currentDetail = detail) {
  const dock = $("detailDock");
  dock.replaceChildren();
  dock.hidden = false;
  if (!currentDetail) return;
  if (currentDetail.source === "teams") dock.append(renderTeamsComposer(currentDetail.item));
  else if (currentDetail.source === "email") dock.append(renderEmailComposer(currentDetail.item, currentDetail));
  else if (Boolean(currentDetail.isCancelled ?? currentDetail.meeting?.isCancelled) || isCanceledItem(currentDetail.item)) dock.hidden = true;
  else dock.append(renderCalendarDock(currentDetail.item, currentDetail));
}

const renderComposer = renderDock;

function renderDetail(value) {
  const content = $("detailContent");
  if (value.source === "teams") content.replaceChildren(renderTeamsDetail(value));
  else if (value.source === "email") content.replaceChildren(renderEmailDetail(value));
  else content.replaceChildren(renderCalendarDetail(value));
  renderDock(value);
  if (value.source === "teams") {
    requestAnimationFrame(() => {
      detailScroll.scrollTop = detailScroll.scrollHeight;
    });
  } else {
    detailScroll.scrollTop = 0;
  }
  clearTimeout(detailRetryTimer);
  detailRetryTimer = null;
  if (value.cached && value.warning) {
    const warning = String(value.warning);
    const match = warning.match(/retry after (\d+)s/i);
    if (match || /HTTP 429/i.test(warning)) {
      const item = value.item ?? itemById(value.id);
      const delay = Math.min(Math.max(Number(match?.[1] || 15), 5), 65) * 1000;
      if (item) {
        detailRetryTimer = setTimeout(() => {
          detailRetryTimer = null;
          if (selectedId === item.id) selectItem(item);
        }, delay);
      }
    }
  }
}

// ---------------------------------------------------------------- Agenda, briefing, and Context X-Ray

const plural = (count, one, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;
const pad2 = (value) => String(value).padStart(2, "0");
const hoursText = (minutes) => `${Math.floor(minutes / 60)}h ${pad2(minutes % 60)}m`;
const startOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const addDays = (date, count) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + count);
const dayKey = (date) => `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
const startMs = (event) => Date.parse(event.start);
const endMs = (event) => Date.parse(event.end);
const isBusyTimed = (event) => !event.isAllDay && event.showAs !== "free";
const clockText = (ms) => new Date(ms).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
const shortDate = (date) => date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
const subjectKey = (value) =>
  String(value ?? "")
    .replace(/^(?:\s*(?:re|fw|fwd|canceled|cancelled|accepted|declined|tentative)\s*:)+\s*/i, "")
    .trim()
    .toLowerCase();
const domId = (value) => `prep-${Array.from(String(value)).reduce((hash, ch) => (hash * 31 + ch.charCodeAt(0)) >>> 0, 7)}`;

function agendaDays(now = new Date()) {
  const first = startOfDay(now);
  return Array.from({ length: 7 }, (_, index) => addDays(first, index));
}

function eventsOnDay(day) {
  const from = day.getTime();
  const to = addDays(day, 1).getTime();
  return calendarEvents
    .filter((event) =>
      event.isAllDay
        ? startMs(event) < to && endMs(event) > from
        : startMs(event) >= from && startMs(event) < to,
    )
    .sort((a, b) => startMs(a) - startMs(b) || Number(b.isAllDay) - Number(a.isAllDay));
}

function bookedMinutes(events) {
  const spans = events
    .filter(isBusyTimed)
    .map((event) => [startMs(event), endMs(event)])
    .sort((a, b) => a[0] - b[0]);
  let total = 0;
  let cursor = null;
  for (const [start, end] of spans) {
    const from = cursor === null ? start : Math.max(start, cursor);
    if (end > from) total += end - from;
    cursor = cursor === null ? end : Math.max(cursor, end);
  }
  return Math.round(total / 60_000);
}

function overlapCount(events) {
  const busy = events.filter(isBusyTimed);
  let pairs = 0;
  for (let i = 0; i < busy.length; i++) {
    for (let j = i + 1; j < busy.length; j++) {
      if (startMs(busy[i]) < endMs(busy[j]) && startMs(busy[j]) < endMs(busy[i])) pairs++;
    }
  }
  return pairs;
}

function eventForInvite(item) {
  const byId = item.eventId
    ? calendarEvents.find((event) => event.id === item.eventId || event.iCalUId === item.eventId)
    : null;
  if (byId) return byId;
  const key = subjectKey(item.title);
  if (!key) return null;
  const now = Date.now();
  return (
    calendarEvents
      .filter((event) => subjectKey(event.subject) === key && endMs(event) > now)
      .sort((a, b) => startMs(a) - startMs(b))[0] ?? null
  );
}

function overlapText(event) {
  const [first, ...rest] = event.conflictsWith ?? [];
  return first ? `Overlaps ${first}${rest.length ? ` +${rest.length}` : ""}` : "";
}

function overlapBadge(event) {
  const text = overlapText(event);
  if (!text) return null;
  const badge = el("span", "overlap-badge");
  badge.title = `Overlaps ${event.conflictsWith.join(", ")}`;
  badge.append(icon("alert"), el("span", "", text));
  return badge;
}

function syncPane() {
  const open = selectedId !== null;
  $("agendaView").hidden = open;
  $("itemView").hidden = !open;
  $("detailIntel").hidden = !open || !intel;
  workspace.classList.toggle("detail-open", open);
  workspace.classList.toggle("agenda-open", !open && agendaOpenNarrow);
  $("agendaToggle").setAttribute("aria-pressed", String(!open && agendaOpenNarrow));
}

function reconcileVisibleSelection() {
  if (selectedId && !visible().some((item) => item.id === selectedId)) backToQueue();
  else renderList();
}

function setAgendaNarrow(on) {
  agendaOpenNarrow = on;
  syncPane();
  if (on) renderAgenda();
}

function focusBriefing() {
  if (selectedId !== null) backToQueue();
  if (innerWidth < 780) setAgendaNarrow(true);
  requestAnimationFrame(() => {
    const input = $("briefingInput");
    input.focus();
    input.select();
  });
}

function citeNode(citation, compactLabel = true) {
  const url = citation.url ? safeUrl(citation.url) : null;
  let node;
  if (citation.kind === "related" && url) {
    node = el("a", "cite", String(citation.n));
    node.href = url;
    node.target = "_blank";
    node.rel = "noreferrer noopener";
  } else {
    node = el("button", "cite", String(citation.n));
    node.type = "button";
    node.onclick = () => {
      if (citation.kind === "item") {
        const item = itemById(citation.id);
        if (item) selectItem(item);
        else setStatus("That item is no longer in your queue", true);
      } else if (citation.kind === "event") focusEvent(citation.id);
    };
  }
  const label = `Source ${citation.n}: ${citation.label}`;
  node.title = label;
  node.setAttribute("aria-label", label);
  if (!compactLabel) node.textContent = String(citation.n);
  return node;
}

function renderEdition(result) {
  const root = el("article", "edition");
  const head = el("div", "edition-head");
  head.append(
    el("h3", "edition-title", result.title || "Briefing"),
    el("span", "edition-source", result.source === "workiq" ? "WorkIQ" : "Local summary"),
  );
  root.append(head);
  if (result.summary) root.append(el("p", "edition-summary", result.summary));
  const citations = Array.isArray(result.citations) ? result.citations : [];
  for (const section of Array.isArray(result.sections) ? result.sections : []) {
    if (section.heading) root.append(el("h4", "", section.heading));
    const bullets = el("ul");
    for (const bullet of section.bullets ?? []) {
      const li = el("li", "", bullet.text);
      for (const n of bullet.cite ?? []) {
        const citation = citations.find((entry) => entry.n === n);
        if (citation) li.append(citeNode(citation));
      }
      bullets.append(li);
    }
    root.append(bullets);
  }
  if (result.source !== "workiq" && result.fallbackReason) {
    root.append(el("p", "edition-note", `Built from your schedule and queue. WorkIQ ask: ${result.fallbackReason}.`));
  }
  if (citations.length) {
    const sources = el("ul", "edition-sources");
    sources.setAttribute("aria-label", "Sources");
    for (const citation of citations) {
      const chip = el("li");
      const link = el(citation.kind === "related" && safeUrl(citation.url) ? "a" : "button", "source-chip");
      if (link.tagName === "A") {
        link.href = safeUrl(citation.url);
        link.target = "_blank";
        link.rel = "noreferrer noopener";
      } else {
        link.type = "button";
        link.onclick = () => {
          if (citation.kind === "item") {
            const item = itemById(citation.id);
            if (item) selectItem(item);
          } else if (citation.kind === "event") focusEvent(citation.id);
        };
      }
      link.append(el("span", "cite", String(citation.n)), el("span", "", citation.label));
      chip.append(link);
      sources.append(chip);
    }
    root.append(sources);
  }
  return root;
}

function skeleton() {
  const wrap = el("div", "agenda-skeleton");
  wrap.setAttribute("aria-hidden", "true");
  wrap.append(el("i"), el("i"), el("i"));
  return wrap;
}

function renderBriefing() {
  const target = $("briefingResult");
  if (!briefing) return target.replaceChildren();
  if (briefing.status === "loading") {
    target.replaceChildren(skeleton());
  } else if (briefing.status === "error") {
    const row = el("div", "agenda-error");
    row.append(icon("alert"), el("span", "", `Briefing failed: ${briefing.error}`));
    row.append(actionButton("Try again", "open", { onClick: () => runBriefing(briefing.prompt, briefing.chip) }));
    target.replaceChildren(row);
  } else {
    target.replaceChildren(renderEdition(briefing.result));
  }
}

function renderBriefingChips() {
  const hasOverlap = overlapCount(calendarEvents) > 0;
  const chips = [
    ["Brief me on today", "Brief me on today"],
    hasOverlap
      ? ["Conflict advice", "Give me conflict advice for my overlapping meetings"]
      : ["Next meeting prep", "Prep me for my next meeting"],
    ["Open commitments & action items", "What are my open commitments and action items?"],
    ["Unread from leadership", "Summarize my unread messages from leadership"],
  ];
  $("briefingChips").replaceChildren(
    ...chips.map(([label, prompt]) => {
      const chip = el("button", "briefing-chip", label);
      chip.type = "button";
      chip.setAttribute("aria-pressed", String(briefing?.chip === label));
      chip.disabled = briefing?.status === "loading";
      chip.onclick = () => runBriefing(prompt, label);
      return chip;
    }),
  );
}

async function runBriefing(prompt, chip = "") {
  const text = String(prompt ?? "").trim();
  if (!text) return;
  const seq = ++briefingSeq;
  if (chip) {
    briefingConversationId = null;
    $("briefingInput").value = "";
  }
  briefing = { status: "loading", prompt: text, chip };
  renderBriefing();
  renderBriefingChips();
  try {
    const result = await post("/api/briefing", {
      prompt: text,
      ...(!chip && briefingConversationId ? { conversationId: briefingConversationId } : {}),
    });
    if (seq !== briefingSeq) return;
    if (result.conversationId) briefingConversationId = result.conversationId;
    briefing = { status: "done", prompt: text, chip, result };
  } catch (error) {
    if (seq !== briefingSeq) return;
    briefing = { status: "error", prompt: text, chip, error: error.message };
  }
  renderBriefing();
  renderBriefingChips();
}

function renderAgendaHeader(now) {
  const today = startOfDay(now);
  const todays = eventsOnDay(today);
  const meetings = todays.filter(isBusyTimed);
  const overlaps = overlapCount(todays);
  const actionCount = items.filter((item) => item.status === "action").length;
  $("agendaTitle").textContent = today.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
  const part = (count, label, className = "") => {
    const span = el("span", className);
    span.append(el("b", "", count), ` ${label}`);
    return span;
  };
  const nodes = [
    part(String(meetings.length), meetings.length === 1 ? "meeting today" : "meetings today"),
    part(hoursText(bookedMinutes(meetings)), "booked"),
    part(String(overlaps), overlaps === 1 ? "overlap" : "overlaps", overlaps ? "warn" : ""),
    part(String(actionCount), actionCount === 1 ? "action item" : "action items", actionCount ? "act" : ""),
  ];
  const readout = $("agendaReadout");
  readout.replaceChildren();
  nodes.forEach((node, index) => {
    if (index) {
      const sep = el("span", "", " · ");
      sep.setAttribute("aria-hidden", "true");
      readout.append(sep);
    }
    readout.append(node);
  });
  $("agendaSync").textContent = agendaRefreshing
    ? "Syncing schedule…"
    : agendaUpdatedAt
      ? `Schedule synced ${ago(agendaUpdatedAt)}`
      : "";
  const button = $("agendaRefresh");
  button.disabled = agendaRefreshing;
  button.classList.toggle("busy", agendaRefreshing);
  if (agendaRefreshing) button.setAttribute("aria-busy", "true");
  else button.removeAttribute("aria-busy");
}

function renderWeek(now) {
  const days = agendaDays(now);
  const pick = (key) => {
    agendaDay = key;
    renderWeek(new Date());
    renderTimeline(new Date());
  };
  const all = el("button", "week-day week-all");
  all.type = "button";
  all.setAttribute("aria-pressed", String(agendaDay === "all"));
  all.append(
    el("span", "wd", "All 7 days"),
    el("span", "dn", String(calendarEvents.filter(isBusyTimed).length)),
    el("span", "hrs", "meetings"),
  );
  all.onclick = () => pick("all");
  const buttons = days.map((day, index) => {
    const events = eventsOnDay(day);
    const minutes = bookedMinutes(events);
    const overlaps = overlapCount(events);
    const button = el("button", "week-day");
    button.type = "button";
    button.dataset.day = dayKey(day);
    button.setAttribute("aria-pressed", String(agendaDay === dayKey(day)));
    button.title = `${day.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })} · ${hoursText(minutes)} booked${overlaps ? ` · ${plural(overlaps, "overlap")}` : ""}`;
    const dn = el("span", "dn", String(day.getDate()));
    if (overlaps) {
      const dot = el("span", "dot", "•");
      dot.setAttribute("role", "img");
      dot.setAttribute("aria-label", plural(overlaps, "overlap"));
      dn.append(dot);
    }
    const load = el("span", "load");
    const fill = el("i");
    fill.style.width = `${Math.min(100, Math.round((minutes / 480) * 100))}%`;
    load.append(fill);
    button.append(
      el("span", "wd", index === 0 ? "Today" : day.toLocaleDateString(undefined, { weekday: "short" })),
      dn,
      load,
      el("span", "hrs", hoursText(minutes)),
    );
    button.onclick = () => pick(dayKey(day));
    return button;
  });
  $("agendaWeek").replaceChildren(all, ...buttons);
}

function renderNeeds() {
  const invites = items
    .filter((item) => item.source === "calendar" && item.status === "action" && !isCanceledItem(item))
    .slice(0, 4);
  const others = items
    .filter((item) => item.source !== "calendar" && (item.recipientRole === "mention" || item.status === "action"))
    .sort(
      (a, b) =>
        Number(b.recipientRole === "mention") - Number(a.recipientRole === "mention") ||
        String(b.receivedAt ?? "").localeCompare(String(a.receivedAt ?? "")),
    )
    .slice(0, 4);
  const rows = [...invites, ...others];
  const head = el("h3", "agenda-h", "Needs you");
  if (rows.length) head.append(el("span", "n", String(rows.length)));
  if (!rows.length) {
    const empty = el("div", "needs-empty");
    const glyph = icon("check");
    empty.append(glyph, el("span", "", "Nothing needs you right now."));
    $("agendaNeeds").replaceChildren(head, empty);
    return;
  }
  const nodes = rows.map((item) => {
    const source = SOURCES[item.source] ?? SOURCES.email;
    const row = el("div", "needs-row");
    row.dataset.id = item.id;
    row.dataset.source = item.source;
    const glyph = el("span", "glyph");
    glyph.style.setProperty("--src", source.color);
    glyph.style.setProperty("--src-muted", `color-mix(in srgb, ${source.color} 15%, transparent)`);
    glyph.append(icon(item.source));
    const main = el("div", "needs-main");
    main.append(el("span", "needs-title", item.title));
    const meta = el("div", "needs-meta");
    if (ROLES[item.recipientRole]) meta.append(roleBadge(item.recipientRole));
    meta.append(el("span", "", item.sender || source.label));
    if (item.source === "calendar") {
      meta.append(el("span", "flag", "Needs response"));
      const badge = overlapBadge(eventForInvite(item) ?? {});
      if (badge) meta.append(badge);
    } else if (item.status === "action") meta.append(el("span", "flag", "Action"));
    main.append(meta);
    const open = actionButton(item.source === "calendar" ? "Respond" : "Open", item.source === "calendar" ? "accept" : "open", {
      className: item.source === "calendar" ? "primary" : "",
      title: `Open ${item.title}`,
      onClick: () => selectItem(item),
    });
    row.append(glyph, main, open);
    return row;
  });
  $("agendaNeeds").replaceChildren(head, ...nodes);
}

function renderAgendaEvent(event, now) {
  const li = el("li", "agenda-event");
  li.dataset.eventId = event.id;
  const past = !event.isAllDay && endMs(event) <= now;
  const current = !event.isAllDay && startMs(event) <= now && endMs(event) > now;
  if (past) li.dataset.past = "true";
  if (current) li.dataset.now = "true";
  const main = el("div", "event-main");
  const time = el("div", "event-time");
  if (event.isAllDay) time.append(el("b", "", "All day"));
  else time.append(el("b", "", clockText(startMs(event))), el("span", "", clockText(endMs(event))));
  const body = el("div", "event-body");
  body.append(el("div", "event-title", event.subject));
  const meta = el("div", "event-meta");
  if (current) meta.append(el("span", "event-now", "Now"));
  if (event.organizer?.name) meta.append(el("span", "", event.organizer.name));
  const where = event.location || (event.isOnline ? "Microsoft Teams" : "");
  if (where) meta.append(el("span", "", where));
  if (event.attendeeCount > 1) meta.append(el("span", "", plural(event.attendeeCount, "attendee")));
  if (event.responseStatus === "Needs response" || event.responseStatus === "Tentative") {
    const pill = el("span", "status-pill", event.responseStatus);
    pill.dataset.status = event.responseStatus === "Tentative" ? "tentative" : "needs-response";
    meta.append(pill);
  }
  const badge = overlapBadge(event);
  if (badge) meta.append(badge);
  body.append(meta);
  const actions = el("div", "event-actions");
  const joinHref = safeUrl(event.joinUrl);
  if (joinHref && !past) {
    const soon = current || startMs(event) - now <= 15 * 60_000;
    const join = el("a", `btn${soon ? " primary" : ""}`, "Join");
    join.href = joinHref;
    join.target = "_blank";
    join.rel = "noreferrer noopener";
    join.title = `Join ${event.subject} in Teams`;
    join.setAttribute("aria-label", `Join ${event.subject}`);
    actions.append(join);
  }
  const prepId = domId(event.id);
  const expanded = expandedPrep.has(event.id);
  const prep = el("button", "btn ghost", "Prep");
  prep.type = "button";
  prep.setAttribute("aria-expanded", String(expanded));
  prep.setAttribute("aria-controls", prepId);
  prep.title = `Prep for ${event.subject}`;
  prep.onclick = () => togglePrep(event);
  actions.append(prep);
  main.append(time, body, actions);
  li.append(main);
  if (expanded) li.append(renderPrep(event, prepId));
  return li;
}

function renderTimeline(now = new Date()) {
  const root = $("agendaTimeline");
  const stamp = now.getTime();
  const days = agendaDays(now);
  const shown = agendaDay === "all" ? days : days.filter((day) => dayKey(day) === agendaDay);
  const nodes = [];
  if (!calendarEvents.length && !agendaLoaded) {
    nodes.push(agendaError ? agendaErrorRow() : skeleton());
  } else {
    if (agendaError) nodes.push(agendaErrorRow());
    for (const day of shown) {
      const index = days.indexOf(day);
      const events = eventsOnDay(day);
      if (agendaDay === "all" && !events.length && index !== 0) continue;
      const group = el("section", "agenda-day");
      const head = el("h3", "agenda-day-head", index === 0 ? "Today" : index === 1 ? "Tomorrow" : day.toLocaleDateString(undefined, { weekday: "long" }));
      const busy = events.filter(isBusyTimed);
      head.append(el("span", "sub", `${shortDate(day)} · ${plural(busy.length, "meeting")}${busy.length ? ` · ${hoursText(bookedMinutes(busy))}` : ""}`));
      group.append(head);
      if (!events.length) {
        const empty = el("div", "agenda-empty");
        empty.append(icon("check"), el("span", "", "No meetings."));
        group.append(empty);
      } else {
        const listEl = el("ol", "agenda-events");
        let nowPlaced = index !== 0;
        for (const event of events) {
          if (!nowPlaced && !event.isAllDay && startMs(event) > stamp) {
            listEl.append(nowRule(stamp));
            nowPlaced = true;
          }
          listEl.append(renderAgendaEvent(event, stamp));
        }
        if (!nowPlaced) listEl.append(nowRule(stamp));
        group.append(listEl);
      }
      nodes.push(group);
    }
    if (!nodes.length) {
      const empty = el("div", "agenda-empty");
      empty.append(icon("check"), el("span", "", "No meetings in the next 7 days."));
      nodes.push(empty);
    }
  }
  root.replaceChildren(...nodes);
}

function nowRule(stamp) {
  const rule = el("li", "agenda-now", `Now · ${clockText(stamp)}`);
  rule.setAttribute("role", "separator");
  rule.setAttribute("aria-label", `Now, ${clockText(stamp)}`);
  return rule;
}

function agendaErrorRow() {
  const row = el("div", "agenda-error");
  row.append(icon("alert"), el("span", "", `Could not load your schedule: ${agendaError}`));
  row.append(actionButton("Try again", "open", { onClick: () => refreshAgenda() }));
  return row;
}

function renderAgenda() {
  if (selectedId !== null) return;
  const now = new Date();
  renderAgendaHeader(now);
  renderBriefingChips();
  renderWeek(now);
  renderNeeds();
  renderTimeline(now);
}

function applyAgenda(result) {
  if (Array.isArray(result.calendarEvents)) calendarEvents = result.calendarEvents;
  agendaUpdatedAt = result.agendaUpdatedAt ?? agendaUpdatedAt;
  agendaLoaded = Boolean(result.agendaLoaded);
}

async function refreshAgenda({ quiet = false } = {}) {
  if (agendaRefreshing) return;
  agendaRefreshing = true;
  agendaError = null;
  renderAgenda();
  try {
    const result = await post("/api/agenda");
    applyAgenda(result);
    prepData.clear();
    if (!quiet) setStatus(`Schedule refreshed. ${plural(calendarEvents.length, "event")} in the next 7 days`);
  } catch (error) {
    agendaError = error.message;
    if (!quiet) setStatus(`Schedule refresh failed: ${error.message}`, true);
  } finally {
    agendaRefreshing = false;
    renderAgenda();
  }
}

function focusEvent(eventId) {
  const event = calendarEvents.find((entry) => entry.id === eventId);
  if (!event) return;
  if (selectedId !== null) backToQueue();
  if (innerWidth < 780) setAgendaNarrow(true);
  const key = dayKey(new Date(startMs(event)));
  if (agendaDay !== "all" && agendaDay !== key) agendaDay = key;
  expandedPrep.add(event.id);
  loadPrep(event);
  renderAgenda();
  requestAnimationFrame(() => {
    for (const node of $("agendaTimeline").querySelectorAll("li.agenda-event")) {
      if (node.dataset.eventId === eventId) node.scrollIntoView({ block: "nearest" });
    }
  });
}

function renderTimelineKeepFocus() {
  const active = document.activeElement;
  const owner = active instanceof HTMLElement && active.closest?.("#agendaTimeline") ? active.closest("li.agenda-event") : null;
  const eventId = owner?.dataset.eventId;
  const wasPrep = Boolean(active?.matches?.(".event-actions .btn.ghost"));
  renderTimeline();
  if (!eventId || !wasPrep) return;
  for (const node of $("agendaTimeline").querySelectorAll("li.agenda-event")) {
    if (node.dataset.eventId === eventId) node.querySelector(".event-actions .btn.ghost")?.focus({ preventScroll: true });
  }
}

function togglePrep(event) {
  if (expandedPrep.has(event.id)) expandedPrep.delete(event.id);
  else {
    expandedPrep.add(event.id);
    loadPrep(event);
  }
  renderTimelineKeepFocus();
}

async function loadPrep(event) {
  const known = prepData.get(event.id);
  if (known && known.status !== "error") return;
  prepData.set(event.id, { status: "loading" });
  const [intelOutcome, briefOutcome] = await Promise.allSettled([
    post("/api/intel", {
      eventId: event.id,
      subject: event.subject,
      ...(event.organizer?.name ? { organizer: event.organizer.name } : {}),
      ...(event.organizer?.address ? { organizerEmail: event.organizer.address } : {}),
    }),
    post("/api/briefing", { prompt: "Prep me for this meeting", itemId: event.id }),
  ]);
  if (intelOutcome.status === "rejected" && briefOutcome.status === "rejected") {
    prepData.set(event.id, { status: "error", error: briefOutcome.reason?.message ?? "Prep failed" });
  } else {
    prepData.set(event.id, {
      status: "done",
      intel: intelOutcome.status === "fulfilled" ? intelOutcome.value : null,
      brief: briefOutcome.status === "fulfilled" ? briefOutcome.value : null,
    });
  }
  if (selectedId === null && expandedPrep.has(event.id)) renderTimelineKeepFocus();
}

function renderPrep(event, id) {
  const root = el("div", "agenda-prep");
  root.id = id;
  const state = prepData.get(event.id);
  if (!state || state.status === "loading") {
    root.append(skeleton());
    return root;
  }
  if (state.status === "error") {
    const row = el("div", "agenda-error");
    row.append(icon("alert"), el("span", "", `Prep failed: ${state.error}`));
    row.append(actionButton("Try again", "open", {
      onClick: () => {
        prepData.delete(event.id);
        loadPrep(event);
        renderTimeline();
      },
    }));
    root.append(row);
    return root;
  }
  if (state.intel) root.append(renderIntelBody(state.intel, { inline: true }));
  if (state.brief) root.append(renderEdition(state.brief));
  return root;
}

function intelWhen(value) {
  return value ? compact(value) : "";
}

function renderIntelBody(data, { inline = false } = {}) {
  const wrap = el("div", "intel-drawer");
  if (inline) {
    const row = el("div", "intel-row");
    row.append(intelPerson(data), intelCounts(data));
    wrap.append(row);
  }
  const cross = Array.isArray(data.crossChannelItems) ? data.crossChannelItems : [];
  const related = Array.isArray(data.related) ? data.related : [];
  if (cross.length) {
    const group = el("div", "intel-group");
    group.append(el("h4", "", "Elsewhere in your queue"));
    const listEl = el("ul", "intel-list");
    for (const entry of cross) {
      const li = el("li");
      const link = el("button", "intel-link", `${(SOURCES[entry.source] ?? SOURCES.email).label} · ${entry.title}`);
      link.type = "button";
      link.onclick = () => {
        const item = itemById(entry.id);
        if (item) selectItem(item);
      };
      li.append(link);
      if (entry.receivedAt) li.append(el("span", "when", intelWhen(entry.receivedAt)));
      listEl.append(li);
    }
    group.append(listEl);
    wrap.append(group);
  }
  for (const [kind, label] of [["teams", "Teams"], ["email", "Email"], ["file", "Files"]]) {
    const hits = related.filter((hit) => hit.kind === kind);
    if (!hits.length) continue;
    const group = el("div", "intel-group");
    group.append(el("h4", "", label));
    const listEl = el("ul", "intel-list");
    for (const hit of hits) {
      const href = safeUrl(hit.url);
      if (!href) continue;
      const li = el("li");
      const link = el("a", "intel-link", hit.title);
      link.href = href;
      link.target = "_blank";
      link.rel = "noreferrer noopener";
      link.title = hit.snippet || hit.title;
      li.append(link);
      if (hit.when) li.append(el("span", "when", intelWhen(hit.when)));
      listEl.append(li);
    }
    group.append(listEl);
    wrap.append(group);
  }
  if (!cross.length && !related.length) wrap.append(el("p", "intel-status", "No related Teams chats, email, or files found."));
  for (const warning of data.warnings ?? []) wrap.append(el("p", "edition-note", warning));
  return wrap;
}

function intelPerson(data, fallbackName = "") {
  const person = data?.person;
  const root = el("span", "intel-person");
  if (!person) {
    root.append(el("b", "", fallbackName || data?.subject || "Unknown sender"));
    if (!data?.localOnly) root.append("No directory match");
    return root;
  }
  root.append(el("b", "", person.isSelf ? `${person.name} (you)` : person.name));
  const role = [person.jobTitle, person.department].filter(Boolean).join(" · ");
  if (role) root.append(role);
  if (person.isManager) root.append(el("span", "intel-badge", "Your manager"));
  return root;
}

function intelCounts(data) {
  const wrap = el("span", "intel-counts");
  wrap.setAttribute("role", "group");
  wrap.setAttribute("aria-label", "Related content");
  for (const [key, label] of [["teams", "Teams"], ["email", "Email"], ["files", "Files"]]) {
    const chip = el("span", "intel-count", label);
    chip.append(el("b", "", String(data?.counts?.[key] ?? 0)));
    wrap.append(chip);
  }
  return wrap;
}

async function loadIntel(item, { localOnly = false, open = false } = {}) {
  const seq = ++intelSeq;
  intel = { id: item.id, status: "loading", data: intel?.id === item.id ? intel.data : null, open, answer: intel?.id === item.id ? intel.answer : null };
  renderIntel();
  try {
    const data = await post("/api/intel", { id: item.id, localOnly: Boolean(localOnly) });
    if (seq !== intelSeq || selectedId !== item.id) return;
    intel = { ...intel, status: "done", open, data };
  } catch (error) {
    if (seq !== intelSeq || selectedId !== item.id) return;
    intel = { ...intel, status: "error", open, error: error.message };
  }
  renderIntel();
}

const INTEL_PROMPTS = {
  summary: "Summarize this and list the asks",
  related: "Show related context for this",
  draft: "Draft a short reply to this",
};

async function runIntelAnswer(kind) {
  const item = itemById(selectedId);
  if (!item || !intel || intel.answer?.status === "loading") return;
  const seq = intelSeq;
  intel.answer = { status: "loading", kind };
  renderIntel();
  try {
    const result = await post("/api/briefing", { prompt: INTEL_PROMPTS[kind], itemId: item.id });
    if (seq !== intelSeq || selectedId !== item.id || !intel) return;
    intel.answer = { status: "done", kind, result };
    if (kind === "draft") applyDraft(item, result.draft || result.summary);
  } catch (error) {
    if (seq !== intelSeq || selectedId !== item.id || !intel) return;
    intel.answer = { status: "error", kind, error: error.message };
  }
  renderIntel();
}

function applyDraft(item, text) {
  const body = String(text ?? "").trim();
  if (!body) return;
  const draft = ensureDraft(item);
  draft.body = draft.body.trim() ? `${draft.body.trimEnd()}\n\n${body}` : body;
  if (item.source === "email") draft.expanded = true;
  if (detail?.id === item.id) renderDock(detail);
  requestAnimationFrame(() => $("replyBody")?.focus());
  setStatus("Draft added to the reply box. Review it before you send.");
}

function renderIntel() {
  const root = $("detailIntel");
  const item = itemById(selectedId);
  if (!item || !intel || intel.id !== item.id) {
    root.hidden = true;
    root.replaceChildren();
    return;
  }
  root.hidden = false;
  const row = el("div", "intel-row");
  if (intel.status === "loading") {
    row.append(el("span", "intel-status", `Looking up context for ${item.sender || "this item"}…`));
  } else if (intel.status === "error") {
    row.append(el("span", "intel-status", `Context unavailable: ${intel.error}`));
    row.append(actionButton("Retry", "open", { className: "ghost", onClick: () => loadIntel(item) }));
  } else {
    row.append(intelPerson(intel.data, item.sender), intelCounts(intel.data));
    const toggle = el("button", "btn ghost", intel.open ? "Hide X-Ray" : "X-Ray");
    toggle.type = "button";
    toggle.setAttribute("aria-expanded", String(Boolean(intel.open)));
    toggle.title = "Show related Teams chats, email, and files";
    toggle.onclick = () => {
      const nextOpen = !intel.open;
      if (nextOpen && intel.data?.localOnly) {
        loadIntel(item, { localOnly: false, open: true });
        return;
      }
      intel.open = nextOpen;
      renderIntel();
    };
    row.append(toggle);
  }
  const actions = el("span", "intel-actions");
  const busyKind = intel.answer?.status === "loading" ? intel.answer.kind : null;
  const kinds = [["summary", "Summarize & asks"], ["related", "Related context"]];
  if (item.source !== "calendar") kinds.push(["draft", "Draft reply"]);
  for (const [kind, label] of kinds) {
    const button = el("button", "btn", label);
    button.type = "button";
    button.disabled = Boolean(busyKind);
    if (busyKind === kind) button.dataset.busy = "true";
    button.onclick = () => runIntelAnswer(kind);
    actions.append(button);
  }
  row.append(actions);
  const nodes = [row];
  if (intel.open && intel.status === "done") nodes.push(renderIntelBody(intel.data));
  if (intel.answer?.status === "loading") nodes.push(skeleton());
  else if (intel.answer?.status === "error") {
    const failed = el("div", "agenda-error");
    failed.append(icon("alert"), el("span", "", `Could not complete that: ${intel.answer.error}`));
    nodes.push(failed);
  } else if (intel.answer?.status === "done") nodes.push(renderEdition(intel.answer.result));
  root.replaceChildren(...nodes);
}

function backToQueue({ publish = true } = {}) {
  clearTimeout(detailRetryTimer);
  detailRetryTimer = null;
  detailSeq++;
  intelSeq++;
  selectedId = null;
  if (publish) void clearPublishedSelection();
  detail = null;
  intel = null;
  $("detailContent").replaceChildren();
  $("detailDock").replaceChildren();
  $("detailIntel").replaceChildren();
  syncPane();
  renderList();
  renderAgenda();
  if (activeId) requestAnimationFrame(() => rowEl(activeId)?.focus({ preventScroll: true }));
}

async function openItem(item) {
  const source = SOURCES[item.source] ?? SOURCES.email;
  try {
    await post("/api/open", { id: item.id });
    setStatus(`Opened in ${source.where}`);
  } catch (error) {
    setStatus(`Could not open: ${error.message}`, true);
  }
}

async function dismissItem(item) {
  if (!item || pending.has(item.id) || leaving.has(item.id)) return;
  pending.set(item.id, "dismiss");
  renderList();
  renderDetailHeader(item);
  try {
    const result = await post("/api/dismiss", { id: item.id });
    pending.delete(item.id);
    animateOut(item, result.message);
  } catch (error) {
    pending.delete(item.id);
    renderList();
    if (selectedId === item.id) renderDetailHeader(item);
    setStatus(`Done failed: ${error.message}`, true);
  }
}

async function deleteItem(item) {
  if (!item || pending.has(item.id) || leaving.has(item.id)) return;
  pending.set(item.id, "delete");
  renderList();
  renderDetailHeader(item);
  try {
    const result = await post("/api/delete", { id: item.id });
    pending.delete(item.id);
    animateOut(item, result.message);
  } catch (error) {
    pending.delete(item.id);
    renderList();
    if (selectedId === item.id) renderDetailHeader(item);
    setStatus(`Delete failed: ${error.message}`, true);
  }
}

async function rsvpItem(item, response) {
  if (!item || pending.has(item.id) || leaving.has(item.id) || isCanceledItem(item)) return;
  const draft = ensureDraft(item);
  const note = String(draft.note ?? "").trim();
  pending.set(item.id, response);
  renderDock(detail);
  renderList();
  try {
    const result = await post("/api/rsvp", {
      id: item.id,
      response,
      ...(note ? { comment: note } : {}),
    });
    pending.delete(item.id);
    animateOut(item, result.message);
  } catch (error) {
    pending.delete(item.id);
    renderList();
    renderDock(detail);
    setStatus(`Could not ${response === "tentative" ? "mark tentative" : response}: ${error.message}`, true);
  }
}

const runRsvp = rsvpItem;

async function sendReply(dismiss) {
  if (!detail) return;
  const item = detail.item;
  const draft = ensureDraft(item);
  const body = draft.body.trim();
  if (!body) {
    setStatus("Write a reply before sending", true);
    $("detailDock").querySelector(".composer")?.focus();
    return;
  }
  if (pending.has(item.id)) return;
  pending.set(item.id, "reply");
  const buttons = $("detailDock").querySelectorAll("button");
  for (const button of buttons) button.disabled = true;
  try {
    const result = await post("/api/reply", {
      id: item.id,
      body,
      dismiss,
      ...(item.source === "email" ? { mode: draft.mode, to: draft.mode === "forward" ? draft.to : undefined } : {}),
    });
    pending.delete(item.id);
    draft.body = "";
    draft.to = "";
    draft.expanded = false;
    if (result.sentMessage && detail?.id === result.id) {
      detail.messages = [...(detail.messages ?? []), result.sentMessage];
      renderDetail(detail);
    } else if (!dismiss) {
      renderDock(detail);
    }
    setStatus(result.message);
    if (dismiss) animateOut(item, result.message);
  } catch (error) {
    pending.delete(item.id);
    renderDock(detail);
    setStatus(`Reply failed: ${error.message}`, true);
  }
}

function animateOut(item, message) {
  if (leaving.has(item.id)) return;
  const ids = visible().filter((entry) => !leaving.has(entry.id)).map((entry) => entry.id);
  const index = ids.indexOf(item.id);
  const neighbor = ids[index + 1] ?? ids[index - 1] ?? null;
  const row = rowEl(item.id);
  leaving.set(item.id, item);
  items = items.filter((entry) => entry.id !== item.id);
  drafts.delete(item.id);
  setStatus(message);
  updateCount();
  updateFilters();
  if (row) {
    row.classList.add("leaving");
    row.inert = true;
  }
  if (selectedId === item.id) {
    if (neighbor) selectItem(itemById(neighbor));
    else backToQueue();
  }
  if (activeId === item.id) setActive(neighbor);
  setTimeout(() => {
    leaving.delete(item.id);
    renderList();
  }, 260);
}

function setState(state) {
  const serverSelectionKnown = Object.hasOwn(state, "selectedItemId");
  items = state.items ?? [];
  updatedAt = state.updatedAt;
  calendarEvents = Array.isArray(state.calendarEvents) ? state.calendarEvents : calendarEvents;
  agendaUpdatedAt = state.agendaUpdatedAt ?? agendaUpdatedAt;
  agendaLoaded = Boolean(state.agendaLoaded);
  loaded = true;
  updateSync();
  renderList();
  if (serverSelectionKnown && state.selectedItemId !== selectedId) {
    const selected = state.selectedItemId ? itemById(state.selectedItemId) : null;
    if (selected && visible().some((item) => item.id === selected.id)) {
      void selectItem(selected, { publish: false });
    } else {
      backToQueue({ publish: false });
      if (state.selectedItemId) void clearPublishedSelection();
    }
  }
  if (selectedId && (!itemById(selectedId) || !visible().some((item) => item.id === selectedId))) backToQueue();
  else if (selectedId === null) renderAgenda();
  if (!agendaLoaded && !agendaAutoTried) {
    agendaAutoTried = true;
    refreshAgenda({ quiet: true });
  }
}

async function refresh() {
  if (refreshing) return;
  const button = $("refresh");
  refreshing = true;
  button.disabled = true;
  button.classList.add("busy");
  button.setAttribute("aria-busy", "true");
  updateSync();
  try {
    const result = await post("/api/refresh");
    const note = result.errors?.length ? ` (${result.errors.join("; ")})` : "";
    setStatus(`Refreshed. ${result.items.length} unread${note}`, Boolean(note));
  } catch (error) {
    setStatus(`Refresh failed: ${error.message}`, true);
  } finally {
    refreshing = false;
    button.disabled = false;
    button.classList.remove("busy");
    button.removeAttribute("aria-busy");
    updateSync();
  }
}

const refreshQueue = refresh;

$("refresh").onclick = refresh;
$("queueBack").onclick = backToQueue;
$("agendaBack").onclick = backToQueue;
$("agendaQueueBack").onclick = () => setAgendaNarrow(false);
$("agendaToggle").onclick = () => setAgendaNarrow(!agendaOpenNarrow);
$("agendaRefresh").onclick = () => refreshAgenda();
$("briefingForm").onsubmit = (event) => {
  event.preventDefault();
  runBriefing($("briefingInput").value);
};
search.oninput = () => {
  query = search.value;
  reconcileVisibleSelection();
};

const FEED_WIDTH_KEY = "triage-inbox.feedWidth";
const DEFAULT_FEED_WIDTH = 760;
const FEED_WIDTH_MIN = 300;
const FEED_WIDTH_MAX = 1200;
const paneResizer = $("paneResizer");
let desiredFeedWidth = DEFAULT_FEED_WIDTH;
let feedWidth = DEFAULT_FEED_WIDTH;

function feedWidthMax() {
  return Math.max(420, window.innerWidth - 260);
}

function applyFeedWidth() {
  feedWidth = Math.round(Math.min(feedWidthMax(), Math.max(FEED_WIDTH_MIN, desiredFeedWidth)));
  workspace.style.setProperty("--feed-width", `${feedWidth}px`);
  paneResizer.setAttribute("aria-valuenow", String(feedWidth));
  paneResizer.setAttribute("aria-valuemax", String(Math.round(feedWidthMax())));
}

function setFeedWidth(width, persist = true) {
  desiredFeedWidth = Math.round(Math.min(Math.max(FEED_WIDTH_MAX, feedWidthMax()), Math.max(FEED_WIDTH_MIN, width)));
  applyFeedWidth();
  if (!persist) return;
  try {
    localStorage.setItem(FEED_WIDTH_KEY, String(desiredFeedWidth));
  } catch {}
}

function loadFeedWidth() {
  let saved = Number.NaN;
  try {
    saved = Number(localStorage.getItem(FEED_WIDTH_KEY));
  } catch {}
  setFeedWidth(Number.isFinite(saved) && saved > 0 ? saved : DEFAULT_FEED_WIDTH, false);
}

paneResizer.addEventListener("pointerdown", (event) => {
  if (event.button !== 0) return;
  event.preventDefault();
  const startX = event.clientX;
  const startWidth = feedWidth;
  paneResizer.setPointerCapture(event.pointerId);
  paneResizer.classList.add("is-dragging");
  workspace.classList.add("is-resizing");
  const move = (e) => setFeedWidth(startWidth + e.clientX - startX, false);
  const end = (e) => {
    paneResizer.removeEventListener("pointermove", move);
    paneResizer.removeEventListener("pointerup", end);
    paneResizer.removeEventListener("pointercancel", end);
    if (paneResizer.hasPointerCapture(e.pointerId)) paneResizer.releasePointerCapture(e.pointerId);
    paneResizer.classList.remove("is-dragging");
    workspace.classList.remove("is-resizing");
    setFeedWidth(feedWidth);
  };
  paneResizer.addEventListener("pointermove", move);
  paneResizer.addEventListener("pointerup", end);
  paneResizer.addEventListener("pointercancel", end);
});
paneResizer.addEventListener("dblclick", () => setFeedWidth(DEFAULT_FEED_WIDTH));
paneResizer.addEventListener("keydown", (event) => {
  const step = event.shiftKey ? 64 : 24;
  let next;
  if (event.key === "ArrowLeft") next = feedWidth - step;
  else if (event.key === "ArrowRight") next = feedWidth + step;
  else if (event.key === "Home") next = FEED_WIDTH_MIN;
  else if (event.key === "End") next = feedWidthMax();
  else return;
  event.preventDefault();
  event.stopPropagation();
  setFeedWidth(next);
});
window.addEventListener("resize", applyFeedWidth);
loadFeedWidth();

document.addEventListener("keydown", (event) => {
  if (event.defaultPrevented) return;
  const target = event.target;
  const isTextField =
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target?.isContentEditable;
  if (isTextField) {
    if (event.key === "Escape") {
      event.preventDefault();
      if (target === search && search.value) {
        search.value = "";
        query = "";
        renderList();
      } else {
        target.blur?.();
        if (detail?.source === "email") {
          const draft = ensureDraft(detail.item);
          if (draft.expanded) {
            draft.expanded = false;
            renderDock(detail);
          }
        }
      }
    }
    return;
  }
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  const item = activeItem() ?? (selectedId ? itemById(selectedId) : null);
  switch (event.key) {
    case "j":
    case "J":
    case "ArrowDown":
      if (!event.shiftKey) {
        event.preventDefault();
        move(1);
      }
      break;
    case "k":
    case "K":
    case "ArrowUp":
      if (!event.shiftKey) {
        event.preventDefault();
        move(-1);
      }
      break;
    case "Enter":
      if (item && !target.closest?.("button, a, summary")) {
        event.preventDefault();
        toggleItem(item);
      }
      break;
    case "o":
    case "O":
      if (!event.shiftKey && item) openItem(item);
      break;
    case "e":
    case "E":
    case "x":
    case "X":
      if (!event.shiftKey && item) dismissItem(item);
      break;
    case "a":
    case "A":
    case "t":
    case "T":
    case "d":
    case "D":
      if (!event.shiftKey && item && selectedId === item.id && canRespond(item)) {
        const lower = event.key.toLowerCase();
        rsvpItem(item, lower === "a" ? "accept" : lower === "t" ? "tentative" : "decline");
      }
      break;
    case "r":
      if (detail?.source === "email") {
        event.preventDefault();
        setEmailMode("reply", true);
      } else if (detail?.source === "teams") {
        event.preventDefault();
        $("detailDock").querySelector(".composer")?.focus();
      }
      break;
    case "R":
      if (event.shiftKey && detail?.source === "email") {
        event.preventDefault();
        setEmailMode("replyAll", true);
      }
      break;
    case "f":
      if (!event.shiftKey && detail?.source === "email") {
        event.preventDefault();
        setEmailMode("forward", true);
      }
      break;
    case "g":
      if (!event.shiftKey) {
        event.preventDefault();
        refreshQueue();
      }
      break;
    case "/":
      if (!event.shiftKey) {
        event.preventDefault();
        search.focus();
        search.select();
      }
      break;
    case "b":
    case "B":
      if (!event.shiftKey) {
        event.preventDefault();
        focusBriefing();
      }
      break;
    case "Escape":
      if (detail?.source === "email" && ensureDraft(detail.item).expanded) {
        event.preventDefault();
        ensureDraft(detail.item).expanded = false;
        renderDock(detail);
      } else if (selectedId) {
        event.preventDefault();
        backToQueue();
      } else if (agendaOpenNarrow) {
        event.preventDefault();
        setAgendaNarrow(false);
      } else if (query) {
        search.value = "";
        query = "";
        renderList();
      } else if (activeId) {
        rowEl(activeId)?.focus({ preventScroll: true });
      }
      break;
  }
});

window.addEventListener("resize", () => {
  if (innerWidth >= 780 && agendaOpenNarrow) setAgendaNarrow(false);
});

list.addEventListener("focusin", (event) => {
  const row = event.target.closest?.("li.row");
  if (row && row.dataset.id !== activeId) setActive(row.dataset.id);
});

buildFilters();
buildRoles();
updateFilters();
updateCount();
renderList();
syncPane();
renderAgenda();

const events = new EventSource("events");
events.onopen = () => {
  connected = true;
  updateSync();
};
events.onerror = () => {
  connected = false;
  updateSync();
};
events.addEventListener("state", (event) => setState(JSON.parse(event.data)));
events.addEventListener("pending", (event) => {
  const { id } = JSON.parse(event.data);
  if (!pending.has(id)) pending.set(id, "dismiss");
  renderList();
});
events.addEventListener("failed", (event) => {
  pending.delete(JSON.parse(event.data).id);
  renderList();
});
events.addEventListener("dismissed", (event) => {
  const { id, message } = JSON.parse(event.data);
  pending.delete(id);
  const item = itemById(id);
  if (item) animateOut(item, message);
});

setInterval(() => {
  for (const time of list.querySelectorAll("time[datetime]")) time.textContent = compact(time.dateTime);
  updateSync();
  if (selectedId === null && !$("agendaTimeline").contains(document.activeElement)) renderAgenda();
}, 30_000);
