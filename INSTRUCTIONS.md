# Building a 3D architecture map of a code repository

These instructions are for an AI coding agent (or a person) that has a code repository in front of it and
wants to produce an interactive, shareable **3D architecture map** of the whole system: the people who use
it, the apps, the services, the data stores, the cloud and third-party services, the delivery pipeline and
the tooling — with the ability to click into any area for more context.

Files in this folder:

| File | What it is |
| --- | --- |
| `template.html` | The complete viewer (engine + UI) with a small **fictional** example dataset. You replace the example. |
| `check.js` | A dependency-free Node script that validates the data you wrote. Run it until it reports no errors. |
| `INSTRUCTIONS.md` | This document. |

The result is **one self-contained HTML file** (no external scripts, fonts or network calls) that can be sent
as an attachment, dropped in a repo's `docs/` folder or put on any static host.

---

## 0. What the viewer does with your data

Knowing what the viewer renders tells you what the data must contain.

- **Overview**: a 3D "city". Each **district** (plate) is a layer of the system (people, experience, edge,
  core, data, …). Each **system** is a block on a plate; its height encodes importance, its colour its
  category, a badge marks the provider (own / cloud / third-party). **Connections** are arcs with animated
  traffic; their colour encodes the kind of link (HTTP, stream, data, async, auth, API, ship, telemetry, use).
- **Inspecting**: clicking a block, a connection or a district opens a detail panel with a description,
  facts, what it does, tech, the links in and out, and the repository paths that prove it.
- **Diving in**: systems that have an **inside view** can be opened (double-click / "Open inside"). The
  inside view is its own small city (one to three plates of parts) surrounded by dashed **ghost** blocks of
  its neighbours from the overview, so the reader keeps context.
- **Guided flows**: a numbered, animated path across the overview that explains one scenario step by step
  ("a user checks out", "a commit reaches production").
- **Search**, **provider spotlight** (dim everything not from Google / AWS / third parties), **layer** and
  **connection-type toggles**, a 30-step **Back** history, and shareable links of the form
  `map.html#<view>~<nodeId>`.

Everything above is driven only by the data region. You never touch the engine or the UI.

---

## 1. Workflow at a glance

1. **Copy** `template.html` to where the map will live (for example `docs/architecture/<system>-architecture-3d.html`).
   Keep `check.js` next to it or point at it from this folder.
2. **Research** the repository (Phase A). Do not write data before you understand the system.
3. **Model** the system in the data region of the copied file (Phase B), replacing the example between
   `BEGIN ARCHITECTURE DATA` and `END ARCHITECTURE DATA`. Keep both marker lines exactly as they are.
4. **Validate**: `node check.js <your-map.html>` (Phase C). Fix every error; read the warnings.
5. **Look at it** in a browser (Phase D). Fix layout and wording problems.
6. **Hand off** with a short report (Phase E).

Budget: a whole-system map of a mid-sized repository is 60–100 overview systems, 100–160 connections,
6–10 inside views and 5–8 flows. Expect the data region to be 800–1,500 lines.

---

## 2. Phase A — Research the repository

The map is only as good as the facts in it. Every block, connection and sentence must come from the
repository (code, configuration, infrastructure-as-code, CI configuration, READMEs, docs). Do not invent.

### A1. Inventory the repository

List the top-level layout and, for each area, what lives there: applications/services, libraries/packages,
tools/CLIs, infrastructure (Terraform, CloudFormation, Pulumi, Kubernetes/Helm, Docker Compose), CI/CD
(workflows, pipelines, build configs), docs, data/seed files, scripts, archived or legacy folders. Read the
root README, any `ARCHITECTURE`/`CONTRIBUTING`/agent-instruction files, and the per-service READMEs.

### A2. Run two deep surveys

Split the work in two so each survey stays coherent. If you can run subagents, run both in parallel and
ask for a report with **a file path as evidence for every claim** and `INFERRED` on anything not directly
confirmed by code. If you cannot, do them one after the other yourself.

**Survey 1 — the runtime side (services, data, external calls).** For every service / backend / worker /
agent: purpose; language, framework, entry point; internal structure (route groups, domains, modules,
tools); datastores and what is stored where; queues, topics, schedulers, cron jobs, webhooks (inbound and
outbound); every external system it calls (cloud APIs *and* third-party SaaS: payments, email, SMS, CRM,
auth, maps, speech, LLMs, analytics, error tracking); who calls it; how service-to-service calls are
authenticated. Also cover shared libraries and who consumes them. Look at dependency manifests, settings /
config classes, environment variable names, secret names, client modules and `integrations`/`webhooks`
routes — these reveal external systems more reliably than READMEs.

**Survey 2 — the clients, tooling and infrastructure side.** For every user-facing app (web, mobile, admin
console, embed/plugin, CLI): who its users are (customers, staff, partners, operators), the main route
groups / screens (especially admin and back-office pages), how it reaches the backend, how users sign in,
and third-party scripts/SDKs used client-side. For tooling: each CLI/console/pipeline tool in one or two
lines (what it is, who uses it, what it connects to). For infrastructure: cloud resources per environment
(compute, load balancers, DNS, identity/access gateways, databases, caches, buckets, queues, secret stores,
registries), how environments are organised (local, dev, staging, prod), the observability stack, and the
**CI/CD flow from commit to production**. Also any seed/data folders and what they hold.

### A3. Verify before you believe

READMEs go stale. Spot-check anything surprising or load-bearing:

- A technology listed in a README but absent from the dependency manifest is probably gone (or never was).
- A service folder with no tracked files (`git ls-files <dir>`) or a "remove X" commit means it is
  **retired** — it goes to the Legacy district, not the live path. Check Terraform/IaC for leftovers of it.
- Names lie: a class or env var can keep an old name after its role changed. Describe the current role,
  mention the naming residue in a note.
- If a service's name does not say what it does, read its routes/entry point. Do not guess from the name.
- No integration found for something you'd expect (for example, no lender/partner API in a financing
  product)? Say so explicitly in the node's `notes` as `INFERRED`, rather than drawing a connection that
  does not exist.

### A4. Decide what is in scope

Include: every deployable, every datastore, every external system actually called from code or configured
in IaC, every class of user (including external organisations like customers' own websites or partners that
receive output), environments, the delivery pipeline, operator tooling, observability, and retired things
(as legacy). Exclude: individual functions, trivial scripts, dev-only lint/format tooling, dependencies that
are mere libraries (a web framework is a `tech` chip on a node, not a node).

### A5. Safety: what never goes in the map

The file will be shared. Never include secrets, API keys, tokens, account/project identifiers, internal IP
addresses, personal e-mail addresses, customer names you were not asked to show, or anything from `.env`
files. Resource *names* like a bucket's purpose are fine; a literal bucket name is not necessary. If you
find credentials committed in the repository, **tell the user separately** in your report — do not put them
in the map.

---

## 3. Phase B — Model the system

### B1. Vocabulary

| Term | Meaning in the data |
| --- | --- |
| District / zone / plate | A layer of the system drawn as a plate with a grid of cells (`cols × rows`). |
| System / node / block | One box on a plate: an app, service, datastore, external service, group of people, tool… |
| Connection / edge | A directed link between two overview nodes, of a `kind`. |
| Minor connection | A secondary link, hidden until one of its ends is selected. Keeps the overview readable. |
| Guided flow | An ordered list of steps `from → to` across overview nodes, with a sentence per step. |
| Inside view | A second-level city for one overview node, with its own plates, parts, links and ghost neighbours. |
| Provider | Who runs the block: `own` (this repository), the main cloud (`cloud`), vendors (`third`). |
| Category | The layer colour/icon family (`users`, `app`, `edge`, `core`, `ai`, `data`, `platform`, `saas`, `ops`, `obs`, `legacy`). |

### B2. Districts

Use the standard set below, drop what the system doesn't have, rename labels to the system's own words,
and add at most two of your own. Twelve to fourteen districts is the practical maximum.

| District (cat) | Contents |
| --- | --- |
| People & customers (`users`) | End users, staff/operators, engineers, partner organisations, customers' own sites. |
| Experience (`app`) | Web/mobile apps, admin consoles, embeds/plugins, shared UI kits. |
| Edge & identity (`edge`) | DNS, CDN, load balancers, API gateways, access proxies, identity providers, webhook relays. |
| Core services (`core`) | Services built in this repo; managed job runners that call them (task queues, schedulers). |
| AI / ML (`ai`) | Agents, models, vector stores, knowledge packs, runtime configuration, eval jobs. Omit if none. |
| Data & messaging (`data`) | Databases, caches, warehouses, buckets, secret stores, pub/sub, queues. |
| Cloud platform APIs (`platform`) | Managed APIs the code calls (maps, speech, document, workspace). |
| Third-party services (`saas`) | SaaS reached by API or webhook: payments, e-mail, CRM, analytics, error tracking, voice… |
| Delivery (`ops`) | Source hosting, CI, registries, deploy pipelines, IaC, the runtime platform. |
| Operator tooling (`ops`) | CLIs, consoles, pipelines engineers/operators run. |
| Environments (`ops`) | Local, dev, staging, production (one node each). |
| Monorepo / code layout (`ops`) | Optional: one node per top-level area when the repo is large. |
| Observability (`obs`) | Tracing, logging, error reporting, dashboards/alerts, retention. |
| Legacy & retired (`legacy`) | Retired services, idle tools, archived runtimes. |

**Layout.** Use `layoutRows([...rows], { gapX, gapZ })` and let it place the plates. Rows go back → front:

- **Back row**: people & customers, third-party services, cloud platform APIs, observability, code layout —
  the "outside world" and things that are read about rather than walked through.
- **Middle row**: the request path, left → right: Experience → Edge & identity → Core services → Data →
  AI. This row is the longest; readers follow it like a sentence.
- **Front row**: delivery, operator tooling, environments, legacy.

**Sizing.** A plate's grid is `cols × rows` cells, one node per cell (the hub may span two). Count the nodes
you intend to put in a district and size the grid to fit them with at most one spare cell. Plates with
more than ~5 columns get wide; prefer 2 rows. Keep district names ≤ 26 characters (they shrink to fit
otherwise) and tags ≤ 40.

### B3. Systems (nodes)

`nd(id, zone, [col, row,] cat, name, tag, icon, height, blurb, { … })`

- **id**: short, stable, lowercase (`backend`, `postgres`, `stripe`). Flows, inside views and links use it.
- **col/row**: optional. Omit them and the next free cell is used in reading order. Give the hub an explicit
  `0, 0` and `span: [2, 1]` (or `[2, 2]` on a 2-row plate) so it dominates its district.
- **name** ≤ 30 chars; **tag** ≤ 40 chars — the one-line subtitle (`FastAPI · Cloud Run`, `primary database`).
- **icon**: one of `person users window cog server db cloud shield chat spark mail pin chart flow term key
  cube clock bell search doc bolt globe lock phone mic layers branch tag eye wrench brain`.
- **height**: 1.0 for minor things, 1.2–1.6 for normal, 1.8–2.2 for important, 3.0–3.4 for the hub(s).
  Heights are the fastest visual cue of importance — use the full range.
- **blurb**: one sentence shown in tooltips and search.
- **opts**:
  - `prov`: `'own'` (default), `'cloud'`, `'third'` — or any extra provider you declare.
  - `desc`: one string or an array of 1–3 paragraphs. What it is, what it owns, how it relates to its
    neighbours. Write for a new engineer. Markdown-lite: `**bold**` and `` `code` ``.
  - `does`: 3–6 bullet strings of concrete responsibilities (real endpoints, queues, jobs).
  - `facts`: 2–5 `[label, value]` pairs (runtime, version, port, domains, instances, auth method).
  - `tech`: chips (framework, runtime, notable libraries).
  - `paths`: 1–4 repository paths that prove the node exists (`services/api/src/`). Required for `own` nodes.
  - `notes`: caveats, stale-README findings, and anything `INFERRED`.
  - `span`: `[cols, rows]` footprint for the hub.
- **People nodes** deserve the same care: what they do, how they sign in, which app they use.

Budget: 40–100 overview nodes. Beyond ~110 the map crowds; move detail into inside views instead.

### B4. Connections

`e(from, to, kind, label, detail, MINOR?)`

- **Direction** = who initiates. Browser → API, API → database, API → third-party, webhook provider → API,
  scheduler → service, CI → registry. For streams that flow back (SSE, push), draw the edge from the sender.
- **kind**: `http` (request/response), `stream` (SSE/websocket/AG-UI), `data` (read/write a store), `async`
  (queue/topic/cron/webhook callback), `auth` (identity, tokens, config/secrets), `api` (cloud or vendor
  API), `ship` (build/release/deploy/provision), `obs` (telemetry/alerts), `use` (people using/embedding).
- **label** ≤ 30 chars, shown when an end is selected (`/api/*`, `enqueue actions`, `AG-UI SSE`).
- **detail**: one or two sentences — the *how* (auth scheme, endpoint, protocol, when it happens).
- **MINOR** (`e(..., MINOR)`): secondary links. Use it for secrets/keys, telemetry, analytics SDKs,
  "contains"/"hosts" relations, and any link that would just add noise. A good overview shows ~1 major
  connection per node; the rest are minor and appear on selection.
- Every node should have at least one connection (the validator warns). Don't draw a link you can't name.

### B5. Guided flows

`flow(id, name, blurb, [[from, to, kind, 'what happens'], ...])`

Pick 5–8 scenarios that explain the system best: the main user journey, the main business transaction,
how a change ships to production, an async/event pipeline, an AI/ML turn if there is one, an
operator/config change, an integration round-trip. Each step is one hop between two **overview** nodes
with a sentence saying what happens there (real endpoint names, token types, states). 4–9 steps per flow.

### B6. Inside views

`view(overviewNodeId, title, subtitle, cat).rows([...]).n(...).e(...).x(...)`

Create one for the 6–12 nodes where a reader will ask "what's in there?": the hub service (routers on one
plate, domain modules on another), each client app (pages/features + plumbing), the AI runtime, the edge
(routes), the main database (collections/kinds grouped by owner), the CI pipeline (triggers), the local
environment (processes and ports). Also any node whose `desc` would otherwise exceed three paragraphs.

- Parts are declared with `.n(id, plateId, name, tag, icon, height, blurb, opts)`; their ids become
  `<view>.<id>` automatically. In `.e()` write local ids as `'.id'`.
- Links to overview nodes are allowed in `.e()` (for example `.e('.routes', 'postgres', 'data', '')`) **and**
  those overview ids must be listed in `.x(side, [...])` so they are drawn as ghost neighbours. Put callers
  on the `left`/`back`, things it calls on the `right`/`front`.
- Inside views may use `cat` overrides per part (`{ cat: 'legacy' }`) and providers (`{ prov: 'cloud' }`).

### B7. META, providers, categories, kinds

- `META`: `title`, `brand`, `tagline`, `intro` (1–3 paragraphs: what the system is for, the main moving
  parts, where it runs), `start` (3–5 entry points: `pick` a node, `flow`, `zone`, or `prov` spotlight),
  `footnote` (sources; say that secrets/ids were left out).
- `PROVIDERS`: `own` is required. Add the main cloud as `cloud` with its real label (`Google Cloud`, `AWS`,
  `Azure`) and a one-letter badge, and `third` for vendors. You may add more (for example a second cloud).
- `CATS` / `KINDS`: keep the ids; adjust labels and `blurb`s to the system's vocabulary; drop unused ones.

---

## 4. Reference — the data format

All of these are declared in the DATA DSL block of the template (do not edit that block).

```js
const META = { title, brand, brandSub, tagline, intro: [..], start: [{ act, id, title, sub }], footnote };
const PROVIDERS = { own: { label }, cloud: { label, badge, color }, third: { label, badge, color } };
const CATS = { id: { label, color, icon, blurb }, ... };
const KINDS = { id: { label, color, speed, dash?, both? }, ... };

layoutRows([ [ { id, name, tag, cat, cols, rows, desc }, ... ], ... ], { gapX: 3, gapZ: 3.2 });
zone(id, name, tag, cat, x, z, cols, rows, desc, { cell, pad, noTitle, titleSize });   // manual placement
nd(id, zoneId, [col, row,] cat, name, tag, icon, h, blurb, { prov, desc, does, facts, tech, paths, notes, span });
e(fromId, toId, kind, label, detail, MINOR);
flow(id, name, blurb, [ [fromId, toId, kind, text], ... ]);
view(nodeId, title, sub, cat)
  .rows([ [ { id, name, tag, cols, rows, desc }, ... ] ])        // or .z(id, name, tag, x, z, cols, rows, desc)
  .n(id, plateId, [col, row,] name, tag, icon, h, blurb, { prov, cat, desc, does, facts, tech, paths, notes, span })
  .e('.local' | 'overviewId', '.local' | 'overviewId', kind, label, detail, MINOR)
  .x('back' | 'front' | 'left' | 'right', ['overviewId', ...]);
```

Geometry: a plate is `cols × 2.2 + 1.8` wide and `rows × 2.2 + 3.7` deep (world units). Rows are centred
automatically. Text fields accept `**bold**` and `` `code` ``; everything else is escaped.

Links: `map.html#<viewId>~<nodeId>` opens a view with a node selected (`#api~api.routes`, `#~stripe`).

---

## 5. Phase C — Validate

```bash
node check.js path/to/your-map.html
```

It evaluates the data region exactly as the browser does and prints **errors** (the map would break or
mis-draw) and **warnings** (quality). Fix all errors. Common ones and their fixes:

| Message | Fix |
| --- | --- |
| `the data region does not evaluate` | A syntax error or an undeclared `const`. Read the stack line; check unbalanced braces/brackets and stray commas. |
| `node X does not fit in zone Z` | The plate is full. Increase `cols`/`rows` for that district or move the node. |
| `nodes A and B share cell` | Two explicit `col,row` collide. Remove explicit cells (auto-placement) or change one. |
| `plates A and B overlap` | Only with manual `zone()`/`.z()` placement. Use `layoutRows`/`.rows()` or increase the distance. |
| `edge … unknown node` | Typo in an id, or an inside-view edge to a local id missing its leading `.`. |
| `edge uses overview node X but it is not listed in .x()` | Add `X` to the view's `.x(side, [...])`. |
| `flow … is not an overview node` | Flows can only hop between overview nodes (not inside-view parts). |
| `unknown icon` / `unknown kind` / `unknown cat` / `unknown prov` | Use one from the lists in this document / your declarations. |

Warnings worth acting on: nodes with no connections (attach them with a `MINOR` link or drop them), `own`
nodes without `paths` (add evidence), overlong names/tags, zones with no nodes, very few flows.

The same validator runs in the browser at load time and prints to the console; a toast appears if there
are errors.

---

## 6. Phase D — Visual QA

Open the file in a browser (a desktop window ≥ 1200 px wide first, then a narrow one). Use the console
hooks for scripted checks: `__arch.navigate('api')`, `__arch.select('postgres')`,
`__arch.startFlow(__arch.FLOWS[0])`, `__arch.goBack()`, `__arch.problems`, `__arch.Engine.scene()`.
(When the tab is hidden, animation frames may stall; keep a `requestAnimationFrame` loop running during
scripted checks.)

Check, in this order:

1. **Console**: no errors; only the validator warnings you decided to accept.
2. **Overview framing**: every plate is inside the viewport with the side panel open; the title row of each
   plate is readable; no plate overlaps another; the middle row reads left → right as the request path.
3. **Labels**: the important blocks have visible labels at the default zoom (labels drop out by collision;
   raise the `h` of a block to prioritise its label). District titles are not cut off.
4. **Connections**: the overview is not a dome of arcs. If it is, mark more edges `MINOR`.
5. **Click the hub**: the detail panel reads well (desc → facts → does → tech → connections → paths). Every
   connection row names a real relationship.
6. **Dive into each inside view**: parts are placed sensibly, ghosts sit on the correct sides, no plate is
   clipped. Press Back; you should land where you were.
7. **Run each flow** with "Play": the path is plausible and the step texts are specific.
8. **Search** three terms a newcomer would type (a product name, a vendor, a technology) — each should hit.
9. **Provider spotlight**: the cloud and third-party chips dim the right blocks.
10. **Narrow window**: the panel becomes a bottom sheet and the map still fits above it.

---

## 7. Phase E — Hand-off report

Tell the user, briefly: where the file is and that it is self-contained; what is in it (districts, counts,
inside views, flows); **what you verified** and how (validator, browser checks, viewport sizes); **what you
did not test**; the notable findings from research (retired components, stale docs, inferred or missing
integrations, credentials found in the repo — reported, never embedded); and that the HTML's data region is
the place to edit later.

---

## 8. Pitfalls (learned the hard way)

- **Picking priority**: blocks win over connections under the cursor — do not add invisible "helper" edges
  across a plate; they still steal hover.
- **Too many arcs**: a hub with 40 connections makes the overview unreadable. Mark everything but the
  primary path `MINOR`; the panel still lists them all.
- **Trusting READMEs**: a tech stack section can list tools that were removed years ago. Confirm against
  manifests and imports.
- **Names vs roles**: a module may keep a retired service's name while acting as a generic client. Describe
  the role; note the residue.
- **Retired things**: they still exist in IaC and docs. Give them one block in Legacy with the retirement
  date/commit, rather than leaving them on the live path or omitting them.
- **Inferred lender/partner/vendor links**: if the repo shows e-mail + spreadsheet export rather than an API,
  model it as an `async` edge with `INFERRED` in `notes`, not as an `api` edge.
- **Overlapping plates in manual layouts**: use `layoutRows` / `.rows()` unless you need a specific shape;
  the validator catches overlaps but not awkward spacing.
- **Long district names** shrink; long node names clip in labels. Keep them short and put detail in `tag`.
- **Secrets in IaC locals**: Terraform/CloudFormation files sometimes hold literal keys. Report them to the
  user; never copy them into the map.
- **Hidden tabs**: scripted browser checks in a background tab see no animation; front the tab or pump
  `requestAnimationFrame`.

---

## 9. Final checklist

- [ ] Data region replaced; both marker lines intact; example data gone.
- [ ] `META`, `PROVIDERS` (with the real cloud label), `CATS`, `KINDS` declared.
- [ ] 8–14 districts laid out with `layoutRows`; the middle row is the request path.
- [ ] 40–100 overview nodes; every `own` node has `paths`; heights use the full range; the hub spans 2 cells.
- [ ] Connections: direction = initiator; secondary ones `MINOR`; every node connected.
- [ ] 5–8 flows, 4–9 steps each, all on overview nodes.
- [ ] 6–12 inside views with ghost neighbours declared in `.x()`.
- [ ] Legacy district holds retired components; `INFERRED` noted where evidence is indirect.
- [ ] No secrets, keys, account/project ids, IPs or personal data in the file.
- [ ] `node check.js` → `OK — no errors`.
- [ ] Browser checks in Phase D done at a wide and a narrow viewport; console clean.
- [ ] Hand-off report written.
