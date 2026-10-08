# Map chat: ask questions about the architecture map, in the browser

Date: 2026-10-08. Status: approved design, awaiting implementation plan.

## Problem

A generated map holds a lot of text (descriptions, facts, connections, flows) behind clicks. People
want to ask "what does the Orders API do and what talks to it?" and get the highlights, then be taken
to the right block, district or flow. The template promises one self-contained HTML file with no
network calls, so any model has to run in the browser and nothing may load until the person asks.

## Goal

A chat panel in `template.html` that answers questions about the map's own data with a language
model running on the local GPU, answers in under 5 seconds on an Apple M2 Pro class machine, and
offers to navigate to the entity it talked about, performing the navigation on a click or a "yes".

## Non-goals

- No fine-tuning or retraining. Stock instruct models from Hugging Face are used as published.
- No embedding model in this version. Retrieval is lexical; the ranker interface allows swapping in
  an embedding ranker later.
- No offline model folder. Weights and runtime come from their CDNs on first use and are cached by
  the browser. Model URLs live in one config object so a local path can be added later.
- No change to the data format, `check.js`, or the authoring workflow. Maps already generated keep
  working and gain the chat.
- No server. Nothing leaves the browser except the weight and runtime downloads.

## Decisions and evidence

Measured on 2026-10-08 in the Claude desktop browser pane (Chromium, Apple metal-3 adapter with
shader-f16) on an Apple M2 Pro, 32 GB, with a 900-token prompt built from the Acme example and a
120-token cap, greedy decoding:

| Candidate | Download | Cached load | Warm time to first token | Decode tok/s | Answer quality |
|---|---|---|---|---|---|
| WebLLM Qwen3-1.7B q4f16 | 968 MB (54 s) | 3.3 s | 1.4 s | 31–39 | grounded; correct `GOTO: id` both times |
| WebLLM Qwen3-0.6B q4f16 | 335 MB (21 s) | 1.8 s | 0.8 s | 50 | shorter; one invented id |
| WebLLM Qwen2.5-1.5B q4f16 | 869 MB (42 s) | – | 1.2 s | 25 | good prose; ignored the GOTO rule |
| Transformers.js Qwen3-0.6B q4f16 | 570 MB (37 s) | – | 1.2 s | 50 | same model; slower prefill |
| EmbeddingGemma-2 q4 | 175 MB + 300 MB unneeded vision/audio | – | index 26 items 1.5 s; query 0.3 s | – | ranked the right items |
| Chrome built-in Prompt API | – | – | – | – | unusable here ("unavailable" / "input too large") |

Estimated per-question cost after retrieval trims the prompt to about 500 tokens with a 90-token
answer: Qwen3-1.7B about 3 s warm, 4.5 s worst case; Qwen3-0.6B about 2 s.

Decisions:

- **Runtime: WebLLM** (`@mlc-ai/web-llm`, pinned 0.2.85, loaded from jsDelivr on demand). Fastest
  prefill of the runtimes tried, prebuilt Qwen3 libraries, OpenAI-style streaming API, Cache Storage
  for weights. Regolith's production tutor pack uses the same runtime.
- **Models: Qwen3-1.7B-q4f16_1-MLC as the default ("Better"), Qwen3-0.6B-q4f16_1-MLC as "Fast".**
  The person can switch in the panel; the choice is remembered.
- **Main thread, not a worker.** Module workers from blob URLs fail on `file://` pages; the benchmark
  ran on the main thread with the canvas animating.
- **`file://` is supported.** Probed with headless Chrome 154 over the DevTools protocol: on a
  `file://` page Cache Storage, IndexedDB, WebGPU with shader-f16, and CORS fetches from Hugging Face
  and jsDelivr all work. Storage quota reported 11 GB. OPFS is blocked on `file://` and is not used.
- **Retrieval before generation.** The whole map does not fit the latency budget as prompt text; a
  ranked subset of about 450 tokens does.
- **Navigation is hybrid.** The model may name a target with a `GOTO:` line, but only ids that
  retrieval already proposed are accepted, so a weak model cannot send the person to the wrong place.

## Architecture

All code stays in `template.html`, after the existing app module, as five small IIFE modules.

| Unit | Responsibility | Depends on |
|---|---|---|
| ChatUI | Button, sliding panel, messages, input, model picker, status, progress, first-use notice | Guide, Navigator, Runtime status, app `updateInsets` |
| Retriever | Builds documents from the data at page load; `rank(question, state) → candidates`; builds the context block | `META, ZONES, NODES, EDGES, FLOWS, INSIDE, CATS, PROVIDERS` |
| Guide | System prompt, message assembly with recent turns, streaming generation, parsing text and `GOTO` | Retriever, Runtime |
| Runtime | WebGPU and shader-f16 check, engine load/unload, progress, warm-latency measurement, tier memory | WebLLM (dynamic import) |
| Navigator | Validates a target against candidates, renders the offer, performs navigation, handles "yes" | app `navigate`, `focusZone`, `startFlow`, `NODE`, `ZONE`, `FLOWS` |

Data flow for one question: ChatUI → Retriever (candidates and context) → Guide (messages →
Runtime stream) → ChatUI renders tokens → Guide parses `GOTO` → Navigator validates → ChatUI shows
the offer chip → click or "yes" → the map flies there.

Pure logic (Retriever, Guide's parser, Navigator's validation and affirmative detection) sits between
`/* ===== BEGIN CHAT CORE ===== */` and `/* ===== END CHAT CORE ===== */` markers with no DOM or
WebLLM references, so Node can evaluate it for tests the way `check.js` evaluates the data region.

Configuration: an optional `META.chat` object. All fields optional with defaults in code:
`models` (the two tiers: id, label, approximate size), `runtimeUrl`, `maxTokens`. Absent `META.chat`
means defaults.

## Chat UI

- **Button.** A glass pill centred at the bottom of the stage: spark icon plus "Ask about this map".
  Keyboard shortcut `c`. Hidden while the panel is open.
- **Panel.** Slides up from the bottom edge: 50% of the viewport wide and centred (minimum 440 px,
  full width under 900 px), one third of the viewport tall, same glass styling as the side panels.
  The stage keeps running behind it. The panel registers a bottom inset with the app's
  `updateInsets` so camera framing and the on-canvas hint account for it.
- **Header row.** Title; model picker as two chips ("Better · Qwen3 1.7B" default, "Fast · Qwen3
  0.6B"); status dot with text (not loaded / downloading 42% / ready / thinking / error); close
  button. Escape closes the panel when the input is focused instead of triggering the map's back.
- **Messages.** Scrolling list, newest at the bottom. User messages right-aligned, assistant
  left-aligned, rendered with the template's existing bold and code formatting, streaming cursor
  while tokens arrive. An assistant message can carry one action chip: "Take me to Orders API",
  "Zoom to Data & messaging", or "Play flow: A shopper checks out".
- **Input row.** Auto-growing textarea (one to three lines), Send button. Enter sends, Shift+Enter
  inserts a newline. While the textarea has focus the map's single-key shortcuts (r, l, f, a,
  arrows, slash) are ignored.
- **First use.** Before any download the panel shows: approximate size of the selected model, that
  it runs on the local GPU, that questions never leave the browser, and a "Load model" button.
  Progress replaces the notice during download; the input unlocks when the engine is ready. Later
  visits load from cache in a few seconds behind the same progress strip.
- **Empty state.** Three suggested questions derived from the data: the tallest node, the first
  flow, one district.
- **Persistence.** Chosen model and panel open state in localStorage. Conversation history in
  memory only.

## Retrieval

**Documents**, built once at page load:

- One per node in the overview and in every inside view (inside ids keep their `view.part` form).
- One per district, one per flow, one per connection, plus one "about the system" document from
  `META.title`, `META.tagline` and `META.intro`.
- Fields: `id`, `kind` (node, zone, flow, edge, about), `view`, `name`, `aliases` (tag, blurb
  keywords), `text` (name, tag, blurb, description paragraphs, does, facts, tech, paths, notes,
  provider label, category label, district name), and `card`: a compact prompt line of 60 to 120
  tokens, `id | name | district | category | summary`, with connections as `a → b (kind, label)`.

**Ranking.** Lowercase, strip punctuation, drop stopwords, fold simple plurals. Term score by field:
name 5, aliases 3, text 1. Boosts: exact name or alias match; the entity currently selected or the
view currently open; the entity named by the previous answer's accepted target, so follow-ups like
"and its database?" resolve. The top hit's directly connected nodes join as secondary context.
Budget: six primary documents plus their connections, about 450 tokens; the "about" card always
goes first. Output: ordered candidates with scores, and the assembled context string.

**Interface.** `rank(question, state)` where `state` carries the current view, selection and the
previous target. An embedding ranker can replace the body later without touching callers.

## Prompt and generation

System message: you are the guide for this architecture map; answer only from the context; two to
four short sentences; say plainly when something is not on the map; use names rather than ids in
prose; finish with exactly one line `GOTO: <id>` when one listed entity or flow is the subject of
the question, otherwise `GOTO: none`. Then the context block, the last three exchanges trimmed to
their display text, and the question. Qwen3 thinking is disabled through the engine's
`enable_thinking: false` and a `/no_think` suffix; any stray `<think>…</think>` block is stripped
before display.

Generation: greedy (temperature 0), 160-token cap, streamed. Prefill and decode timings are kept on
each assistant message and exposed on `window.__arch.chat` for debugging.

## Runtime

- Before any download: `navigator.gpu.requestAdapter()` must return a non-fallback adapter whose
  features include `shader-f16`. Otherwise the chat runs in facts mode (below).
- Load: dynamic `import()` of the pinned WebLLM module from jsDelivr, then `CreateMLCEngine` with
  the tier's model id, `initProgressCallback` driving the progress strip. WebLLM caches weights in
  Cache Storage.
- Switching tiers unloads the current engine before loading the next.
- After the first real answer per tier, the warm total is measured once. If the default tier
  exceeds 5 seconds, the panel suggests Fast with one tap. The measurement is stored with the tier
  choice.
- Runs on the main thread. Prefill may cause brief hitches in the animation; accepted.

## Navigation

- When an answer completes, Guide removes the trailing `GOTO:` line from the display text and hands
  the id to Navigator.
- Navigator accepts the id only if it is among that question's candidates. An invented id is
  ignored. If the model said `none` or invented an id, but the question clearly named one candidate
  (top score at least twice the runner-up), that candidate becomes the offer. Otherwise no offer.
- An accepted offer renders as the action chip plus the line "Want me to take you there?".
- The chip calls the app's `navigate(view, id)` for nodes and inside parts, `focusZone(id)` for
  districts, `startFlow(flow)` for flows. The chat stays open and the camera flies.
- If the next user message is a short affirmative (`yes`, `y`, `yeah`, `yep`, `sure`, `ok`, `okay`,
  `please`, `go`, `do it`, `take me`, `take me there`, case-insensitive, with optional punctuation)
  while an offer is pending, Navigator performs it without calling the model and the assistant
  replies "Taking you to <name>." Any other message clears the pending offer.

## Facts mode and errors

- **Facts mode** runs when WebGPU or shader-f16 is missing, a download fails, or the engine throws
  on load. The Retriever alone answers: the top candidate's name, blurb, first description
  paragraph and main connections, in the normal bubble, with the same offer chip. A one-line notice
  explains that the full model needs WebGPU in Chrome, Edge or Safari 26, with Retry when the
  failure was a download.
- **Errors mid-answer.** Partial text stays, an inline error line follows it, history is kept so the
  question can be resent.
- **Privacy.** Nothing leaves the browser except the weight and runtime downloads, stated in the
  first-use notice.
- **Licensing.** Qwen3 and WebLLM are Apache-2.0, fetched at runtime rather than bundled; the MIT
  notice in the HTML is unaffected. The README gets a "Chat" section with requirements, download
  sizes and this point.

## Testing

- `chat.test.js` (dependency-free, `node:test`, Node 18+) extracts the CHAT CORE region and the
  data DSL and data regions from `template.html`, evaluates them in a `vm` context like `check.js`,
  and checks against the Acme example: ranking for named entities ("orders api" → `api` first;
  "where do payments happen" → `stripe` or `api.payments` in the top three), follow-up resolution
  with a previous target, context budget respected, `GOTO` parsing with and without `<think>`
  blocks and with `none`, invented-id rejection, clear-winner fallback, affirmative detection
  including negatives ("yes but what about redis" is not an affirmative).
- Browser verification in the desktop browser pane against a local static server: load both tiers;
  ask five scripted questions; record warm totals under 5 seconds for the default tier; confirm the
  chip navigates to the right view for a node, an inside part, a district and a flow; confirm the
  "yes" path; confirm facts mode by forcing the adapter check to fail.
- `node check.js template.html` still exits 0.

## Out of scope, noted for later

- Embedding ranker (EmbeddingGemma-2 q4, 175 MB text weights; the pipeline currently also fetches
  300 MB of vision and audio encoders, so a text-only load path needs checking first).
- Offline `models/` folder with a fetch script and `META.chat.modelsBaseUrl`.
- Worker-hosted engine once module workers from `file://` are viable.
- Safari 26 verification (WebGPU and shader-f16 are reported present on Apple silicon; WebLLM not
  tested there).
