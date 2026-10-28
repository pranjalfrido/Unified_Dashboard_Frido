# Frido Pulse — phone view (feature/responsive-pulse)

Layout only. The same features, API and behaviour as the laptop: no streaming, copy, 👍/👎 or rename were added. The laptop changes only in the title fix (§2.6).

## Before (main, 375 px)
Screenshots: `docs/responsive/before/pulse/` (local, not committed). This also corrects §7 of PULSE_FEATURES.md.
- The history list is a full-width overlay on top of the chat, and its "hide" button sits under it. A phone user only ever sees the history; answers and the composer are never visible.

## What changed
| File | Change |
|---|---|
| `src/ask/PulseMobile.jsx` (new) | The phone view: header, empty state, thread, composer, history sheet, delete confirms. |
| `src/ask/AskFridoPage.jsx` | On phones (≤768 px or phone landscape, the same rule as the app's green header and bottom bar), renders PulseMobile with the same state and handlers. |
| `src/ask/pulseShared.js` (new) | `displayTitle` (title fix), the 4 suggestions and the date grouping, shared by both views. |
| `src/ask/markdown.js` (new) | The existing answer renderer, moved out of ChatThread unchanged so both views use it. |
| `ChatTopBar.jsx`, `HistoryPanel.jsx` | Laptop title fix only. |
| `src/responsive/MobilePageHeader.jsx` | Two optional props: `lead` (an icon button before the title) and `tag` (a small chip). Other pages don't pass them and are unchanged. |
| `src/App.jsx` | The generic phone header is no longer drawn on Pulse (Pulse draws its own). |
| `src/index.css` | `.pm-*` phone styles, plus `.mph-tag`. |

## Phone layout
- **Header (green):** 🕘 history · title · ✎ new question · ⋯.
  - Title: "Frido Pulse" on a new chat; otherwise the conversation title (1 line) + its category chip.
  - ⋯ has "Delete this chat" (with a confirm) when a chat is open.
  - No refresh, date pill or filter.
- **Empty state:** icon, "Ask anything", sub-line, the 4 suggestions as full-width rows (tap = send), and "Recent" (the last 3 chats, hidden if none).
- **Thread:**
  - The question is a green bubble on the right (max 82%).
  - The answer is full width with "Frido Pulse" + the model badge, rendered by the same markdown renderer.
  - Errors show in a soft red box (same text). Thinking dots are unchanged.
  - Opening a chat or sending scrolls to the latest message; an answer taller than the screen shows its start.
- **Tables:**
  - 12.5 px; number columns right-aligned; text wraps.
  - Wider than the screen: only the table swipes, with the first column fixed and a right-edge fade. No page overflow.
- **Show SQL:** wraps inside its box. **Clarify options:** full-width outline buttons.
- **Composer:**
  - 44 px tall, radius 14, 16 px text; placeholder "Ask a question…".
  - Grows up to 5 lines, then scrolls inside. Send button 34 px, disabled when empty.
  - Enter = new line; the button sends.
  - Keyboard open (visualViewport): the bottom bar hides and the composer sits on the keyboard.
  - Disclaimer: "Pulse can make mistakes. Verify key numbers." (phone only).
- **History sheet:** "Your questions" + ✕, New question, search, Today / Yesterday / Previous 7 days, the current chat highlighted, a trash icon on each row with an inline confirm. Tapping a row opens it and closes the sheet.
- **Bottom bar:** unchanged. Pulse lives in the launcher, and the launcher slot shows the Pulse icon, selected, while on Pulse.

## Verification
Phone: 375 and 360 px, Chromium + WebKit, temporary users (deleted afterwards). **46/46 checks pass in each of the 4 runs.**
- **Flow:** empty → tap suggestion → thinking → answer with table → Show/Hide SQL → follow-up with a 7-column table → error → history (groups, highlight, search, untitled chat shows its question) → open an old chat (title + chip) → clarify buttons → delete via ⋯ (confirm) → delete a history row (confirm) → new question → keyboard open/close.
- **Measured:**
  - Composer 44 px / radius 14 / 16 px; send 34 px, disabled when empty; Enter adds a new line.
  - The composer grows to 5 lines (130 px), then scrolls.
  - The placeholder fits one line at 360; the disclaimer is one line at 12 px; no text under 12 px.
  - No focus box after a tap.
  - The first column stays fixed while swiping; no page-level horizontal overflow at any step.
  - The composer sits right on top of the bottom bar, and on the visible area's bottom edge while the keyboard is open.
- **Laptop 1366, main vs branch** (same saved chats, pixel diff): only the title area differs ("New conversation" → "Which SKUs are out of stock in Bhiwandi?" in the history list and the top bar).
- **Build:** passes. **Lint:** no new problems; the 5 escape warnings in `markdown.js` moved from ChatThread unchanged.

After screenshots (local, not committed): `docs/responsive/after/pulse/<engine>-<width>-NN-*.png`, e.g. `01-empty`, `03-answer-table`, `05-wide-table`, `06-wide-table-swiped`, `08-history`, `09-old-chat`, `10-clarify`, `11-delete-confirm`, `14-keyboard-open`.

## Notes: changed the least, or decided myself
- **Answers in tests are stubbed.** The connector isn't reachable locally (no `/api/pulse` route in `server.js`, no `CONNECTOR_URL`), so the test browser returned fixed answers through the same `/api/pulse` call. Rendering and behaviour are the real code.
- **The keyboard is simulated.** Playwright has no on-screen keyboard, so the tests shrink `visualViewport` while the composer is focused. Worth a quick check on a real iPhone.
- **Phone breakpoint:** the phone view uses the app's phone rule (≤768 px or phone landscape), not "below 1024". The green header and bottom bar only exist there; tablets keep the laptop layout.
- **History sheet height:** the shared BottomSheet caps at 85% (not ~90%). I kept the shared value.
- **Dates:** every chat is saved with `date: 'today'` (unchanged behaviour), so the groups only differ for chats saved differently. Rows show no time, because chats don't store one.
- **Categories:** nothing sets a chat's category today, so the chip only appears on chats that have one.
- **⋯ menu:** the Pulse header has no notifications item (your spec lists only "Delete this chat"); notifications stay on every other page.
- **Clarify:** clarify messages never come from the current API (it returns text/sql/model only). The phone view renders them like the laptop; they were tested from saved data.
