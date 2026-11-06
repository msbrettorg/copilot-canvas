# Product

<!-- impeccable:product-schema 1 -->

> Interview substitution: this session has no answer mechanism (`ask_user` is forbidden). Every fact below comes from the explicit brief, the repository (`extension.mjs`, `lib.mjs`, `web/`), or the stated operating profile of the sample user. Items marked **[inferred]** await confirmation.

## Platform

web

## Users

Alex Morgan, a Principal Engineer. They triage Microsoft Teams chats, Outlook email, and meeting requests many times a day. They need one queue, fast preview, inline reply, and clear completion states. The surface must work in a narrow Copilot side panel and as a wide master-detail workspace. **[inferred]** Single user, single machine.

## Product Purpose

Work Triage Inbox is a Copilot canvas extension. It gives Microsoft Teams, Outlook email, and calendar invites one queue, plus a combined 7-day calendar and agenda beside it. The app opens on the agenda. The feed stays visible while the user reads and answers a selected item, and selecting the same item again (or pressing `Esc`) returns to the agenda. Success: the user reaches inbox zero from the canvas, with no forced switch to Teams or Outlook, and walks into each meeting already briefed.

## Positioning

The feed merges three Microsoft 365 signal types into one queue. Selecting an item opens a live detail reader, a Context X-Ray strip, and the correct action dock. Teams and email replies send through WorkIQ. Calendar requests support `Accept`, `Tentative`, and `Decline`. `Open` remains available for native Teams or Outlook. The agenda pane pairs the schedule with an agentic WorkIQ briefing bar so one question answers "what is my day, where do meetings overlap, and what do I owe people?"

## Operating Context

- Runs inside the GitHub Copilot app as a canvas (`id: triage-inbox`), served from a loopback HTTP server (`127.0.0.1`, random port).
- The host app supplies semantic CSS variables (`--background-color-default`, `--text-color-default`, `--text-color-muted`, `--border-color-default`, `--font-sans`, `--font-mono`, and others). The UI inherits them and falls back cleanly in light and dark mode.
- Data refresh pulls unread human email and Teams chats from Microsoft 365 through WorkIQ. Agents can also push items through canvas actions.

## Capabilities and Constraints

- Endpoints (must stay stable): `GET /api/state`, `GET /events`, `POST /api/open`, `POST /api/dismiss`, `POST /api/delete`, `POST /api/refresh`, `POST /api/detail`, `POST /api/reply`, and `POST /api/rsvp`. Additive endpoints: `POST /api/agenda`, `POST /api/intel`, and `POST /api/briefing`.
- Teams sync: `refresh()` reads `/me/chats` as one page (`$top=50`; WorkIQ rejects `$skiptoken`) and then reads each unread chat's newest messages in batches of 20 with partial-failure tolerance. The newest 20 visible messages persist on the item (`messages`, `members`), so opening a chat makes no WorkIQ call. A failed batch reuses the stored thread or the chat preview. Mail refresh pages the unread Inbox with a bounded `receivedDateTime` filter and never follows `$skip`. A WorkIQ `429` sets a cooldown, and calls fail fast while it lasts.
- Agenda: `POST /api/agenda` reads `/me/calendarView` for a 7-day local-day window (`$top=50`, paged), drops canceled and declined events, deduplicates by `id`, sorts by start (all-day first), and flags overlaps (`conflictsWith`) between non-all-day, non-free events. The result persists in `state.json` (`calendarEvents`, `agendaUpdatedAt`, `agendaLoaded`) and streams on `GET /events`. `refresh()` never reads the calendar, so queue refresh cost is unchanged. Until a live agenda loads, the app shows generic `Contoso` sample events, and the UI requests one background agenda refresh on load.
- Context X-Ray: `POST /api/intel` combines the sender or organizer directory profile (`/me/people`, `/me/manager`), WorkIQ `retrieve` hits (or `/me/insights/used` when `retrieve` is missing or fails), and matching items already in the queue. It validates every link with the HTTPS-only link filter, removes passcodes and meeting IDs from snippets, and caches external lookups in memory for 10 minutes. Selecting an item sends `localOnly: true`, so it makes no WorkIQ call; the `X-Ray` button requests the directory and related items on demand.
- Briefing: `POST /api/briefing` calls WorkIQ `ask` when the tool exists and falls back to a deterministic local briefing (schedule, overlaps, commitments, leadership, meeting prep, item summary, related context, draft reply) with numbered citations. A draft reply only fills the reply box; the user always sends it.
- `retrieve` and `ask` are optional WorkIQ tools. `WORKIQ_REQUIRED_TOOLS` stays `fetch`, `update_entity`, and `do_action`, so a plugin without them never blocks the queue.
- Reply is local HTTP UI behavior. Do not expose it as a canvas action for agents.
- Canvas actions (must stay stable): `get_items`, `set_items`, `dismiss_item`, `open_item`, `refresh`, `rsvp_item`.
- Item fields: `id`, `source` (`teams`, `email`, or `calendar`), `title`, `sender`, `summary`, `status` (`action` or `fyi`), `recipientRole` (`mention`, `to`, `cc`, or `bcc`), `receivedAt`, plus ids, `eventId` (calendar), and `webLink`.
- Addressing: `mention` when the text names the user, `to` when they are a direct recipient or in a 1:1 chat, `cc` when they are on CC or only a group is on CC, `bcc` when they are on neither line (distribution list or BCC). Distribution lists are detected by heuristic.
- Calendar invites: unread incoming meeting requests appear as `source: "calendar"`, `status: "action"`. Cancellations appear as `fyi`. Responses from other people (Accepted, Declined, Tentative) stay hidden.
- `Accept`, `Tentative`, and `Decline` resolve the event, send the response (with an optional note to the organizer when provided from the reading pane), then mark the invite read. Dismiss on an invite only marks the message read.
- Teams detail shows full recent messages (up to 16,000 characters with spliced inline attachments and consecutive same-sender grouping within 5 minutes) and a compact deduplicated member roster (`+N others` toggle after 3 members). Teams reply creates a chat message.
- Email detail renders a single sticky title header, deduplicated collapsible `To`/`Cc` recipient chips (`+N more` after 3), safe structured blocks with inline link runs, bold, italic, and code formatting, HTML data tables rendered as real tables (layout-only tables unwrapped), contiguous `<ul>` lists, `<hr>` dividers, `<details>` folding for Teams dial-in footers and quoted history (never folding block index 0 into an empty body), attachment metadata, and a collapsible reply dock (`Reply`, `Reply all` with sender fallback, and `Forward`).
- Calendar detail surfaces a semantic `Status` pill (`Needs response`, `Accepted`, `Tentative`, `Declined`, `Organizer`, or `Cancelled`), body `joinUrl` fallback for Teams meeting links, humanized attendee response tooltips, and an optional RSVP note input. A canceled occurrence that Exchange has already deleted still resolves from the invite message itself (time, location, and recipients), shows `Cancelled`, and never falls back to the cached-preview banner.
- Draft text and optional RSVP notes stay in the browser by item while the user changes selection.
- Only `https:`, `mailto:`, `msteams:`, and `ms-outlook:` URLs open. The server accepts only loopback hosts.
- Static files only, no build step, no package dependencies. The server sends no content-security headers.
- The queue pane is `760px` wide by default and resizable. Each queue row shows `Open`, `Delete` (`×`), and `Done` (`✓`) in that order, with a 3-line summary preview. Delete moves an Outlook message to Deleted Items; for Teams it marks the chat read and hides it.
- Dismiss, delete, reply, forward, and RSVP are live writes to Microsoft 365. The UI keeps the item and shows an explicit error when the primary operation fails.
- Terms: "Open", "Dismiss" (visible label; the outcome is "Marked read"), "Refresh", "Refresh schedule", "Reply", "Reply all", "Forward", "Send", "Send & Dismiss", "Accept", "Tentative", "Decline", "Action needed", "FYI", "Needs you", "Prep", "Join", "Summarize & asks", "Related context", "Draft reply".

## Brand Commitments

Native to the Copilot host: inherit its tokens and typography. No separate brand identity. **[inferred]**

## Evidence on Hand

- Live data: `artifacts/state.json` (real unread items, 42 at last read).
- Source of truth for behavior: `lib.mjs`.
- No customer quotes, benchmarks, or metrics exist. Do not invent any.

## Product Principles

1. Zero noise: only human signals that need a decision appear.
2. One gesture per outcome: Open and Dismiss are always one click or one key away.
3. Context stays close: the feed stays visible while the detail pane handles the task.
4. Honest state: show pending, success, and failure of every Microsoft 365 call.
5. Keyboard first, pointer complete: every action has a key and a button.
6. Brief before the meeting: the agenda, overlaps, and open asks sit one click from any item, and generated text always shows its sources.

## Accessibility & Inclusion

Meet WCAG 2.2 AA: contrast, visible focus, full keyboard operation, live-region announcements, `prefers-reduced-motion` support. **[inferred]**
