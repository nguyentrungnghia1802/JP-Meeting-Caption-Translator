# JP Meeting Caption Translator

A Chrome Extension that reads Japanese captions from Google Meet in real-time and displays a Vietnamese translation as an elegant on-screen overlay — powered by OpenAI API.

---

## Features

- Reads live Japanese captions directly from the Google Meet DOM (no audio capture)
- Translates Japanese → Vietnamese in real-time using OpenAI Chat API
- Elegant dark semi-transparent overlay showing:
  - Original Japanese caption (small, subtle)
  - Vietnamese translation (large, prominent)
- Start / Stop translation from the popup
- Configurable API key, model, source/target language in Settings
- Translation cache to avoid duplicate API calls
- Debounced caption detection to reduce API usage
- No backend — all processing is done in the browser

---

## Installation

### Prerequisites

- Node.js 18+
- npm 9+
- A Google account with access to Google Meet
- An [OpenAI API key](https://platform.openai.com/api-keys)

### Build

```bash
npm install
npm run build
```

### Load Extension in Chrome

1. Open Chrome and navigate to `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select the `dist/` folder inside this project

---

## Usage

1. Go to [meet.google.com](https://meet.google.com) and join a meeting
2. In Google Meet, turn on **Captions** (the CC button) and set them to Japanese
3. Click the extension icon in your toolbar
4. Click **⚙️ Open Settings** and enter your OpenAI API key, then save
5. Click **▶ Start Translation**
6. When Japanese captions appear, the overlay will show both the original text and the Vietnamese translation
7. Click **■ Stop Translation** to hide the overlay

---

## Troubleshooting

| Problem | Solution |
|---|---|
| Overlay does not appear | Make sure you're on `meet.google.com` and have clicked Start Translation |
| No translation shown | Check that Google Meet captions are enabled and set to Japanese |
| "No API key" warning | Open Settings and enter a valid OpenAI API key |
| "Invalid API key" error | Verify your key at [platform.openai.com](https://platform.openai.com/api-keys) |
| "Rate limit exceeded" | You've hit OpenAI's rate limit — wait a moment and try again |
| Translation stops after Google Meet update | Google may have changed their DOM — check for extension updates |
| Overlay covers meeting controls | The overlay is positioned above the bottom controls; you can reload the page to reset |

---

## Tech Stack

- Chrome Extension Manifest V3
- TypeScript + Vite
- React (popup & options pages)
- MutationObserver (caption detection)
- OpenAI Chat Completions API (`gpt-4o-mini` default)
- `chrome.storage.local` for settings

---

## Security & Privacy

- Your API key is stored only in your browser's local extension storage
- Only the caption text is sent to OpenAI for translation — nothing else
- No meeting transcript is saved or transmitted
- No backend server is involved

---

## Known Limitations

- Only tested on Google Meet (MVP)
- Caption detection relies on Google Meet's DOM structure — if Google updates their UI, the detector may need updates
- Does not process audio or non-Japanese captions
- API key is stored in browser local storage (not encrypted at rest)
- Do not use for highly confidential meetings without a backend security review

---

## Development

```bash
npm run dev       # Watch mode (rebuilds on file changes)
npm run typecheck # TypeScript type checking
npm run build     # Production build → dist/
```
