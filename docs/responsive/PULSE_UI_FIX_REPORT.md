# Frido Pulse phone fixes (fix/pulse-mobile-ui)

Prompt: `PULSE_UI_FIX_PROMPT.md` · mockup: `mockups/pulse_fix_mockup.html`. UI only: no changes to `api/pulse.js` or the connector.

## Root causes
- **Rows highlighting together, and a tapped chat not opening:** chat ids came from a counter that restarted at `new-1001` on every page load. New chats got the same id as saved ones, so several rows matched the "current" chat, and opening a row opened the first chat with that id.
  - Fix: ids are now unique, and duplicates in saved history get a fresh id on load.
- **✎ "opening ⋯":** ⋯ only appeared once a chat existed, and it appeared in the spot where ✎ had been. A second tap on ✎ landed on ⋯. ⋯ also disappeared again when no chat was open.
  - Fix: ⋯ is removed, and the header never changes its layout.
- **✎ doing nothing visible, and history full of "New conversation":** ✎ created an empty saved chat that looked exactly like the empty screen.

## What changed
| File | Change |
|---|---|
| `src/ask/PulseMobile.jsx` | Header: 🕘 · title · **+ New** pill.<br>First view: greeting, quick questions by area, Recent with no repeats.<br>"Your chats" sheet: tap opens; swipe left or long-press deletes; 5 s Undo toast. |
| `src/ask/PulseTable.jsx` (new) | Phone answer tables: max 4 columns plus a full-screen view, ▲▼ colours, Total row, second line, 10 rows then Show all, Copy as TSV. |
| `src/ask/markdown.js` | `splitAnswer()` splits an answer into text, table and Source blocks. Empty cells are kept, so a Total row with a blank cell stays aligned. The laptop renderer is unchanged. |
| `src/ask/pulseShared.js` | Shared title rule (first question, trimmed, capitalised), unique ids, history cleaning, quick questions, grouping by real time (IST). |
| `src/ask/AskFridoPage.jsx` | + New no longer saves an empty chat; empty chats are never saved; history is cleaned on load; chats keep a timestamp; restore for Undo. The laptop uses the same code. |
| `src/App.jsx` | Passes `areas` to Pulse, built from the same access helpers the sidebar uses. |
| `src/index.css` | `.pm-*` rules for the above; old ones removed. |

## Verification
375 and 360 px, Chromium and WebKit, temporary users (deleted afterwards): **41/41, 40/40, 41/41, 40/40**. The access check runs at 375 only.
- **New chat:** header is 🕘 · "Frido Pulse" · + New, with no ⋯. Tap targets are 44 px and don't overlap. + New ×3 adds no history and focuses the box.
- **Asking:** the title becomes the question, history gains 1 entry, and only that entry is highlighted "Open now".
- **Opening an older chat:** it opens and the sheet closes; only it is highlighted.
- **Deleting:**
  - Swipe-delete shows the toast, and Undo restores the chat.
  - Long-press shows "Delete chat".
  - Deleting the open chat goes to the first view.
- **Tables:**
  - A 6-column answer shows 4 columns plus "View full table". The full view scrolls sideways with the first column fixed.
  - Copy gives 6 tab-separated columns.
  - A 12-row table shows 10 rows plus "Show all 12 rows".
- **General:** no horizontal page overflow, no text under 12 px, no tap focus box.
- **Laptop 1366:** + New adds nothing; the saved empty chat and the duplicate id are cleaned; no errors.
- **Build:** passes. **Lint:** no new problems (379 on the branch vs 380 on main for the touched files).

## Decisions / notes
- **Tables:** the new table look is phone only. The laptop renderer is unchanged, following the design system's rule that laptop stays unchanged unless asked.
- **Quick-question access:**
  - Returns uses Sales access (returns live under Sales).
  - Planning uses Inventory access.
  - Logistics uses Logistics Performance.
- **Chip labels:** chips show the mockup's short labels and send the prompt's full questions; for example "D2C returns breakdown" sends "D2C returns breakdown this month".
- **Times:** shown in IST, "05:12" for today and yesterday, "27 Oct" for older chats. Chats saved before this change have no time, so their row shows none.
- **Testing:** answers in tests are stubbed (the connector isn't reachable locally). The preview ran on port 5188, because 5181 was already used by another local server.
- **Still to do:** the swipe and long-press gestures are worth a quick check on a real phone.
