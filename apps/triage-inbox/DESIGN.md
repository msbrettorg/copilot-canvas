---
name: Work Triage Inbox
description: A master-detail workspace for Teams, Outlook, and calendar signals, built on the Copilot host's semantic tokens.
colors:
  surface: "#ffffff"
  surface-dark: "#0d1117"
  ink: "#1f2328"
  ink-dark: "#e6edf3"
  muted: "#59636e"
  muted-dark: "#9198a1"
  hairline: "#d1d9e0"
  hairline-dark: "#30363d"
  focus-blue: "#0969da"
  focus-blue-dark: "#4493f8"
  true-red: "#cf222e"
  true-red-dark: "#f85149"
  true-green: "#1a7f37"
  true-green-dark: "#3fb950"
  true-blue: "#0969da"
  true-blue-dark: "#4493f8"
  true-violet: "#8250df"
  true-violet-dark: "#ab7df8"
  true-yellow: "#9a6700"
  true-yellow-dark: "#d29922"
  true-orange: "#bc4c00"
  true-orange-dark: "#db6d28"
  document-surface: "#ffffff"
  document-ink: "#1c1b18"
  document-ink-muted: "#4a4741"
  document-line: "#d6d3cb"
  document-code: "#f4f2ec"
  document-link: "#0f548c"
typography:
  detail-title:
    fontFamily: "var(--font-sans), -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1.25
  title:
    fontFamily: "var(--font-sans), -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 600
    lineHeight: "1.25rem"
  subject:
    fontFamily: "var(--font-sans), -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 500
    lineHeight: "1.25rem"
  body:
    fontFamily: "var(--font-sans), -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: "1.25rem"
  label:
    fontFamily: "var(--font-sans), -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: "1rem"
  keycap:
    fontFamily: "var(--font-mono), ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "0.6875rem"
    fontWeight: 500
    lineHeight: 1
rounded:
  badge: "4px"
  control: "6px"
  track: "8px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
components:
  button-default:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    height: "28px"
    padding: "0 10px"
  button-primary:
    backgroundColor: "{colors.focus-blue}"
    textColor: "{colors.focus-blue}"
    rounded: "{rounded.control}"
    height: "28px"
    padding: "0 10px"
  button-success:
    backgroundColor: "{colors.true-green}"
    textColor: "{colors.true-green}"
    rounded: "{rounded.control}"
    height: "28px"
    padding: "0 10px"
  button-danger:
    backgroundColor: "{colors.true-red}"
    textColor: "{colors.true-red}"
    rounded: "{rounded.control}"
    height: "28px"
    padding: "0 10px"
  button-row-action:
    backgroundColor: "transparent"
    textColor: "{colors.muted}"
    rounded: "{rounded.control}"
    height: "26px"
    padding: "0 7px"
  segment-selected:
    backgroundColor: "{colors.hairline}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    height: "22px"
    padding: "0 4px 0 6px"
  badge-mention:
    backgroundColor: "{colors.true-yellow}"
    textColor: "{colors.surface}"
    rounded: "{rounded.badge}"
    height: "16px"
    padding: "0 5px"
  badge-to:
    backgroundColor: "transparent"
    textColor: "{colors.true-blue}"
    rounded: "{rounded.badge}"
    height: "16px"
    padding: "0 5px"
  count-pill:
    backgroundColor: "{colors.hairline}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    height: "16px"
    padding: "0 5px"
  glyph-tile:
    backgroundColor: "{colors.true-violet}"
    textColor: "{colors.true-violet}"
    rounded: "{rounded.control}"
    height: "24px"
    padding: "0"
  composer-dock:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    padding: "12px 16px"
  message-bubble:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.track}"
    padding: "9px 12px"
  detail-warning:
    backgroundColor: "{colors.true-yellow}"
    textColor: "{colors.true-yellow}"
    rounded: "{rounded.control}"
    padding: "8px 10px"
---

# Design System: Work Triage Inbox

## Overview

**Creative North Star: "The Dispatch Ledger"**

The surface is a master-detail dispatch ledger. The queue remains fast and hairline-light while the right pane shows one of two things: the combined Calendar & Agenda reading pane (the default, `selectedId === null`) or a selected Teams thread, Outlook message, or calendar invite in a separate reader and action studio. Context stays visible at wide widths, while narrow views preserve a queue/detail navigation path.

Density is high but calm. Each row answers three questions in one glance: who is this from and how am I addressed, what is it about, and what can I do. Motion only confirms state: a row collapses when Microsoft 365 accepts a change, and a ring spins while it waits.

**Key Characteristics:**
- Color is a four-part code. Channel lives in the glyph tile, addressing in the badge and a faint row wash, urgency in the Action flag, and answers on the invite buttons.
- Every hue comes from a Copilot-supplied token. The page never sets a host token itself.
- No colored side borders. Tint, dot, and tile carry meaning.
- One sans family, one fixed type scale, mono only for keycaps and the BCC / DL tag.
- Keyboard first. Every row action, RSVP, reply mode, and send path has a visible key hint.
- The selected pane owns its task: message stream, email reader, or calendar ledger. The queue remains context, not duplication.
- With nothing selected, the right pane is the agenda: briefing bar, 7-day strip, Needs you, and a timeline with a Now rule. Filters, resizes, and live updates never pull the user out of it.

## Colors

**Host token rule.** Copilot injects its theme variables as defaults. This page reads them with `var(--token, fallback)` and never sets `--background-color-*`, `--text-color-*`, `--border-color-*`, `--color-focus-outline`, or `--true-color-*` on `:root`. Local aliases such as `--violet` or `--danger` only point at host tokens. Fallback hexes below (light / dark) apply only outside Copilot. The host exposes violet, not purple, and has no coral, so red carries urgency.

### Primary
- **Focus Blue** (`--color-focus-outline`, fallback #0969da / #4493f8): focus rings, the active-row and selected-row tint (`9%` mix), primary buttons (`Send`, `Tentative`), and hover and press on standard buttons.

### Channel (glyph tile and view-rail count pill)
- **Teams** (`--true-color-violet` and `-muted`): violet glyph on a muted violet tile.
- **Email** (`--true-color-blue` and `-muted`): blue glyph on a muted blue tile.
- **Calendar** (`--true-color-green` and `-muted`): green glyph on a muted green tile.

### Addressing (badge, filter chip, row wash, and warning banner)
- **`@MENTION`** (`--true-color-yellow`, with `--true-color-orange` on the badge outline, `--true-color-yellow-muted` for the row wash and `.detail-warning` cached-preview banner): filled badge and a warm row wash (`60%` of `--yellow-muted`).
- **`TO`** (`--true-color-blue` and `-muted`): tinted badge and a faint cool row wash (`35%` of `--blue-muted`).
- **`CC`** (`--text-color-muted` on `--background-color-muted`): quiet neutral badge, no wash.
- **`BCC / DL`** (`--text-color-muted`, no fill): mono badge, hollow filter dot, no wash.

### Urgency and answers
- **Action / Decline** (`--true-color-red` and `-muted`): the `Action` and `Needs response` flag with a 6px dot, the `Action` count pill, the `Decline` RSVP button, offline sync readout, and error status.
- **Accept** (`--true-color-green` and `-muted`): the `Accept` RSVP button, the empty-state check icon, and the status check icon.

### Neutral
- **Surface** (`--background-color-default`, #ffffff / #0d1117): page, reader, and input ground. Feed header, detail header, feed footer, and the sticky action/composer docks use a flat `4%` ink tint (`--layer: color-mix(in srgb, var(--fg) 4%, var(--bg))`) as a second neutral layer.
- **Ink** (`--text-color-default`, #1f2328 / #e6edf3): subjects, values, selected controls.
- **Muted** (`--text-color-muted`, #59636e / #9198a1): metadata, summaries, quiet actions.
- **Hairline** (`--border-color-default`, #d1d9e0 / #30363d): pane, header, footer, and control borders at full strength, and row dividers at `70%` (`--hairline`).

### Named Rules
**The Host Token Rule.** Consume Copilot tokens at the point of use. Never redefine them.
**The One Hue, One Meaning Rule.** Violet means Teams. Yellow means @MENTION. Red means urgency or decline. Green means Calendar or accept. Blue means Email or TO; the badge shape and text tell them apart.
**The Ink Mix Rule.** Text on a tint is the hue mixed with ink (70 to 80%), never the raw hue, so it holds 4.5:1 in both themes.

## Typography

**Display Font:** none. **Body Font:** host `--font-sans` with system fallback. **Label/Mono Font:** host `--font-mono`, keycaps, `<pre>` code blocks, and `BCC / DL` only.

**Character:** a single well-tuned sans carries every role. Hierarchy comes from weight, not size.

### Hierarchy
- **Title** (`600`, `0.9375rem` / `15px` in feed masthead and empty-state heading; `1.5rem` / `24px` with `1.25` line-height in `.detail-title`, clamped to two lines): `.detail-title` in `.detail-header` is the single authoritative item title; `.detail-reader` never repeats the subject or thread title.
- **Subject** (`400–700`, `0.9375rem` / `15px`, `1.25rem` / `20px`): weight carries priority. `@MENTION` `700`, `Action` `600`, default `500`, `CC` `500`, `BCC / DL` `400` in muted ink. Clamped to two lines.
- **Body** (`400`, `0.8125rem` / `13px`, `1.25rem` / `20px` in rows and controls; `1.5rem` / `24px` in `.message-body`): summaries, inputs, controls, and detail prose (plain-text paragraphs, headings, and lists cap at `72ch`; tables and the rich document surface use the full reader width).
- **Label** (`400–600`, `0.75rem` / `12px`, `1rem` / `16px`): metadata, counts, filter chips, person chips, status pills, attachment chips, footer legend, and badges (`600`). Times and counts use tabular numerals.
- **Keycap** (`500`, `0.6875rem` / `11px`, `1`): `<kbd>` shortcut hints (`18px` high, `4px` radius).

### Named Rules
**The Weight Is Priority Rule.** Do not add size to raise priority. Change weight. Color says what kind of item it is, not how important it is.

## Layout

The workspace is a master-detail surface. At `780px` and wider (`@media (min-width: 780px)`), `.workspace` uses `grid-template-columns: clamp(300px, var(--feed-width, 760px), calc(100% - 260px)) 6px minmax(260px, 1fr)` so the left feed (`760px` by default, `2x` the previous `380px` maximum, resizable from `300px`) and right detail pane (`>= 260px`) sit side by side and scroll independently. The feed header, feed footer, detail header (`min-height: 72px`), and detail action/composer dock stay fixed at the top and bottom of their panes.

Inside the left queue header, both the segmented filter rail (`#filters`, `22px` segments) and the addressing bar (`#roles`, `21px` chips) use `flex-wrap: wrap` with `overflow-x: visible` so all six channel/status filters and all four addressing chips wrap cleanly without horizontal clipping.

The email and calendar reader (`.detail-reader`) centers a `max-width: 980px` column (`padding: 24px 28px 32px`) so HTML tables and receipts keep their native column widths. Plain-text blocks in `.message-body` cap at `72ch`. Teams chat detail uses `.detail-reader.wide` (`max-width: none`) with message groups capped at `min(110ch, 94%)` and `.teams-bubble` at `min(100%, 68ch)`, widening to `100%` when a bubble holds a table. Below `780px` (`@media (max-width: 779px)`), the queue is the default view; selecting an item adds `.workspace.detail-open` to show full-width detail with `← Queue`, and `Escape` returns to the queue and restores row focus.

Spacing uses a `4px` base. Feed rows use a `10px 14px` body padding (`min-height: 82px`). Detail sections use `16–20px` vertical gaps between the channel line, subject, metadata ledger, attachments, and body.

The agenda pane (`#agendaView`, `.agenda-inner`) centers a `max-width: 980px` column (`padding: 20px 28px 32px`, `24px` gaps between bands). Its order is fixed: masthead (`.agenda-title` in `1.5rem` with the muted `Schedule & briefing` label on the same baseline row, then a one-line readout), briefing bar (`.agenda-briefing`), 7-day strip (`.agenda-week-strip`), `Needs you` band (`.agenda-needs-you`), and the timeline (`.agenda-timeline`). `#agendaView` is a size container: the strip shows 8 columns at `640px` and wider and 4 columns below that. Below `780px`, `Schedule` in the queue header opens the agenda full width and `← Queue` or `Esc` returns.

### Named Rules
**The Context Continuity Rule.** At wide widths the feed remains visible beside detail. At narrow widths the detail owns the screen and Queue returns without losing focus or draft text.
**The Agenda Home Rule.** The app opens on the agenda and stays there. Nothing auto-selects an item. Selecting the open row again, `Esc`, or `← Agenda` returns to it. Only an explicit selection opens a reader.

## Elevation & Depth

Flat. Depth comes from tonal layers (`--layer` at `4%` ink on headers, the footer, the composer dock, the RSVP action dock, attachment chips, attendee pills, code blocks, and incoming Teams bubbles) and `1px` hairlines (`--line` and `--hairline`). Selected segments and chips use a `14%` hue fill, and the active or selected row uses a `9%` focus-blue wash (`--current`). No box shadows are used for elevation (`:focus-visible` uses an inset `2px` ring on rows).

## Shapes

Radius `4px` on badges, the `You` tag, skeleton bars, and `<kbd>` keycaps; `6px` on buttons, inputs, the composer textarea, `.detail-warning`, attachment chips, code blocks, and glyph tiles; `8px` on the `#filters` segmented track and Teams message bubbles (`8px 8px 8px 4px` incoming, `8px 8px 4px 8px` outgoing `.is-me`); `999px` on count pills, the `Action` / `Needs response` flag, addressing filter chips, and attendee chips. There are no colored edge bars on rows; meaning sits in the glyph tile, the badge, and the row wash.

## Components

### Buttons
- **Shape:** `6px` radius, `28px` min-height (`padding: 0 10px`) in headers, empty states, and detail docks; `26px` min-height (`padding: 0 7px`) in `.row-actions` (`30px` below `780px`).
- **Feed row actions (`Open`, `Delete`, `Done`):** ghost at rest (`.btn.ghost`, `border-color: transparent`, `color: var(--muted)`). On row hover or `.row[data-selected="true"]`, their borders and ink reveal (`border-color: var(--line)`, `color: var(--fg)`). At `780px` and wider, `.row-actions .btn span` is hidden so feed rows show compact icon-only `Open`, `Delete` (`×`), and `Done` (`✓`) buttons; `Delete` turns danger-colored on hover; below `780px`, the text labels are shown in a second row with `1px solid var(--line)` borders.
- **Detail header actions:** `Open in Teams` or `Open in Outlook` (`O`), `Delete` (`×`), and `Done` (`✓`, `E`) sit in `.detail-actions` in that order, matching the queue row. `Open` and `Done` show `<kbd>` hints. `Delete` turns danger-colored on hover and shares the row's busy and disabled states (`span` labels hide below `780px`).
- **Semantic variants:** `.btn.primary` (`Send`, `Tentative`) uses a `12%` focus-blue fill and `55%` border; `.btn.success` (`Accept`) uses `--green-muted` fill and `50%` green border; `.btn.danger` (`Decline`) uses `--danger-muted` fill and `50%` red border.
- **Busy:** when `data-busy="true"` is set, `.i` hides and a `12px` `.ring` spinner appears while `.row.busy .body` dims to `60%` opacity and buttons disable.

### Detail composer and RSVP action dock
- `.composer-dock`, `.composer-bar`, and `.action-dock` sit at the bottom of the detail pane (`padding: 12px 16px` for expanded docks, `8px 16px` and `min-height: 44px` for `.composer-bar`, `background: var(--layer)`, `border-top: 1px solid var(--line)`).
- **Teams composer:** a `min-height: 74px` `.composer` textarea (`Reply to chat…`) with `Send` (`.btn.primary`, `⌘↵`) and `Send & Dismiss` (`⇧⌘↵`).
- **Collapsible Email composer:** defaults to a compact 1-row `.composer-bar` (`Reply` `R`, `Reply all` `⇧R`, `Forward` `F`, plus a `.draft-indicator` `Draft saved` pill when an unsent draft exists) so reading height is never taxed until triggered. Clicking a mode button or pressing `R` / `⇧R` / `F` expands `.composer-dock`, which includes a `.mode-switch.composer-modes` group with `Collapse` (`Esc`), a `.recipient-preview` line (using `replyAllRecipients` with `from` fallback and self-exclusion for `Reply all`, or `.recipient-field` `30px` input in Forward mode), the `.composer` textarea, and `Send` / `Send & Dismiss`. Pressing `Escape` inside an expanded email composer collapses back to `.composer-bar` while preserving `draft.body`.
- **Calendar RSVP action dock:** hidden entirely for canceled invites (`#detailDock[hidden]`). The `A`, `T`, and `D` shortcuts ignore them, and `/api/rsvp` rejects them with `invite_canceled`. For active invites, `.action-dock` includes a single-line `.rsvp-note` input (`30px` high, `maxlength="500"`, `Add an optional note to organizer…`) above `.rsvp-actions` (`Accept` `.btn.success` `A`, `Tentative` `.btn.primary` `T`, and `Decline` `.btn.danger` `D`).

### Detail reader
- **Single sticky header (`.detail-header`):** displays `.detail-title` (`1.5rem`, `600` weight, 2-line clamp), `.detail-subtitle` (`Channel · Sender`), `#detailStatus` (`.detail-status` live confirmation pill auto-clearing after 4s on success), and `.detail-actions` (`Open in Teams` / `Open in Outlook` `O`, `Delete`, and `Done` `E`). The reader body never duplicates the subject or channel header.
- **Cached-preview warning (`.detail-warning`):** when live detail falls back to cached data, a yellow-tinted status banner (`padding: 8px 10px`, `border-radius: 6px`, `1px solid` `45%` yellow mix, `55%` `--yellow-muted` fill) appears at the top of `.detail-reader` with an alert icon and `Cached preview: ...`.
- **Collapsible people chips (`.person-chip` & `.chip-overflow-btn`):** `To`, `Cc`, `Attendees`, and Teams `Members` deduplicate records case-insensitively (`dedupePeople`) and display up to 3 `.person-chip` pills inline followed by a `.chip-overflow-btn` (`+N more` / `+N others`, flipping to `Show less` with `aria-expanded="true"`).
- **Email reader:** renders `.address-grid` (`From`, collapsible `To` and `Cc`, `Sent`, and optional `High importance` pill), non-inline `.attachment` chips (`26px` high with byte size), and the message as a light document surface, or `.message-body` blocks when no HTML is available.
- **Light document surface (`.rich-email-surface`):** `emailDetail` and `calendarDetail` return `bodyHtml` (the current message, from `uniqueBody` or the part of `body` before Outlook's reply divider) and `quotedHtml` (the earlier thread) alongside `blocks`. The reader draws `bodyHtml` on a white `color-scheme: light` panel (`document-surface` `#ffffff`, `document-ink` `#1c1b18`, `1px` `--hairline` border, `8px` radius, `18px 22px` padding, `line-height: 1.5`, horizontal scroll). Receipts, delivery-failure cards, nested lists, and multi-column layouts keep their native structure and colors in both light and dark host themes. Tables use `border-collapse: collapse` with `6px 10px` cells and `overflow-wrap: normal` so short headers never break mid-word. `quotedHtml` sits behind `<details class="thread-history">` (`Earlier messages in thread`). Links use `document-link` `#0f548c`, underlined, and open in a new tab with `noopener noreferrer`.
- **Inline link runs, contiguous lists, and progressive folding:** `extractEmailBlocks` emits structured `runs` (`{ text, href?, bold?, italic?, code? }`, flags present only when a `<b>`/`<strong>`, `<i>`/`<em>`, or `<code>` tag wraps the run) with hardened `safeLink` validation (`https:` and `mailto:` only, entities decoded, credentials and control characters rejected) and bare URL autolinking. `renderRuns` builds DOM `<a class="inline-link">` and text nodes directly (wrapped in `<strong>`, `<em>`, or `<code>` when flagged) without trailing duplicate link rows, groups consecutive `li` blocks into a single `<ul>`, renders `<hr>` and underscore dividers, and folds Teams dial-in footers (`Show meeting dial-in details`) and quoted email threads (`Show quoted history`) into `<details class="quoted-block">` while never folding block index 0 into an empty body.
- **Teams bubble parts:** each `.teams-bubble` can start with a `.teams-reply-quote` (sender at `600` weight and a three-line preview, `1px` violet left edge on a `--bg` fill) built from `messageReference` attachments. The message blocks follow, with `<emoji alt>` kept as the emoji character, then `.attachment` chips for files and images, then `.reaction-badge` pills with counts. Raw card JSON never reaches a bubble.
- **Teams reader:** `.detail-reader.wide` renders `.teams-roster` (`Members` + first 3 chips + `+N others` toggle) and `.message-stream` of `.chat-group` sections. Consecutive messages from the same `senderId` (or sender name) within 5 minutes share one `.chat-group` header (`.chat-head`), with continuation bubbles (`.message.is-continuation`) separated by `4px` and carrying full block formatting via `renderBlocks`.
- **Data tables (`.table-wrap` & `.data-table`):** `extractEmailBlocks` turns HTML data tables (at least two rows with two or more filled cells, or `<th>` plus `<td>` rows) into `{ type: "table", headers, rows, text, runs }` blocks, and unwraps single-row or single-column layout tables so their headings, paragraphs, and nested data tables render normally. `renderBlocks` draws a `.table-wrap` (`1px` `--line` border, `6px` radius, horizontal scroll) around a full-width `.data-table` (`0.8125rem`, tabular numerals, `7px 10px` cells split by `--hairline` rules, `--layer` header row at `600` weight, faint `--layer` banding on even rows) with no box shadows. Inline `code` in `.message-body`, `.quoted-body`, and `.bubble` takes a `--layer` fill, `1px` `--hairline` border, `4px` radius, and `--mono` at `0.75rem`.
- **Calendar reader:** renders `.meeting-ledger` with a semantic `Status` row (`.status-pill`: `Needs response`, `Accepted`, `Tentative`, `Declined`, `Organizer`, or `Cancelled`), `When` normalized from UTC `dateTimeTimeZone` to local time, `Where` with an inline `Join Teams Meeting` `.join-link` (using `onlineMeeting.joinUrl` or body/SafeLinks fallback), `Organizer`, and collapsible `Attendees` chips with `6px` status dots and humanized tooltips (`Name — Accepted`), followed by `.message-body` with redundant `-----Original Appointment-----` envelope lines stripped. When Exchange has deleted a canceled occurrence, detail falls back to the bare `eventMessage` (start, end, location, organizer, and recipients as attendees), shows `Cancelled`, and uses `This meeting was canceled by the organizer.` when the body is empty, with no cached-preview banner.

### Segmented filter rail
- **Style:** `#filters` is an `8px` radius track (`padding: 3px`, `gap: 2px`, `border: 1px solid var(--line)`, `background: var(--bg)`, `flex-wrap: wrap`). Each `.seg` is `22px` high (`padding: 0 4px 0 6px`, `border-radius: 6px`, `font-size: 0.75rem`) with a `14px` channel icon (on Teams, Email, Calendar) and a `16px` count pill (`.n`, `min-width: 18px`, `padding: 0 5px`, `border-radius: 999px`) tinted by its hue: `Action` red, `Teams` violet, `Email` blue, `Calendar` green, `All` and `FYI` neutral. The selected segment (`aria-pressed="true"`) gets a `14%` hue fill, `600` weight, and a solid hue count pill.

### Glyph tile
- `24px` tile (`28px` in `.channel-line`), `6px` radius. Channel glyph in the channel hue on its muted tint.

### Addressing badges and wrapped addressing bar
- **`@MENTION`:** yellow fill, surface text, `60%` orange outline, subject at `700`, warm row wash.
- **`TO`:** blue tint and `50%` blue outline, `80%` blue-ink text, faint cool row wash.
- **`CC`:** muted text on a muted neutral fill with a hairline outline, subject at `500`.
- **`BCC / DL`:** mono (`var(--mono)`), muted, no fill, no wash, subject at `400` in muted ink.
- **Addressing bar (`#roles`):** wraps with `flex-wrap: wrap` and `gap: 4px`. Each `.chip` is `21px` high (`padding: 0 3px 0 6px`, `border-radius: 999px`) with an `8px` dot (solid for `@MENTION`, `TO`, `CC`; hollow `2px` border for `BCC / DL`), a label, and a `16px` count pill. A selected chip (`aria-pressed="true"`) gets a `14%` hue fill, a `55%` hue border, `600` weight, and a solid count pill. Selecting the active chip again clears the filter.

### Signal row
- 3-column grid (`.body`: `24px minmax(0, 1fr) auto`, `column-gap: 10px`, `min-height: 82px`, `padding: 10px 14px`) inside `.row` with a `70%` hairline bottom divider (`--hairline`). Contains the `24px` glyph tile, `.row-main` (metadata line with addressing badge, sender, `Action` or `Needs response` flag pill with `6px` red dot, and compact relative `<time>`, followed by a 2-line clamped `.subject` and a 3-line clamped `.summary`), and `.row-actions` (`Open`, `Delete`, `Done`, in that order). On removal, `.row.leaving` collapses with `grid-template-rows: 0fr` over `240ms` and `opacity: 0` over `200ms`.

### Status line
- In `.feed-footer` (`min-height: 32px`, `background: var(--layer)`), `#status` replaces `.legend.shortcut-strip` (`.feed-footer.has-status`) for `3.5s` on success and `7s` on error with a check (green) or alert (red) icon and a single-line message. Simultaneously, `#detailStatus` (`.detail-status`) in `.detail-header` mirrors the status for `4s` on success (`7s` on error) so confirmation is immediately visible inside the right reading pane.

### Agenda masthead and week strip
- The masthead pairs a `1.5rem` weekday and date title with the muted `Schedule & briefing` label on the same row (no label above the heading) and a `0.75rem` tabular readout: `N meetings today · Xh Ym booked · M overlaps · K action items`. Overlap count turns yellow ink and action count red ink only when above zero. `Refresh schedule` (`#agendaRefresh`) reads the 7-day window and shows `Syncing schedule…`.
- `.agenda-week-strip` holds `All 7 days` plus seven day buttons (`.week-day`, `aria-pressed`). Each shows weekday, date, a `3px` pill booked-hours bar (full at `8h`), booked hours, and a yellow `•` when that day has an overlap. Selecting a day filters the timeline; `All 7 days` restores it.

### Briefing bar and edition
- `.agenda-briefing` is a `36px` field (`#briefingInput`, `B` key hint) with an `Ask` button and four one-click chips (`.briefing-chip`): `Brief me on today`, `Conflict advice` (or `Next meeting prep` when nothing overlaps), `Open commitments & action items`, and `Unread from leadership`. The pressed chip uses the `--current` wash.
- The answer is one `.edition` panel on `--layer` with a `1px` hairline border and an `8px` radius: title, source (`WorkIQ` or `Local summary`), summary, sectioned bullets, inline numbered citations (`.cite`), and a `Sources` row. It enters once with a `260ms` ease-out rise. Citations to queue items open the item, citations to events open the meeting prep, and external citations are HTTPS links that open in a new tab.

### Needs you band
- Hairline rows (`.needs-row`: glyph tile, title, meta, action button) list pending invites first (`Needs response`, plus `Overlaps …` when the matching calendar event conflicts) and then top `@MENTION` and `Action` items. The invite button is `Respond` (primary); others are `Open`. An empty band reads `Nothing needs you right now.`

### Timeline, Now rule, and Prep drawer
- Day groups (`Today`, `Tomorrow`, weekday) head a hairline-ruled list. Each row is a tabular time column (`88px`), title and meta (organizer, place, attendees, `Needs response` or `Tentative` pill, `Overlaps …` badge), and actions (`Join` link button, primary when current or within 15 minutes, and `Prep`). Past events drop to muted ink and regular weight. The current event uses the `--current` wash and a `Now` tag. A `1px` accent hairline labeled `Now · time` marks the present moment in Today.
- `Prep` (`aria-expanded`, `aria-controls`) opens an inline drawer under the row with the organizer's role, related counts, linked items, and the prep edition. It loads once per event and reuses the cache until the schedule refreshes.

### Context X-Ray strip
- `#detailIntel` sits under `#detailHeader` whenever an item is open. One line carries the sender's name, role and department, a `Your manager` badge when it applies, `Teams`, `Email`, and `Files` count pills, an `X-Ray` toggle (`aria-expanded`) that expands linked queue items and files, and the actions `Summarize & asks`, `Related context`, and `Draft reply` (hidden for invites). Lookup never blocks the reader: it shows `Looking up context…`, then results or a quiet `Context unavailable`. `Draft reply` writes into `#replyBody` and never sends.

### Named Rules
**The Safe Document Rule.** Email and calendar bodies reach the page only as allowlist-sanitized HTML (`sanitizeRichHtml` on the server, then a DOM-rebuilding pass in `renderRichSurface`) or as structured blocks. Scripts, forms, frames, active CSS, remote images, and tracking pixels never render. Links keep only `https`, `http`, and `mailto` targets, with Outlook SafeLinks unwrapped.

## Do's and Don'ts

### Do:
- **Do** inherit host variables first and keep the light and dark fallbacks in sync.
- **Do** keep every action reachable by pointer and by key.
- **Do** show pending, success, and failure for every Microsoft 365 write.
- **Do** keep Done on invites as mark-read only. The meeting stays pending.
- **Do** pair every hue with a label, glyph, or shape so color is never the only cue.
- **Do** preserve unsent drafts per item across selection changes.
- **Do** keep Reply in the local canvas HTTP boundary, never as an agent canvas action.
- **Do** cite every generated claim and label the source (`WorkIQ` or `Local summary`).
- **Do** keep `A`, `T`, and `D` RSVP keys scoped to the open item.

### Don't:
- **Don't** auto-select an item. The agenda is the home state.
- **Don't** send a drafted reply. `Draft reply` only fills the box.
- **Don't** put a label above the agenda title or number the sections.
- **Don't** set any Copilot-injected variable on :root or [data-color-mode].
- **Don't** box rows into cards or stack badges. One addressing badge and at most one flag per row.
- **Don't** use a colored side border or edge bar on a row.
- **Don't** use gradient text, glass, or decorative motion. Surfaces stay flat on host tonal layers.
- **Don't** raise priority with size or new colors. Use weight.
- **Don't** inject unsanitized email HTML or allow stale detail responses to replace the current selection.

## Queue pane and row actions

- The queue pane is 760px wide by default (`2x` the previous 380px maximum). A drag handle (`#paneResizer`) sets the preferred width from 300px up; arrow keys step it, `Home` sets the minimum, `End` sets the maximum, and double-click resets to 760px. The preferred width is saved in `localStorage` and stays separate from the effective width, so a narrow panel clamps the pane and a later resize widens it back toward the preferred width.
- Each queue row shows three icons in this order: Open, Delete (×), Done (✓). Delete shows danger color on hover. The reading-pane header mirrors them in the same order: `Open in …` (`O`), `Delete` (×), and `Done` (✓, `E`).
- Delete moves an Outlook message to Deleted Items (recoverable). For Teams it marks the chat read and hides it; if hiding fails, the item still leaves the queue with the message "Marked read in Teams (could not hide chat)".
