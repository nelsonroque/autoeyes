# Cognitive Assessment Automation Studio

A local TypeScript application for recording, replaying, observing, and testing browser-based cognitive assessments. The supplied M2C2 Symbol Search URL is prefilled, and a canvas-based mock assessment is bundled for offline validation.

## Quick start

Requirements: Node.js 20+ and npm. AI-driven mode also requires the Codex CLI; authentication follows the official [`codex login --device-auth` flow](https://learn.chatgpt.com/docs/auth#preferred-device-code-authentication-beta).

```bash
npm install
npx playwright install chromium
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). The API runs on `http://localhost:4310`. Playwright launches a separate, visible Chromium window by default.

To validate the production build:

```bash
npm run build
npm start
```

Then open `http://localhost:4310`.

## Launch URL parameters

Add name/value rows under **URL parameters** before launching an assessment. Rows are saved in the dashboard browser’s local storage and restored on future visits. They are appended to any query parameters already in the URL, including duplicate names. Values are stored in plain text in that browser; avoid saving secrets on shared devices.

## P0 workflow

1. Leave the prefilled M2C2 URL or enter any assessment URL and click **Launch Assessment**.
2. Choose **Scripted**, then click **Record demonstration**.
3. Interact directly with the separate Chromium assessment window.
4. Return to the dashboard, stop recording, and name the strategy.
5. Restart or reset the assessment, select the saved strategy, and click **Replay**.
6. Inspect the live screen, step status, timing, screenshots, and errors. Export a strategy or run as JSON from its panel.

The bundled fallback is `http://localhost:4310/mock-assessment`. It renders the task inside a canvas and is used by the end-to-end test.

## Mode boundaries

- **Scripted** records raw pointer coordinates and keyboard events, then replays only with Playwright mouse/keyboard APIs. Coordinates are stored both as CSS pixels and viewport-relative values.
- **AI-driven** passes screenshots—not DOM or accessibility content—to an authenticated local Codex CLI process and executes a schema-validated action. Authentication uses ChatGPT device authorization; the studio never reads or stores the Codex credential cache.
- **Simulated Participant** transforms a reusable screen strategy with seeded lognormal reaction times, practice/fatigue trends, and lapse/error labels. Runs are clearly tagged synthetic. These settings are not a validated model of human cognitive performance.
- **DOM-driven** is isolated behind separate discovery/action APIs and is the only mode permitted to use locators, element text, roles, or selectors.

The recording hook listens to raw input events so that inputs made in the Playwright-controlled window can be saved. It does not query targets, selectors, the accessibility tree, canvas state, or application variables. Recording screenshots and replay screenshots are written under `data/screenshots`; run logs are under `data/runs`; strategies are under `data/strategies`.

## Browser console capture

During a replay or AI run, console messages from the assessment page (including its frames) are captured with their type, text, source location, and time relative to the run start. They appear in the execution monitor and run history and are included in exported run JSON. Capture starts when the run starts, so messages from the initial page load are not included unless the page reloads during the run. To bound storage, each run keeps up to 1,000 messages and truncates individual messages at 10,000 characters. Console output may contain sensitive assessment data; handle run files accordingly.

## Comparing sessions

Select saved runs under **Compare sessions** to compare action counts, durations and console message counts. Numeric values in complete JSON console messages or labeled JSON records such as `newData: {...}` can also be plotted by field and observation order, including nested objects and arrays. Per-session histograms show counts in shared bins for the selected field, such as `response_time_duration_ms`. A Gaussian density comparison uses a shared bandwidth and scale; curves are normalized to area 1 and omit sessions with fewer than two values. Plain diagnostic text, incomplete JSON and non-JSON object previews are not interpreted as result data. Check that a field has the same meaning and units across runs; action counts and dispatch intervals are not assessment scores or response times. Older runs without console capture remain available.

## Strategy model

Strategies use schema version `1.0`. The runtime validator lives in `packages/shared`; the portable JSON Schema is [`strategy.schema.json`](strategy.schema.json). Supported primitives include click, move, keypress, type, wait, wait-for-visual-change, screenshot, loop, branch, DOM click/type, timeout policy, and recovery steps. DOM primitives are rejected at runtime for non-DOM modes.

Use the dashboard JSON editor to edit individual actions and validate/save. **Save version** creates a new immutable identifier with an incremented version. Import accepts a strategy JSON file; export downloads one.

## Codex device authentication and AI limits

Install the Codex CLI, select **AI-driven**, and click **Connect Codex**. The backend starts `codex login --device-auth`; open the displayed URL and enter its one-time code. Device-code login may first need to be enabled in your ChatGPT security or workspace settings.

You can also authenticate before launching the studio:

```bash
codex login --device-auth
codex login status
```

Codex stores and refreshes its own credentials. The studio invokes `codex exec` with an attached screenshot, a strict output schema, an ephemeral session, and a read-only sandbox. It never reads `~/.codex/auth.json`, and no API key is accepted by the application. `CODEX_BIN` and `CODEX_VISION_MODEL` are optional overrides.

The vision loop defaults to 30 calls, 500,000 reported tokens, five minutes, and three consecutive errors. These limits are configurable in the AI-driven panel. Vision screenshots are conditionally reduced to fit within 1024×768, and returned coordinates are mapped back to the browser viewport. The loop reuses each post-action capture as the next observation, so a completed run with N decisions takes N browser screenshots (or N+1 when it stops at a limit rather than `finish`). Each screenshot decision launches an isolated Codex execution without loading user-configured plugins or MCP servers; authentication and an explicit `CODEX_VISION_MODEL` override still apply. Reported input usage includes Codex instructions and built-in tool context in addition to the image prompt, so it can remain substantially larger than the visible prompt. If a call, token, or duration limit is reached, the run records the exact reason as a warning. The loop can be paused, resumed, or stopped, and its active Codex child process is terminated when the run is stopped or its duration expires. Estimated API cost remains `0` because ChatGPT-plan usage is not a Platform API-key call.

The dashboard continues to poll lightweight run state every 1.2 seconds, but it captures a live-preview image only after a browser action or navigation. A 15-second fallback refresh catches autonomous visual changes, limiting an otherwise idle browser to four preview captures per minute.

## Tests

```bash
npm test
npm run test:e2e
npm run build
```

Unit tests cover schema validation, coordinate scaling/execution boundaries, and seeded positive-valued participant timing. The Playwright smoke test starts the full dashboard, launches the local canvas assessment in the controlled Chromium instance, records a click, saves the strategy, restarts, replays, and verifies action/screenshot logs.

For headless environments:

```bash
PLAYWRIGHT_HEADLESS=1 npm run dev
```

## Architecture

- `BrowserController`: headed Chromium lifecycle, navigation, viewport, screenshots, pointer and keyboard dispatch
- `ScreenObserver`: screenshot-only observation surface
- `StrategyEngine`: validation-ready actions, timing, branching, loops, visual waits, pause/resume/step
- `Recorder`: raw demonstration capture and viewport-relative strategy generation
- `VisionAgent`: screenshot-to-structured-action loop through device-authenticated Codex CLI
- `ParticipantSimulator`: reproducible response timing and behavioral transformation
- `DOMAgent`: explicitly isolated locator and inspection surface
- `RunLogger`: action timing, screenshots, warnings, failures, and JSON persistence

## Current limitations

- Visual-change waits detect rendered screenshot change, but the MVP does not yet classify the new screen or use perceptual regions/thresholds.
- AI inference requires a locally installed, device-authenticated Codex CLI and a vision-capable model available to that ChatGPT account or workspace.
- Simulation can schedule timing and lapses generically, but task-specific wrong-answer choice requires a strategy whose alternative responses are explicitly parameterized.

Use only on assessments you are authorized to automate. Keep synthetic runs isolated from research participant datasets.
