# TransPulse live-captioning workspace

## Build
- Replace the home placeholder with a polished, responsive TransPulse broadcast console, using semantic design tokens and the project's existing UI components.
- Add three selectable conversation simulations, configurable source and destination languages, adjustable subtitle presentation, bilingual display, animated word-by-word captions, and a scrolling transcript.
- Provide browser SpeechRecognition microphone controls with clear unsupported/permission/error states; do not imply speech is translated when no translation service is present.
- Add transcript search, copy actions, clear, simulation pacing, pause/resume, latency display, and TXT/SRT/JSON export.

## Technical details
- Keep the experience frontend-only; simulation presets and speech recognition run in the browser.
- Keep timers, speech-recognition setup/cleanup, browser APIs, and download creation within React effects or interaction handlers.
- Add the required unique home-page metadata, document the frontend architecture in `AGENTS.md`, and verify the main experience with a browser check and existing tests.
