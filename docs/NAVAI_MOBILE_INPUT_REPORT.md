# NavAI on phones: attachments and voice (branch `fix/navai-mobile-input`)

Reports from real phones on 26 Nov 2026. Laptop behaviour (voice, 📎 + Ctrl+U, drag/drop, paste) is unchanged.

## B. "Chat failed" with a camera photo: the real cause
Cloud Run log, `frido-data-connector-00070-jon`, 26 Nov **09:36:31 UTC (15:06 IST)**: `POST /chat` → **500 after 8.6 s**. The request was fine: the photo had already been shrunk by the browser (`IMG20261123183605.jpg`, 284 KB, 285 KB request; file check `allowed=true`). The crash was inside the connector:

```
TypeError: Cannot read properties of undefined (reading 'trim')
  at isAllowed (lib/safety.js:145)  at executeTool (server.js:72)
```

The model answered the photo with a tool call that had **no `command`**; `isAllowed(undefined)` threw, nothing caught it, and the user saw the generic "Chat failed". So it was not the Vercel size limit, the resize, or a timeout. Fix (connector code, **not deployed**): `executeTool` returns a normal error to the model when the command is missing (it retries), and `isAllowed` / `blockReason` refuse a non-string command instead of throwing. Test: `frido-data-connector/scripts/test-tool-input.mjs`. **Needs a connector redeploy (canary first) to take effect**; merging to main does not redeploy Cloud Run.

Also in the browser (works without the redeploy): a failed send shows a plain sentence and the question comes back into the box.

| Cause | Message |
|---|---|
| Request too large (413) with a photo | Photo too large, try a screenshot. |
| Image can't be decoded | Couldn't read this image. Try a screenshot. (iPhone HEIC: says the format can't be read here) |
| Timeout (504/408) | NavAI took too long, try again. |
| Network down | Network problem, try again. |
| Connector 500 "Chat failed" | NavAI couldn't answer this time. Try again. (with a file: "…with this file. Try again, or try a screenshot.") |

Login, access, billing and "I ran N data requests…" messages from the server are kept as they are. After any failed send the question is put back in the box and attached files stay attached (`useAttachments` detach/restore); a good send frees the previews. Photos: decoded with EXIF rotation, 1600 px long side, JPEG 85% (steps down to keep one photo ≤ ~1 MB), whole request still checked against 4 MB; photos up to 30 MB are accepted because they are shrunk first. Only name, type and size are ever logged.

## A. 📎 on phones
Phone: tapping 📎 opens a bottom sheet: **Photo or screenshot** (`image/*`, no `capture`, so Android shows Photos/Gallery and iPhone the Photo Library), **Take photo** (`image/*` + `capture="environment"`), **Document** (`.pdf .xlsx .xls .csv .docx`). Up to 3 files, same limits, chips/preview/✕ as before, only with `ask:files`. Laptop: single picker as before.

## C. Voice on Android
"Listening…" and the red mic appear only after `onstart`/`onaudiostart`. Every error (`not-allowed`, `service-not-allowed`, `no-speech`, `audio-capture`, `network`, `aborted`, anything else) resets the button immediately (onend is not relied on); a mic that never starts and never errors resets after 8 s. Blocked/refused shows: "Microphone blocked. Close any floating buttons on your screen, then allow the microphone for this site in Chrome settings."

## D. Voice on iPhone
* Chrome / Firefox / Edge on iPhone (CriOS, FxiOS, EdgiOS): the 🎙 stays visible; tapping says "Voice works in Safari on iPhone. Or tap the 🎙 on your keyboard." and does not start.
* Safari: `start()` runs directly in the tap handler (no await, promise or timer before it); `continuous = false`, `interimResults = true`, language from the toggle (en-IN, hi-IN); interim and final text go in the box (after what was typed), never auto-sent; restarts after each utterance until stop is tapped or 3 s of silence; one recognition at a time; if no text arrives within 6 s it stops and says "Voice isn't working on this phone. Tap the 🎙 on your keyboard instead."
* No speech recognition at all: 🎙 hidden.

## Tests
* `scripts/navai-mobile-input-browser-check.mjs` (Chromium Pixel 7 identity and WebKit iPhone 13 identity at 375, laptop 1280): see results in the reply. Fixtures: a generated 4000×3000 noisy JPEG (11.6 MB at q0.6 in the generator, i.e. bigger than the 5–8 MB asked for) with EXIF orientation 6.
* Existing: `test-navai-access`, `test-navai-files`, `test-navai-excel`, `test-silent-update`, connector `test-files`, `test-page-access`; `navai-files-voice-browser-check.mjs` updated for the new mic rules and the phone's three file inputs.

## Only a real phone can check
1. Android Chrome: the Photos/Gallery picker really appears for "Photo or screenshot", and "Take photo" opens the camera.
2. A real camera photo (and an iPhone HEIC from the Photo Library, which iOS usually converts to JPEG itself) sends and the answer reads the picture.
3. Android: the real "can't ask for permission" block (floating button on screen) shows the message and the mic resets.
4. iPhone Safari: real dictation text appears, restarts between sentences, stops after 3 s silence; the 6 s fallback if iOS gives nothing (this is the one most likely to still depend on iOS version / Siri & Dictation settings).
5. iPhone Chrome: the "Voice works in Safari" message.
6. After the connector is redeployed: repeat the photo that failed (`IMG20261123183605.jpg`) and confirm an answer instead of an error.
