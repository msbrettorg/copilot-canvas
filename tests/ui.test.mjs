import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

import { extractRichEmailContent } from "../apps/triage-inbox/lib.mjs";

class FakeNode {}

class FakeText extends FakeNode {
  constructor(text) {
    super();
    this.nodeType = 3;
    this.data = String(text);
  }

  get textContent() {
    return this.data;
  }
}

function matches(node, selector) {
  const tag = selector.match(/^[a-z][a-z0-9]*/i)?.[0];
  if (tag && node.tagName !== tag.toLowerCase()) return false;
  for (const cls of selector.matchAll(/\.([\w-]+)/g)) {
    if (!node.className.split(/\s+/).includes(cls[1])) return false;
  }
  for (const attr of selector.matchAll(/\[data-([\w-]+)="([^"]*)"\]/g)) {
    if (node.dataset[attr[1]] !== attr[2]) return false;
  }
  return true;
}

class FakeElement extends FakeNode {
  constructor(tagName) {
    super();
    this.nodeType = 1;
    this.tagName = tagName.toLowerCase();
    this.className = "";
    this.dataset = {};
    this.attributes = new Map();
    this.childNodes = [];
    this.hidden = false;
    this.style = { setProperty() {} };
    this.classList = { toggle() {}, add() {}, remove() {}, contains: () => false };
  }

  get children() {
    return this.childNodes.filter((node) => node.nodeType === 1);
  }

  get childElementCount() {
    return this.children.length;
  }

  get textContent() {
    return this.childNodes.map((node) => node.textContent).join("");
  }

  set textContent(value) {
    this.childNodes = value === "" || value == null ? [] : [new FakeText(value)];
  }

  set innerHTML(value) {
    this.childNodes = [];
    this.rawHtml = value;
  }

  append(...nodes) {
    for (const node of nodes) this.childNodes.push(node instanceof FakeNode ? node : new FakeText(node));
  }

  prepend(...nodes) {
    this.childNodes.unshift(...nodes.map((node) => (node instanceof FakeNode ? node : new FakeText(node))));
  }

  replaceChildren(...nodes) {
    this.childNodes = [];
    this.append(...nodes);
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  querySelectorAll(selector) {
    const found = [];
    const walk = (node) => {
      for (const child of node.children) {
        if (matches(child, selector)) found.push(child);
        walk(child);
      }
    };
    walk(this);
    return found;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] ?? null;
  }

  addEventListener() {}
}

async function loadApp() {
  const source = await readFile(new URL("../apps/triage-inbox/web/app.js", import.meta.url), "utf8");
  const initAt = source.search(/buildFilters\(\);\r?\nbuildRoles\(\);/);
  assert.ok(initAt > 0, "app.js init block moved");
  const byId = new Map();
  const document = {
    createElement: (tag) => new FakeElement(tag),
    createElementNS: (_ns, tag) => new FakeElement(tag),
    createTextNode: (text) => new FakeText(text),
    getElementById: (id) => {
      if (!byId.has(id)) byId.set(id, new FakeElement("div"));
      return byId.get(id);
    },
    addEventListener() {},
  };
  const context = vm.createContext({
    document,
    window: { addEventListener() {}, innerWidth: 1200 },
    Node: Object.assign(FakeNode, { TEXT_NODE: 3, ELEMENT_NODE: 1 }),
    DOMParser: class {
      parseFromString() {
        return { body: { childNodes: [] } };
      }
    },
    CSS: { escape: (value) => value },
    innerWidth: 1200,
    clearTimeout,
    setTimeout,
    requestAnimationFrame: (callback) => callback(),
  });
  vm.runInContext(
    `${source.slice(0, initAt)}
globalThis.__app = {
  renderCalendarDetail,
  renderMessageBody,
  intelPerson,
  selectItem,
  root: (id) => $(id),
  state: {
    setItems(next) { items = next; },
    applyServerState(next) { setState(next); },
    setPost(fn) { post = fn; },
    setFilter(next) { filter = next; reconcileVisibleSelection(); },
    selectedId: () => selectedId,
    stubChrome() {
      renderList = () => {};
      syncPane = () => {};
      renderAgenda = () => {};
      renderDetail = () => {};
      renderDetailHeader = () => {};
      showDetailLoading = () => {};
      setStatus = () => {};
    },
    intel: () => intel,
  },
  setAgenda(events, loaded) { calendarEvents = events; agendaLoaded = loaded; },
};`,
    context,
  );
  return context.__app;
}

const localIso = (hour, minute = 0, day = 6) => new Date(2026, 10, day, hour, minute).toISOString();
const scheduleEvent = (id, subject, startIso, endIso, extra = {}) => ({
  id,
  subject,
  start: startIso,
  end: endIso,
  isAllDay: false,
  showAs: "busy",
  responseStatus: "Accepted",
  organizer: { name: "Sample Organizer", address: "" },
  ...extra,
});

function inviteDetail(schedule, extra = {}) {
  return {
    id: "item-1",
    source: "calendar",
    item: { id: "item-1", title: "Capacity weekly sync", eventId: "evt-invite" },
    responseStatus: "Needs response",
    isCancelled: false,
    meeting: {
      start: localIso(10),
      end: localIso(10, 30),
      isAllDay: false,
      location: "Microsoft Teams",
      organizer: { name: "Sample Organizer", address: "" },
      attendees: [],
      responseStatus: "Needs response",
      isCancelled: false,
      recurrence: "Every Friday",
      schedule,
      ...extra,
    },
    blocks: [],
    bodyText: "Agenda inside.",
  };
}

const rowLabels = (reader) => reader.querySelector("dl.meeting-ledger").children.filter((node) => node.tagName === "dt").map((node) => node.textContent);
const ledgerValue = (reader, label) => {
  const grid = reader.querySelector("dl.meeting-ledger").children;
  return grid[grid.findIndex((node) => node.tagName === "dt" && node.textContent === label) + 1];
};

test("renderCalendarDetail shows Recurrence and Schedule rows plus the day schedule card for a clear slot", async () => {
  const app = await loadApp();
  const dayEvents = [
    scheduleEvent("evt-before", "Morning standup", localIso(9), localIso(9, 30)),
    { ...scheduleEvent("evt-invite", "Capacity weekly sync", localIso(10), localIso(10, 30), { showAs: "tentative", responseStatus: "Needs response" }), isInvite: true, isConflict: false, isAdjacent: false },
  ];
  const reader = app.renderCalendarDetail(
    inviteDetail({
      status: "clear",
      coverage: "complete",
      dayStart: localIso(0),
      dayEnd: localIso(0, 0, 7),
      conflicts: [],
      adjacent: [],
      dayEvents,
      allDayEvents: [scheduleEvent("evt-allday", "Team offsite", localIso(0), localIso(0, 0, 7), { isAllDay: true })],
      bookedMinutes: 30,
      meetingCount: 1,
    }),
  );
  const labels = rowLabels(reader);
  assert.deepEqual(labels.slice(0, 4), ["Status", "When", "Recurrence", "Schedule"]);
  assert.equal(ledgerValue(reader, "Recurrence").textContent, "Every Friday");
  const schedule = ledgerValue(reader, "Schedule");
  assert.match(schedule.textContent, /No conflicts · Free to accept/);
  assert.match(schedule.textContent, /1 meeting \(0h 30m booked\) that day/);
  assert.equal(schedule.querySelector(".status-pill").dataset.status, "accepted");

  const card = reader.querySelector("section.invite-schedule");
  assert.equal(card.getAttribute("aria-label"), "Calendar schedule for this meeting");
  assert.match(card.querySelector(".invite-schedule-head").textContent, /Schedule for .*6/);
  assert.match(card.querySelector(".invite-schedule-head").textContent, /1 meeting · 0h 30m booked/);
  assert.match(card.querySelector(".invite-schedule-head").textContent, /No conflicts for this slot/);
  assert.match(card.querySelector(".invite-schedule-head").textContent, /Refresh schedule/);
  assert.match(card.querySelector(".invite-allday").textContent, /All day: Team offsite/);
  const invite = card.querySelector('li.agenda-event[data-invite="true"]');
  assert.equal(invite.dataset.conflict, "false");
  assert.ok(invite.querySelector(".invite-slot-pill"));
  assert.match(invite.textContent, /This invite/);
  assert.match(invite.textContent, /Slot is free/);
  assert.equal(card.querySelectorAll("li.agenda-event").length, 2);
  assert.ok(reader.children.indexOf(card) < reader.children.findIndex((node) => node.className.includes("message-body")));
});

test("renderCalendarDetail flags conflicts and back-to-back meetings in the ledger and the day card", async () => {
  const app = await loadApp();
  const conflict = scheduleEvent("evt-overlap", "Design review", localIso(9, 30), localIso(10, 15), { isConflict: true });
  const adjacent = scheduleEvent("evt-next", "Planning huddle", localIso(10, 30), localIso(11), { isAdjacent: true });
  const invite = {
    ...scheduleEvent("evt-invite", "Capacity weekly sync", localIso(10), localIso(10, 30), { responseStatus: "Needs response" }),
    isInvite: true,
    isConflict: true,
    isAdjacent: false,
  };
  const reader = app.renderCalendarDetail(
    inviteDetail({
      status: "conflict",
      coverage: "complete",
      dayStart: localIso(0),
      dayEnd: localIso(0, 0, 7),
      conflicts: [conflict],
      adjacent: [adjacent],
      dayEvents: [conflict, invite, adjacent],
      allDayEvents: [],
      bookedMinutes: 75,
      meetingCount: 2,
    }),
  );
  assert.match(ledgerValue(reader, "Schedule").textContent, /Conflicts with Design review \(/);
  assert.ok(ledgerValue(reader, "Schedule").querySelector(".overlap-badge"));
  const card = reader.querySelector("section.invite-schedule");
  assert.match(card.querySelector(".invite-schedule-head").textContent, /1 conflict/);
  const rows = card.querySelectorAll("li.agenda-event");
  assert.equal(rows[0].dataset.conflict, "true");
  assert.match(rows[0].textContent, /Overlaps this invite/);
  assert.equal(rows[1].dataset.invite, "true");
  assert.equal(rows[1].dataset.conflict, "true");
  assert.match(rows[1].textContent, /Conflicts with Design review/);
  assert.match(rows[2].textContent, /Back-to-back/);
});

test("renderCalendarDetail explains adjacent, all-day, and unavailable schedules without claiming a free slot", async () => {
  const app = await loadApp();
  const base = { coverage: "complete", dayStart: localIso(0), dayEnd: localIso(0, 0, 7), conflicts: [], dayEvents: [], allDayEvents: [], bookedMinutes: 60, meetingCount: 2 };
  const adjacent = app.renderCalendarDetail(
    inviteDetail({ ...base, status: "adjacent", adjacent: [scheduleEvent("evt-next", "Planning huddle", localIso(10, 30), localIso(11))] }),
  );
  assert.match(ledgerValue(adjacent, "Schedule").textContent, /No overlap\s*Back-to-back with Planning huddle · 2 meetings \(1h 00m booked\) that day/);

  const allDay = app.renderCalendarDetail(inviteDetail({ ...base, status: "all-day", adjacent: [] }, { isAllDay: true }));
  assert.match(ledgerValue(allDay, "Schedule").textContent, /All-day event · 2 timed meetings \(1h 00m booked\) that day/);

  const unavailable = app.renderCalendarDetail(
    inviteDetail({ ...base, status: "unavailable", coverage: "unavailable", adjacent: [], bookedMinutes: 0, meetingCount: 0 }),
  );
  const text = ledgerValue(unavailable, "Schedule").textContent;
  assert.match(text, /Schedule unavailable — refresh schedule to check conflicts/);
  assert.doesNotMatch(text, /Free to accept|No conflicts/);
  assert.doesNotMatch(unavailable.querySelector("section.invite-schedule").textContent, /No conflicts for this slot/);
});

test("renderCalendarDetail falls back to the loaded agenda when the server sends no schedule", async () => {
  const app = await loadApp();
  app.setAgenda([scheduleEvent("evt-overlap", "Design review", localIso(9, 30), localIso(10, 15))], true);
  const reader = app.renderCalendarDetail(inviteDetail(undefined, { recurrence: null }));
  assert.ok(!rowLabels(reader).includes("Recurrence"));
  assert.match(ledgerValue(reader, "Schedule").textContent, /Conflicts with Design review/);
  app.setAgenda([], false);
  const unloaded = app.renderCalendarDetail(inviteDetail(undefined));
  assert.ok(!rowLabels(unloaded).includes("Schedule"));
});

test("Microsoft Teams dial-in footer folds below the organizer's note", () => {
  const html =
    "<div><p>Please review the capacity numbers before we meet.</p></div>" +
    '<div><span style="color:#999">________________________________________________________________________________</span></div>' +
    "<div><span>Microsoft Teams Need help?</span></div>" +
    '<div><a href="https://teams.microsoft.com/l/meetup-join/sample">Join the meeting now</a></div>' +
    "<div>Meeting ID: 123 456 789 0</div><div>Passcode: AbCdEf</div>" +
    "<div>Dial in by phone</div>";
  const { bodyHtml, teamsHtml } = extractRichEmailContent({ body: { contentType: "html", content: html } });
  assert.match(bodyHtml, /Please review the capacity numbers/);
  assert.doesNotMatch(bodyHtml, /Microsoft Teams|Join the meeting now|Meeting ID|_{8,}/);
  assert.match(teamsHtml, /Microsoft Teams Need help\?/);
  assert.match(teamsHtml, /Join the meeting now/);
  assert.match(teamsHtml, /Meeting ID: 123 456 789 0/);
});

test("a body that is only the Teams join block stays visible", () => {
  const html =
    "<div><span>Microsoft Teams meeting</span></div>" +
    '<div><a href="https://teams.microsoft.com/l/meetup-join/sample">Join the meeting now</a></div>' +
    "<div>Meeting ID: 123 456 789 0</div>";
  const { bodyHtml, teamsHtml } = extractRichEmailContent({ body: { contentType: "html", content: html } });
  assert.match(bodyHtml, /Join the meeting now/);
  assert.equal(teamsHtml, undefined);
});

test("a calendar body that is only the Teams join block folds entirely", () => {
  const html =
    '<div><span>________________________________________________________________________________</span></div>' +
    "<div><span>Microsoft Teams meeting</span></div>" +
    '<div><a href="https://teams.microsoft.com/l/meetup-join/sample">Join: https://teams.microsoft.com/meet/123</a></div>' +
    "<div>Meeting ID: 123 456 789 0</div><div>Passcode: AbCdEf</div>" +
    '<div><span>________________________________________________________________________________</span></div>';
  const message = { body: { contentType: "html", content: html } };
  const calendar = extractRichEmailContent(message, { source: "calendar" });
  assert.equal(calendar.bodyHtml, "");
  assert.match(calendar.teamsHtml, /Meeting ID: 123 456 789 0/);
  assert.equal(extractRichEmailContent(message).teamsHtml, undefined);
});

test("renderMessageBody folds a calendar body that is only the dial-in block", async () => {
  const app = await loadApp();
  const reader = new FakeElement("article");
  app.renderMessageBody(reader, { bodyHtml: "", teamsHtml: "<p>Meeting ID: 1</p>", quotedHtml: "" }, { source: "calendar" });
  assert.equal(reader.querySelector("details.teams-dialin-fold").querySelector("summary").textContent, "Show meeting dial-in details");
  assert.equal(reader.querySelector("div.rich-email-surface.quoted-surface") !== null, true);
});

test("structured blocks fold a calendar body that is only the dial-in block", async () => {
  const app = await loadApp();
  const reader = new FakeElement("article");
  const blocks = [
    { type: "hr", text: "---", runs: [] },
    { type: "p", text: "Microsoft Teams meeting", runs: [{ text: "Microsoft Teams meeting" }] },
    { type: "p", text: "Meeting ID: 1\nPasscode: 2", runs: [{ text: "Meeting ID: 1\nPasscode: 2" }] },
  ];
  app.renderMessageBody(reader, { blocks }, { source: "calendar" });
  const fold = reader.querySelector("details.quoted-block");
  assert.equal(fold.querySelector("summary").textContent, "Show meeting dial-in details");
  assert.equal(reader.querySelector("div.message-body").children.length, 1);
});

test("ordinary mail that mentions Teams is not folded", () => {
  const html = "<p>Let's use a Microsoft Teams meeting for this. Ping me when you are ready.</p>";
  const { bodyHtml, teamsHtml } = extractRichEmailContent({ body: { contentType: "html", content: html } });
  assert.match(bodyHtml, /Microsoft Teams meeting/);
  assert.equal(teamsHtml, undefined);
});

test("renderMessageBody keeps the note visible and folds the dial-in details", async () => {
  const app = await loadApp();
  const reader = new FakeElement("article");
  app.renderMessageBody(reader, { bodyHtml: "<p>Note</p>", teamsHtml: "<p>Meeting ID: 1</p>", quotedHtml: "" }, { source: "calendar" });
  const fold = reader.querySelector("details.teams-dialin-fold");
  assert.ok(fold.className.includes("quoted-block"));
  assert.equal(fold.querySelector("summary").textContent, "Show meeting dial-in details");
  assert.ok(fold.querySelector("div.rich-email-surface.quoted-surface"));
  assert.equal(reader.children[0].className.includes("rich-email-surface"), true);
  assert.equal(reader.children[0].className.includes("quoted-surface"), false);
});

test("intelPerson omits the directory-match warning while only local context is loaded", async () => {
  const app = await loadApp();
  const local = app.intelPerson({ person: null, localOnly: true }, "Sample Sender");
  assert.equal(local.textContent, "Sample Sender");
  const resolved = app.intelPerson({ person: null, localOnly: false }, "Sample Sender");
  assert.match(resolved.textContent, /No directory match/);
  const known = app.intelPerson({ person: { name: "Sample Person", jobTitle: "Engineer", department: "Platform", isManager: true } });
  assert.match(known.textContent, /Sample Person/);
  assert.match(known.textContent, /Your manager/);
});

test("selecting an item reads local intel only, and X-Ray fetches the directory on demand", async () => {
  const app = await loadApp();
  const calls = [];
  const item = { id: "item-1", source: "email", sender: "Sample Sender", title: "Plan", status: "action" };
  app.state.setItems([item]);
  app.state.stubChrome();
  app.state.setPost(async (path, body) => {
    calls.push({ path, body });
    if (path === "/api/detail") return { id: "item-1", source: "email", item, blocks: [], attachments: [], to: [], cc: [], from: { name: "Sample Sender" } };
    return { person: null, related: [], localOnly: body.localOnly === true, warnings: [] };
  });
  await app.selectItem(item);
  await new Promise((resolve) => setImmediate(resolve));
  const intelCalls = calls.filter((call) => call.path === "/api/intel");
  assert.equal(intelCalls.length, 1);
  assert.equal(intelCalls[0].body.localOnly, true);
  assert.equal(app.state.intel().data.localOnly, true);

  const toggle = app.root("detailIntel").querySelectorAll("button").find((node) => node.textContent === "X-Ray");
  assert.ok(toggle, "X-Ray button is rendered");
  toggle.onclick();
  await new Promise((resolve) => setImmediate(resolve));
  const after = calls.filter((call) => call.path === "/api/intel");
  assert.equal(after.length, 2);
  assert.equal(after[1].body.localOnly, false);
  assert.deepEqual(
    calls.filter((call) => call.path === "/api/selection").map((call) => call.body.id),
    ["item-1"],
  );
});

test("filtering out the selected item clears the reading-pane selection", async () => {
  const app = await loadApp();
  const calls = [];
  const selected = { id: "item-1", source: "email", sender: "Sample Sender", title: "Plan", status: "action" };
  const hidden = { id: "item-2", source: "teams", sender: "Sample Team", title: "Chat", status: "action" };
  app.state.setItems([selected, hidden]);
  app.state.stubChrome();
  app.state.setPost(async (path, body) => {
    calls.push({ path, body });
    if (path === "/api/detail") {
      return { id: selected.id, source: selected.source, item: selected, blocks: [], attachments: [] };
    }
    return {};
  });

  await app.selectItem(selected);
  app.state.setFilter("teams");
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(app.state.selectedId(), null);
  assert.deepEqual(
    calls.filter((call) => call.path === "/api/selection").map((call) => call.body.id),
    [selected.id, null],
  );
});

test("selection publication failure does not close the reading pane", async () => {
  const app = await loadApp();
  const first = { id: "item-1", source: "email", sender: "Sample Sender", title: "First", status: "action" };
  const second = { id: "item-2", source: "email", sender: "Sample Sender", title: "Second", status: "action" };
  app.state.setItems([first, second]);
  app.state.stubChrome();
  app.state.setPost(async (path, body) => {
    if (path === "/api/selection" && body.id === second.id) throw new Error("selection failed");
    if (path === "/api/detail") {
      const item = body.id === first.id ? first : second;
      return { id: item.id, source: item.source, item, blocks: [], attachments: [] };
    }
    return {};
  });

  await app.selectItem(first);
  await app.selectItem(second);
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(app.state.selectedId(), second.id);
  assert.equal(app.root("itemView").hidden, false);
});

test("an incoming server snapshot restores the reading pane selection", async () => {
  const app = await loadApp();
  const item = { id: "item-1", source: "email", sender: "Sample Sender", title: "Plan", status: "action" };
  app.state.setItems([item]);
  app.state.stubChrome();
  app.state.setPost(async (path) => {
    if (path === "/api/detail") return { id: item.id, source: item.source, item, blocks: [], attachments: [] };
    return {};
  });

  app.state.applyServerState({
    items: [item],
    updatedAt: null,
    calendarEvents: [],
    agendaUpdatedAt: null,
    agendaLoaded: true,
    selectedItemId: item.id,
    selectedItem: item,
  });
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(app.state.selectedId(), item.id);
});
