# CLAUDE.md — Soja Tracker

Guidance for AI assistants working in this repository.

## What this is

A React + Vite PWA that tracks the Brazilian soybean market: CEPEA/ESALQ
indicators, CBOT and B3 futures, the Paranaguá export premium, export parity,
the regional physical market by *praça*, and the meal/oil complex (*complexo
farelo/óleo*).

It mirrors the architecture of the sibling Café Tracker / Cana Tracker / ETF
Tracker projects. Deployed on Vercel; pushes to `main` auto-deploy.

**The whole app is in Portuguese (pt-BR)** — UI copy, code comments, identifiers,
commit messages. Keep writing in Portuguese here. (This file is in English only
because it's assistant-facing.)

**Design voice:** "painel de instrumentos" in deep field-green, with a
soy-pod `--accent`, every number in tabular monospace.

## Stack and constraints

| | |
|---|---|
| Language | **Plain JavaScript (ESM)** + JSX. **No TypeScript** — do not add it. |
| UI | React 18, function components + hooks only. |
| Build | Vite 5 (`"type": "module"`) |
| Dependencies | **react + react-dom only.** No UI kit, no chart library, no HTML parser, no state manager. Charts are hand-rolled SVG (`Sparkline.jsx`, `AreaChart.jsx`, `DualChart.jsx`); scraping is done with plain regex. Keep it that way unless asked. |
| Styling | One global stylesheet, `src/styles.css`. No CSS modules, no Tailwind. |
| Tests / lint | **No test runner, no ESLint, no Prettier** — don't invent an `npm test`. What exists is `npm run verificar` (`scripts/verificar.mjs`, dependency-free) plus `npm run build`; CI runs both on every PR. |
| Node | 18+ |

`.npmrc` sets `legacy-peer-deps=true` so Vercel's strict install doesn't fail on
peer-dependency drift. Don't remove it.

## Commands

```bash
npm install
npm run dev        # Vite + the dev /api middleware; host exposed on the LAN
npm run build      # production build
npm run verificar  # loads server/ + asserts the invariants this file declares
npm run preview

node .github/scripts/coletar-cepea.mjs   # run the CEPEA collector by hand
```

**Run both `build` and `verificar` — neither covers the other.** `vite build`
only bundles `src/`, so it never even parses `server/`: a broken import, a
catalogue entry missing a required field, a cache slug orphaned by a rename, or
a constant that drifted out of sync between `server/util.js` and
`Conversor.jsx` all pass the build and fail at request time in production
instead. `scripts/verificar.mjs` is what covers that half, and
`.github/workflows/ci.yml` runs both on every PR.

`vite.config.js` sets `watch: { ignored: ["**/data/**"] }` — the snapshot store
writes `data/snapshots.json` on every quote read, and without this the watcher
reloads the page mid-use and kicks the user back to the "Painel" tab. Don't
remove it.

## Architecture

```
index.html            entry, fonts, PWA tags (lang="pt-BR")
src/
  main.jsx            mounts React + service worker (PROD only, auto-reload on update)
  App.jsx             frame: topbar (brand + USD/BRL), 5 tabs, full-screen Detalhe
  api.js              the only data import for the UI — thin fetch wrappers over /api
  format.js           pt-BR formatting (num, preco, reais, pct, sinal, dataBR, …)
  components/         Painel, Cotacoes, Mercado, Conversor, Alertas, Detalhe + widgets
  styles.css          design tokens at the top, then components
server/
  catalogo.js         the FIXED indicators (futures, CEPEA, export premium)
  datalayer.js        facade — combines all sources, normalises units, builds payloads
  util.js             unit conversions (saca/bushel/ton) + pt-BR parsing
  store.js            "history that grows": daily snapshots per slug
  cepea-cache.json    versioned CEPEA cache + accumulated history (written by CI)
  providers/
    noticiasagricolas.js  PRIMARY source (regex-scraped HTML)
    cepea.js              CEPEA widget + fallback to the versioned cache
    yahoo.js              free history for CBOT soy / meal / oil
    bcb.js                official PTAX FX (USD/BRL, EUR/BRL) with history
    openmeteo.js          rainfall vs. historical average in the producing regions
api/                  Vercel serverless functions: cotacoes, detalhe, cambio, mercado, clima
.github/
  workflows/coletar-cepea.yml   scheduled CEPEA collection (12:00 & 21:00 UTC)
  scripts/coletar-cepea.mjs     the collector itself
.claude/launch.json   dev launch config (npm run dev, port 5173)
public/               PWA manifest + service worker
```

The five tabs in `App.jsx` are `Painel · Cotações · Mercado · Conversor ·
Alertas`, one component each, and `Detalhe` replaces the whole frame when a slug
is selected. `App.jsx` loads `getCotacoes()` **once** and passes `dados` down to
Painel / Cotações / Conversor / Alertas; `Mercado` and `Detalhe` fetch their own
endpoints. So a new field on the `getCotacoes` payload reaches four screens for
free, and the footer `aviso` comes from that same payload.

### The one data path

The UI never fetches a source directly. `src/api.js` exposes five calls:

```
getCotacoes()          -> { fetchedAt, cambio, cepeaCacheEm, fatorSaca,
                            categorias: [{ nome, itens: [...] }], aviso }
getDetalhe(slug, tf)   -> { slug, item, tf, unidadeSerie, pontos, estatisticas,
                            notaHistorico, aviso }
getCambio()            -> PTAX USD/BRL + EUR/BRL
getMercado()           -> índices (1D/30D/12M), margem de esmagamento (crush), séries
getClima()             -> chuva 30d vs. média histórica por região produtora
```

Each maps to same-origin `/api/*`, served **twice from the same module**:

- **dev** — the `devApi()` middleware in `vite.config.js`
- **prod** — the Vercel functions in `api/*.js`

Both import `server/datalayer.js`. Change the payload shape there and both
environments follow. Adding a *new* endpoint means wiring **three** places: a
`datalayer.js` export, the `devApi()` middleware, and a new `api/<name>.js`.
Forgetting the last one means it works in dev and 404s in production.

### The catalogue covers only the fixed indicators

`server/catalogo.js` defines the **7 fixed** indicators, grouped by `CATEGORIAS`
(`FUTUROS`, `CEPEA`, `EXPORTACAO`, `FISICO`, `DERIVADOS`):

| Field | Meaning |
|---|---|
| `slug` | stable id used in `/api` routes, snapshots and the cache — **never rename casually**, it breaks accumulated history |
| `nome`, `descricao` | pt-BR label and explanatory note shown in the UI |
| `categoria` | groups it on the Cotações screen |
| `unidade` | native unit: `USD_BUSHEL`, `USD_SACA`, `USD_TON_CURTA`, `USD_LB`, `BRL_SACA`, `BRL_TON` |
| `moeda` | the unit's display label (`"US$/bushel"`, `"R$/saca"`, …) |
| `fonte` | attribution string shown in the UI |
| `cepeaId`, `cepeaFonte` | CEPEA widget id + its `fonte` query param (`"soja"`) |
| `yahoo` | Yahoo symbol when free history exists |
| `bloomberg` | reference ticker — not fetched, but **displayed** as a pill in Detalhe |

The only derived export is `porSlug`. Note what this catalogue does **not**
have, unlike the sibling Cana Tracker: there is no `periodicidade`, no
`principal`, no `viaWidget`, and no `LIMITE_DIAS_UTEIS` map. Staleness here is a
single flat rule (see below). Don't port those fields over without a reason.

**Most rows on screen are not in the catalogue.** They're built at request time
in `datalayer.js`:

- the **regional physical market** and **domestic meal** rows come from the
  per-*praça* tables scraped in `providers/noticiasagricolas.js`, keyed by a
  generated slug (`slugFisico()` → `fisico-…` / `farelo-…`, accent-stripped)
- `paridade-cbot-brl` and `diferencial-cepea-paridade` are computed

Because physical slugs are generated from municipality + cooperative + group,
changing `slugFisico()` **orphans every snapshot already collected** under the
old slugs. Treat it as a data migration, not a refactor.

To add a fixed indicator: add its catalogue entry, then make sure some provider
can actually read it (a Notícias Agrícolas table match, a `cepeaId`, or a Yahoo
symbol), and add it to the explicit slug lists in `getCotacoes()` — that function
iterates hard-coded arrays (`["cbot-soja", "b3-soja"]`, etc.), it does not walk
the whole catalogue.

### Units: everything becomes R$/saca (or R$/t)

The market quotes soy in four different units at once, so `server/util.js` owns
all conversions. Grain is normalised to **R$/saca de 60 kg**; meal and oil to
**R$/tonelada métrica**.

```
BUSHEL_KG      = 27.2155422    1 bushel de soja
BUSHEL_POR_SACA = 60 / BUSHEL_KG ≈ 2.2046
TON_POR_SACA   = 0.06          60 kg
LB_POR_TON     = 2204.6226
TON_CURTA_KG   = 907.18474     short ton — the CBOT meal unit
```

- `paraReaisPorSaca` / `deReaisPorSaca` — grain, both directions
- `paraReaisPorTon` — meal (`USD_TON_CURTA`) and oil (`USD_LB`)

`parseNumBR` handles pt-BR numbers (`"1.712,39"` → `1712.39`) and returns `null`
for "s/ cotação", `***`, `-`, etc. `isoDeBR` accepts **only** `dd/mm/aaaa` here
(the Cana project's multi-shape version exists because CEPEA publishes weekly
ranges; this app's sources don't).

#### Constants duplicated on purpose

`server/` and `src/` never import from each other — the client only ever sees
JSON from `/api`. So the converter re-implements the arithmetic client-side to
compute as the user types. `BUSHEL_POR_SACA` and `TON_POR_SACA`, plus the
`paraReaisPorSaca`/`deReaisPorSaca` switch statements, exist in **both**
`server/util.js` and `src/components/Conversor.jsx`. Change one, change the
other.

### Derived rows and the oldest-date rule

`getCotacoes()` synthesises two rows, and `getMercado()` a third:

| Row | Formula |
|---|---|
| `paridade-cbot-brl` | `(CBOT + prêmio Paranaguá)` in US$/bushel → R$/saca via PTAX. Falls back to CBOT alone when the premium is missing (the `nome` changes to match) |
| `diferencial-cepea-paridade` | `CEPEA Paranaguá − paridade`. Positive = domestic market paying above export parity |
| `crush` (Mercado) | board crush in US$/bushel: `farelo × 0.022 + óleo × 11 − soja` (1 bushel ≈ 44 lb meal + 11 lb oil) |

**A derived row inherits the OLDEST date of its inputs**, never the newest — it
is only as fresh as its least-updated component. `getCotacoes()` does this
explicitly for both derived rows. Preserve that if you add another.

### Staleness is one flat rule

`anotarData()` tags every item with `data` (ISO), `diasSemAtualizar` and
`desatualizado`, using **business days** and a single `LIMITE_DIAS_UTEIS = 2`
defined at the top of `datalayer.js`. Holidays aren't modelled — the 2-day slack
absorbs isolated national holidays. An item with no parseable date is marked
stale rather than fresh.

### History: three different mechanisms

Only the Chicago futures and FX have free historical series. Everything else has
to be accumulated:

1. **Yahoo** (`providers/yahoo.js`) — real series for `ZS=F` (soy), `ZM=F` (meal)
   and `ZL=F` (oil), by timeframe (`1M · 3M · 6M · 1A · 5A`). Each symbol carries
   an `escala` factor because Yahoo quotes soy and oil in **cents** (÷100) while
   meal is already in dollars — that factor aligns the series with the unit the
   app displays. Get it wrong and the chart is off by 100×.
2. **Local snapshots** (`server/store.js`) — one point per slug per day, written
   on every `getCotacoes()`. Persists to `data/snapshots.json` locally, but on
   Vercel (`process.env.VERCEL`) it lands in `/tmp/soja-snapshots.json` and
   **dies on every cold start**. The local path is anchored to the module's own
   location, not `process.cwd()`; writes are best-effort and swallow errors on a
   read-only filesystem.
3. **Versioned CEPEA cache** (`server/cepea-cache.json`) — written by the
   scheduled GitHub Actions job. This is the **only** history for the CEPEA
   indicators that survives, because it lives in the repo.

`serieCompleta(slug)` in `datalayer.js` merges (2) and (3). When a series is too
short the API returns `notaHistorico` explaining that the chart grows over time —
keep surfacing that honestly rather than faking a series.

Snapshots are recorded under the **real publication date** of the price
(`it.data`), falling back to today only when the source omits it — so a stale
source doesn't fabricate a new daily point.

### Why the CEPEA collector exists (important)

`cepea.org.br` sits behind a Cloudflare anti-bot challenge that returns **403 to
Vercel functions in every region**, but responds normally from GitHub Actions
runners. Here CEPEA is the *fallback* (Notícias Agrícolas is primary), so without
the collector production simply loses its safety net. So:

- `.github/workflows/coletar-cepea.yml` runs twice a day (12:00 and 21:00 UTC =
  9h/18h Brasília) and on `workflow_dispatch`.
- `.github/scripts/coletar-cepea.mjs` reads every catalogue entry with a
  `cepeaId` (4 attempts each with escalating backoff — the first 403 per run is
  expected), keeps the previous value on failure, appends to the history, and
  writes `server/cepea-cache.json`. It only fails the job if **nothing** was
  collected.
- The workflow commits the file with `github-actions[bot]`, and that commit
  triggers a fresh Vercel deploy — that's how new data reaches production.
- In dev the app reads CEPEA live; in production it falls back to the cache.

Consequences to remember: expect frequent bot commits touching
`server/cepea-cache.json`; and GitHub suspends scheduled workflows after 60 days
of repo inactivity (re-enable in the Actions tab).

`providers/cepea.js` loads the JSON via `createRequire` rather than `fs` **on
purpose** — a static require makes Vercel's file tracer bundle the JSON into the
function. Don't "modernise" it to `readFile`.

## Scraping is best-effort — treat it as such

`providers/noticiasagricolas.js` parses server-rendered HTML with regex,
associating each `<table>` with the nearest preceding `<h1>`–`<h4>`. Several
headings contain each other ("Soja - Bolsa de Chicago" is a substring of "Farelo
de Soja - Bolsa de Chicago"), so matching is always via an **anchored regex on
the distinguishing fragment** — keep it that way. The real per-price date comes
from the `"Atualizado em: dd/mm/aaaa"` footer that the page prints **inside** each
table, not from the fetch time. If the source's HTML changes, this file is where
the fix goes; Yahoo and the CEPEA widget reinforce the headline numbers.

Provider caches are in-process with TTLs (10 min Notícias Agrícolas/Yahoo,
30 min CEPEA widget/BCB, 12 h climate). Be gentle with these free sources — the
collector even sleeps 800 ms between reads.

## Conventions

- **Portuguese everywhere** — identifiers (`carregar`, `pontos`, `desatualizado`,
  `arred`), UI copy, and comments. Don't mix in English names.
- **Comments explain *why*.** Every module opens with a header comment stating
  its job and the reasoning behind non-obvious choices (why the collector
  exists, why `/tmp` is ephemeral, why the watcher ignores `data/`). Match that
  density — it's the house style.
- **Numbers go through `src/format.js`** (`num`, `preco`, `reais`, `pct`,
  `sinal`, `dataBR`, `dataCurtaBR`, `horaBR`) and render with the mono class.
  `num(v, casas)` switches to up-to-4 decimals when `casas > 2` — used for FX and
  for US$/bushel. `Intl` locale is `pt-BR`; times use `America/Sao_Paulo`.
- **Design tokens only** — the custom properties at the top of `src/styles.css`.
  No hard-coded hexes or pixel gaps in components.
  - surfaces `--bg` `--surface` `--surface-2` `--line`
  - text `--text` `--muted`
  - semantics `--up` `--down` `--accent` `--accent-2`
  - type `--display` (Space Grotesk) `--ui` (Inter) `--mono` (IBM Plex Mono)
  - layout `--s1`…`--s7` (4→48px) `--radius` `--maxw`

  Soy-green `--accent` is for the active tab and focus only.
- **Loading / error / empty states** come from `components/States.jsx`
  (`Loading`, `Skeletons`, `ErroBox`, `Vazio`). Extend those rather than
  hand-rolling.
- **Server does the maths; components display.** Conversions, parity, crush,
  staleness and statistics belong in `server/util.js` / `server/datalayer.js`.
  The one deliberate exception is the Conversor's live client-side arithmetic.
- **Missing data is `null`, rendered as `—`.** Providers return `null` rather
  than guessing; `Promise.allSettled` and `try/catch` keep one dead source from
  blanking the screen. `varDias()` returns `null` when the series doesn't reach
  the requested window, so a 3-day-old snapshot series never shows a fake "30D".
  Never substitute an invented number.
- Effects that set state use a local `vivo`/`active` flag to avoid updating an
  unmounted component.

## Honest-caveats rule

The README lists real limitations: history for CEPEA, the premium and the
physical market grows from daily collection; export parity and the differential
are **didactic approximations** (no port costs, freight or taxes; no Santos
official differential); the scrape can break. Every screen carries the
`aviso`/footer disclaimer: public sources, possibly delayed, informational
only — **not investment advice**. If you add a feature with a similar caveat,
state it in the UI and the README instead of implying more precision than free
data supports.

## Deployment notes

- `api/*.js` are Vercel functions: `export default async function handler(req, res)`,
  params off `req.query`, 400 on a missing param, 502 on upstream failure. Keep
  them thin. Cache windows follow how fast the data moves: `cotacoes`, `detalhe`,
  `cambio` and `mercado` use `s-maxage=600, stale-while-revalidate=3600`; `clima`
  uses `s-maxage=21600, stale-while-revalidate=86400` (6 h / 24 h), because
  rainfall updates daily at best. Copy the neighbour that resembles your endpoint.
- `getDetalhe(slug, tf)` defaults to `tf = "3M"` in both `src/api.js` and the
  datalayer. Only the three CBOT slugs have a real timeframe-capable series.
- The service worker (`public/sw.js`) is **network-first for navigation** (always
  fetch the fresh `index.html`, fall back to cache only offline), **cache-first
  for hashed `/assets/*`** (immutable, the filename changes each build), and
  never caches `/api/*`. Note the naming is the inverse of the sibling ETF
  Tracker: here `CACHE` is the version string to bump (`"soja-tracker-v1"`) and
  `SHELL` is the list of precached paths.
- `src/main.jsx` registers that worker in production, checks for updates hourly,
  and reloads **once** when a new version installs over an existing controller —
  so users of the installed PWA pick up deploys automatically.
- Alerts are stored per device in `localStorage` under `soja-tracker-alertas`,
  read/written directly in `components/Alertas.jsx` (no store module).
- A broken change fails the Vercel build and the previous deploy stays live;
  `npm run build` locally is still the right pre-push check.

## Git

- Develop on the branch you were given; commit with clear pt-BR messages; push
  with `git push -u origin <branch>`.
- Don't open a PR unless the user asks.
- Expect automated `github-actions[bot]` commits touching
  `server/cepea-cache.json` — rebase/pull before pushing rather than fighting
  them, and don't hand-edit that file.
- No API keys are needed: every source (Notícias Agrícolas, CEPEA, Yahoo, BCB,
  Open-Meteo) is free and key-less. `.env` is gitignored; don't add a secret
  without asking.
