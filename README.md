# proj_window_1 — modular platform shell

| File | Role |
|------|------|
| `index.html` | Markup only (header, workspace, status) |
| `styles.css` | Platform CSS (layout + presentation hooks) |
| `style-registry.js` | `FisStyleRegistry` — style_kind → CSS class |
| `signals.js` | `FisSignals` — SIGNAL_TYPES + dispatch factory |
| `render.js` | `FisRender` — workspace mount + component refresh |
| `platform.js` | Bootstrap: state, package handlers, top-bar wiring |

Package: `../Fis_data/code.js` (`FisPackage`).

Open `index.html` via a local static server (module paths are relative).
