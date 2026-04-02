# AGENTS

## Goal
- Build and maintain a Chrome extension that adds a ChatGPT "Copy Markdown" button and fixes math copy formatting.

## Core Rules
- Keep changes minimal, readable, and TypeScript-first.
- Preserve the agreed MVP behavior unless the user asks to expand scope.
- Do not remove or overwrite user-authored docs/plans.
- Prefer stable selectors and resilient fallbacks for ChatGPT UI changes.
- Use Chinese for comments/docstrings by default.
- Keep content script orchestration thin; put reusable logic under `lib/`.

## MVP Boundaries
- Target host: `https://chatgpt.com/*`.
- Primary success criterion: correct markdown for inline and block math.
- Baseline strategy: generate markdown directly from assistant message DOM (`DOM-only`).
- Math source of truth: KaTeX annotation nodes (`annotation[encoding="application/x-tex"]`).
- Do not rely on runtime hook paths (`D$t` / webpack runtime / page-hook injection) unless user explicitly asks to re-enable research mode.

## Current Architecture
- `entrypoints/content.ts`: observe page changes, inject button, orchestrate copy flow.
- `lib/markdown.ts`: DOM -> Markdown serializer (including math handling).
- `lib/content/markdown-button.ts`: button creation, state transitions, style injection.
- `lib/content/tooltip.ts`: tooltip mount/reposition/unmount.
- `lib/content/message-root.ts`: assistant message root resolution and debug logging.

## UI Consistency Rules
- Markdown button should reuse official action button style as much as possible.
- Tooltip behavior should follow original UX (hover/focus mount, leave/blur unmount).
- Icon assets should be independent files under `public/` and loaded via `chrome.runtime.getURL(...)`.
