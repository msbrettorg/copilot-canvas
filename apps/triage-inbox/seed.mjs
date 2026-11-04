// Generic examples used only when artifacts/state.json does not exist.
// A live Refresh replaces these items.

export const SEED_ITEMS = [
  {
    source: "email",
    messageId: "seed-email-mention",
    title: "Review the launch plan",
    recipientRole: "mention",
    sender: "Alex Morgan",
    summary: "Review the draft launch plan and confirm the final dates.",
    receivedAt: "2026-01-15T16:30:00Z",
    status: "action",
  },
  {
    source: "email",
    messageId: "seed-email-direct",
    title: "Project status update",
    recipientRole: "to",
    sender: "Casey Lee",
    summary: "The project remains on schedule. No action is required today.",
    receivedAt: "2026-01-15T15:00:00Z",
    status: "fyi",
  },
  {
    source: "email",
    messageId: "seed-email-copy",
    title: "Design review notes",
    recipientRole: "cc",
    sender: "Jordan Taylor",
    summary: "The team shared notes from the weekly design review.",
    receivedAt: "2026-01-15T14:00:00Z",
    status: "fyi",
  },
  {
    source: "email",
    messageId: "seed-email-list",
    title: "Operations announcement",
    recipientRole: "bcc",
    sender: "Operations Team",
    summary: "A new support process is now available.",
    receivedAt: "2026-01-15T13:00:00Z",
    status: "fyi",
  },
  {
    source: "teams",
    chatId: "seed-teams-chat",
    title: "Project team chat",
    recipientRole: "mention",
    sender: "Riley Chen",
    summary: "Can you confirm the owner for the next milestone?",
    receivedAt: "2026-01-15T17:00:00Z",
    status: "action",
  },
  {
    source: "calendar",
    messageId: "seed-calendar-invite",
    eventId: "seed-cal-1",
    title: "Project review",
    recipientRole: "to",
    sender: "Taylor Kim",
    summary: "Please respond to the project review invitation.",
    receivedAt: "2026-01-15T12:00:00Z",
    status: "action",
  },
];

const SEED_JOIN_URL = "https://teams.microsoft.com/l/meetup-join/sample";
const SEED_ORGANIZERS = {
  alex: { name: "Alex Morgan", address: "alex.morgan@contoso.com" },
  taylor: { name: "Taylor Kim", address: "taylor.kim@contoso.com" },
  riley: { name: "Riley Chen", address: "riley.chen@contoso.com" },
  casey: { name: "Casey Lee", address: "casey.lee@contoso.com" },
  jordan: { name: "Jordan Taylor", address: "jordan.taylor@contoso.com" },
};

// Calendar examples relative to `now`, spanning today, tomorrow, and two days out.
// A live schedule refresh replaces them.
export function buildSeedEvents(now = new Date()) {
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const at = (dayOffset, hour, minute = 0) =>
    new Date(dayStart.getFullYear(), dayStart.getMonth(), dayStart.getDate() + dayOffset, hour, minute).toISOString();
  const anchor = Math.min(Math.max(Math.floor(now.getTime() / 1_800_000) * 1_800_000, dayStart.getTime() + 8 * 3_600_000), dayStart.getTime() + 12 * 3_600_000);
  const rel = (minutes) => new Date(anchor + minutes * 60_000).toISOString();
  const attendee = (person, response = "accepted") => ({ ...person, response });
  const event = (id, subject, start, end, organizer, overrides = {}) => ({
    id,
    iCalUId: `${id}-ical`,
    subject,
    start,
    end,
    isAllDay: false,
    showAs: "busy",
    location: overrides.joinUrl ? "Microsoft Teams" : "",
    organizer,
    attendees: [attendee(SEED_ORGANIZERS.alex), attendee(organizer, "organizer")],
    attendeeCount: 2,
    responseStatus: "Accepted",
    isOnline: Boolean(overrides.joinUrl),
    joinUrl: null,
    webLink: null,
    conflictsWith: [],
    ...overrides,
  });

  return [
    event("seed-cal-today-standup", "Contoso platform standup", rel(-150), rel(-120), SEED_ORGANIZERS.casey, {
      joinUrl: SEED_JOIN_URL,
    }),
    event("seed-cal-today-launch", "Launch readiness sync", rel(0), rel(45), SEED_ORGANIZERS.taylor, {
      joinUrl: SEED_JOIN_URL,
      attendees: [
        attendee(SEED_ORGANIZERS.alex),
        attendee(SEED_ORGANIZERS.taylor, "organizer"),
        attendee(SEED_ORGANIZERS.riley),
        attendee(SEED_ORGANIZERS.jordan, "tentative"),
      ],
      attendeeCount: 4,
    }),
    event("seed-cal-today-design", "Design review", rel(120), rel(180), SEED_ORGANIZERS.jordan, {
      location: "Building 4, Room 210",
    }),
    event("seed-cal-today-roadmap", "Roadmap check-in", rel(150), rel(210), SEED_ORGANIZERS.riley, {
      joinUrl: SEED_JOIN_URL,
      responseStatus: "Tentative",
    }),
    event("seed-cal-1", "Project review", rel(300), rel(330), SEED_ORGANIZERS.taylor, {
      joinUrl: SEED_JOIN_URL,
      responseStatus: "Needs response",
      attendees: [attendee(SEED_ORGANIZERS.alex, "none"), attendee(SEED_ORGANIZERS.taylor, "organizer")],
    }),
    event("seed-cal-tomorrow-allday", "Contoso offsite", at(1, 0), at(2, 0), SEED_ORGANIZERS.casey, {
      isAllDay: true,
      showAs: "free",
      location: "Contoso Seattle campus",
    }),
    event("seed-cal-tomorrow-1on1", "Weekly 1:1 with Casey", at(1, 10), at(1, 10, 30), SEED_ORGANIZERS.casey, {
      joinUrl: SEED_JOIN_URL,
      responseStatus: "Organizer",
    }),
    event("seed-cal-tomorrow-vendor", "Vendor planning call", at(1, 14), at(1, 15), SEED_ORGANIZERS.jordan, {
      joinUrl: SEED_JOIN_URL,
    }),
    event("seed-cal-plus2-retro", "Sprint retrospective", at(2, 11), at(2, 12), SEED_ORGANIZERS.riley, {
      joinUrl: SEED_JOIN_URL,
    }),
  ];
}

export const SEED_EVENTS = buildSeedEvents();
