# 3D Architecture Map

A self-contained viewer for an interactive 3D map of a software system: people, apps, services, data stores, cloud and third-party services, delivery, and tooling. The result is one HTML file with no external scripts, fonts, or network calls. Send it as an attachment, drop it in a repo's `docs/` folder, or host it anywhere static.

Licensed under the [MIT License](LICENSE).

## What's in this folder

| File | What it is |
| --- | --- |
| `template.html` | The complete viewer (engine and UI) with a small fictional example dataset. Copy it and replace the example. |
| `check.js` | A dependency-free Node script that validates the data you wrote. |
| `INSTRUCTIONS.md` | How to research a repository and fill in the map. |
| `chat.test.js` | Tests for the chat's retrieval and navigation rules (`node --test chat.test.js`). |
| `LICENSE` | The MIT license text. |

## Quick start

1. Copy `template.html` to where the map will live, for example `docs/architecture/<system>-architecture-3d.html`.
2. Replace the example between `BEGIN ARCHITECTURE DATA` and `END ARCHITECTURE DATA`. Keep both marker lines as they are.
3. Validate until there are no errors:

```bash
node check.js path/to/your-map.html
```

`check.js` needs Node 18 or newer and has no dependencies. Exit code 0 means no errors. Warnings can still print.

4. Open the HTML file in a browser.

The full workflow — research, data format, validation messages, and visual checks — is in [INSTRUCTIONS.md](INSTRUCTIONS.md).

## What the viewer shows

Everything on the page comes from the data region. You do not edit the engine or the UI.

- **Overview.** A 3D city. Each district is a layer of the system. Each system is a block whose height encodes importance and whose color encodes its category.
- **Inspect.** Click a block, connection, or district for a description, facts, tech, links, and the repository paths that support it.
- **Dive in.** Systems with an inside view open into a smaller city, with ghost blocks of their neighbors still visible.
- **Guided flows.** A numbered path through one scenario, such as a checkout or a deploy.
- **Search, filters, and links.** Provider spotlight, layer and connection-type toggles, a back history, and shareable links of the form `map.html#<view>~<nodeId>`.

The example dataset is fictional ("Acme Commerce"). Delete it and describe the real system. Do not put secrets, keys, account identifiers, or personal data in the map.

## Chat about the map

The bottom-centre button opens a chat that answers questions about the map's own data and offers to take you to the system, district or flow it describes. It runs a small language model on your GPU inside the browser through [WebLLM](https://github.com/mlc-ai/web-llm); nothing is sent anywhere.

- Requirements: WebGPU with `shader-f16` (Chrome, Edge, or Safari 26 on Apple silicon). Without it the chat still answers from the map data in a reduced "facts mode".
- Download: about 970 MB once for the default model (Qwen3 1.7B) or about 340 MB for the Fast tier (Qwen3 0.6B). The browser caches the weights; later visits load in a few seconds. Nothing downloads until you click **Load model** or ask a question.
- Speed: on an Apple M2 Pro the default model answers in about 3 seconds; the Fast tier in about 2.
- Privacy: the runtime comes from jsDelivr and the weights from Hugging Face; questions and the map data never leave the browser.
- The models (Qwen3, Apache-2.0) and the runtime are fetched at run time and are not part of this file.
- Optional: `META.chat` in the data region can override `models`, `runtimeUrl`, `maxTokens`, `contextBudget` and `latencyLimitMs`.

Tests for the retrieval and navigation logic: `node --test chat.test.js`.

## License

Copyright (c) 2026 Amir Zucker. Released under the [MIT License](LICENSE) (SPDX identifier: `MIT`).

The MIT License requires the copyright and permission notice to be kept in all copies or substantial portions of the software. The notice is embedded at the top of `template.html` (and a short SPDX header is at the top of `check.js`) so it travels with those files when you copy them without this folder. Leave it in place when you make a map from the template.

The template is self-contained and bundles no third-party code, fonts, or assets, so there are no additional third-party license notices to carry along.
