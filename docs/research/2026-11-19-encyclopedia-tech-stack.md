# Game Encyclopedia Site: Tech Stack Research

_Researched 19 November 2026 as a starting point for building a Wowhead-style encyclopedia on top of the engine. Version numbers, limits and dates were current at the time; re-check them before relying on them._

## Context

- The engine is a **C# reimplementation that supports several games**, and it already has parsers for each game's data files.
- The goal is a Wowhead-style encyclopedia built from that datamined data:
  - a page per entity (items, monsters, spells, NPCs, quests, zones, and so on)
  - cross-references ("dropped by", "rewarded from", "used in")
  - hover tooltips
  - full-text search and filtered finders ("all swords level 20–30 with fire damage")
  - interactive maps and viewers
  - data tracked per game build, with patch-to-patch changes
- A static site is preferred because the content is a read-only data repository, but a server is acceptable.

## Recommendation

1. **The contract is a SQLite export.** A C# `export` command in the engine solution writes one SQLite file per game per build, plus extracted assets. Everything else reads from that.
2. **The site is ASP.NET Core with Razor components rendered on the server** (static server rendering, no interactive Blazor modes), with htmx for interactivity and a CDN in front.
3. **The same components can also produce a static site.** `HtmlRenderer` renders Razor components outside an HTTP request, so a small console app can write every page to `dist/` for a static host. Start static if the page count allows; switch to server mode when size or features (comments, user lists) call for it.
4. **The engine's own code runs in the browser** via .NET WebAssembly, for map viewers, sprite/model viewers and calculators.
5. **Companions:** Pagefind (static) or SQLite FTS5 (server) for search, a small tooltip script with per-entity JSON, and Datasette for browsing the raw tables.
6. **Fallback:** if the interface becomes JavaScript-heavy, Astro can read the same SQLite export. Nothing in the data layer has to change.

Why this over a JavaScript static site generator: the whole stack stays in C#, the site can reference engine assemblies and types directly, and the static and server modes share one set of templates.

## Architecture

```
game files
   │
   ▼
Engine parsers (C#, existing)
   │
   ▼
Encyclopedia.Export ──► data/<game>/<build>.sqlite  +  assets/<game>/<build>/...
                              │
          ┌───────────────────┼───────────────────────┐
          ▼                   ▼                       ▼
 Encyclopedia.Web      Encyclopedia.Static        Datasette
 (ASP.NET Core,        (HtmlRenderer → dist/,     (raw tables,
  server mode,          then Pagefind)             SQL, CSV/JSON)
  behind a CDN)
```

Suggested projects (adjust to the existing solution layout):

| Project | Kind | Job |
|---|---|---|
| `Encyclopedia.Export` | console | Engine → SQLite + assets, per game and build |
| `Encyclopedia.Data` | library | Read-side queries over the SQLite files (Microsoft.Data.Sqlite + Dapper, or EF Core) |
| `Encyclopedia.Components` | Razor class library | Page and partial components, shared by Web and Static |
| `Encyclopedia.Web` | ASP.NET Core | Routes, tooltip JSON endpoints, htmx partials, caching |
| `Encyclopedia.Static` | console | Renders every route to `dist/` with `HtmlRenderer`; writes tooltip JSON |
| `Encyclopedia.Wasm` | browser-wasm | Engine pieces exposed to JavaScript with `[JSExport]`, for viewers and calculators |

## The data contract (SQLite)

- **One file per game per build**: `data/<game>/<build>.sqlite`. The site opens them read-only.
- **Shared conventions, game-specific tables.** Every entity table has `id`, `name`, a URL `slug` and a `content_hash` of its row. Each game keeps its own columns and tables beyond that.
- **Cross-references are tables** (for example `drops(monster_id, item_id, chance)`), so both directions are one indexed query.
- **A `build_info` table** records the game, build id, export time and engine commit.
- **`content_hash` does two jobs**: the static exporter skips unchanged pages, and comparing two builds by `id` + hash produces "changed in build X" pages.
- **Assets** (icons, sprites, map tiles) are converted to web formats by the exporter and served from object storage or a separate asset host, not bundled into every site build.
- **Indexes match the filters the finders need.** That matters for server queries, and it's essential if a database is ever queried over HTTP range requests (see Search and finders).
- **The export is deterministic** (stable ordering, stable ids), so hashes and diffs mean something.

## Site: ASP.NET Core

- **Runtime:** .NET 11 shipped on 10 November 2026 as a Standard Term Support release; .NET 10 is the LTS. Both are supported until November 2028, so either works. .NET 8 and 9 reached end of support the same day.
- **Rendering:** Razor components with static server rendering. Avoid Blazor's interactive render modes for public pages: interactive server mode keeps a live connection open per visitor, and interactive WebAssembly mode makes every visitor download the .NET runtime before the page works. Neither suits a public, read-heavy site.
- **Interactivity:** htmx for filters, tabs, pagination and partial page updates. htmx 4.0 was released on 28 August 2026 (fetch-based, built-in morph swaps, `<hx-partial>` for multi-target responses). npm keeps 2.x as `latest` until early 2027, so pin `htmx.org@4` explicitly.
- **Routes (suggested):** `/{game}/{kind}/{id}/{slug}` for entities, `/{game}/{kind}` for lists, `?build=` for older builds, and `/{game}/tooltip/{kind}/{id}.json` for tooltips. URLs are identical in server and static modes.
- **Caching:** data only changes when a new build is exported, so responses can be cached hard per build (output caching, long `Cache-Control`, a CDN in front). Purge or version by build id on deploy.
- **Hosting:** any small VPS or container host behind a CDN. For scale: Garland Tools (FFXIV) says its site needs a simple LAMP stack and minimal resources, even at very high visitor counts.

## Static export mode

- `HtmlRenderer` (ASP.NET Core 8 and later) renders Razor components outside an HTTP request, to a string or stream. Microsoft's docs list generating static site content as one of its uses.
- `Encyclopedia.Static` iterates every entity id in the SQLite files, renders the page component to `dist/<same route>/index.html`, writes the tooltip JSON, then runs Pagefind over `dist/`.
- **Incremental builds come almost free:** keep a manifest of `route → content_hash` from the last build and skip unchanged pages.
- **Host limits decide when static stops being practical.** Count pages, tooltip JSON and any assets in the deploy:
  - Cloudflare Workers static assets: 20,000 files per version on Free, 100,000 on Paid, 25 MiB per file.
  - Cloudflare Pages: 20,000 files on Free; 100,000 per site on paid plans since 23 January 2026.
- **Rule of thumb:** stay static while the file count sits comfortably under the host's limit and builds take a tolerable time. Switch to server mode beyond that, or as soon as user features are wanted.

## Tooltips

- A small framework-free script (`tooltips.js`): when you hover a link matching the entity URL pattern, it fetches `/{game}/tooltip/{kind}/{id}.json`, renders it and caches it in memory.
- Keep it independent of the site so other sites can embed it later, the way Wowhead's tooltips work.
- The same code produces the JSON in both modes (an endpoint in server mode, a file in static mode).

## Search and finders

- **Full-text, static:** Pagefind indexes the built HTML into chunks, so a search loads only part of the index; on a 10,000-page site the total network payload stays under 300 kB. It also has Node and Python indexing APIs for indexing data directly, and supports filters.
- **Full-text, server:** SQLite FTS5 tables in the export, with results returned through htmx.
- **Filtered finders, server:** plain SQL against the export.
- **Filtered finders, static:** sql.js-httpvfs queries the SQLite file from the browser over HTTP range requests; one write-up measured about 1 KB transferred for a key lookup against a 670 MB database. Every query must use an index, because a table scan downloads the whole table. Prepare the database (small `page_size`, `VACUUM`, `optimize` on FTS tables) and check queries with `EXPLAIN QUERY PLAN`.

## Engine code in the browser (.NET WebAssembly)

An engine reimplementation can offer something Wowhead can't: map viewers, sprite/model viewers and calculators that run the engine's real loaders and formulas.

- .NET runs in the browser without Blazor: mark methods with `[JSExport]`/`[JSImport]` and build a `browser-wasm` project (the `wasmbrowser` template; `wasm-tools` workload).
- Load it lazily, only on pages that have a viewer or calculator, because the .NET runtime is a multi-megabyte download. Measure the size early.
- Microsoft still labels some of the browser templates experimental (`wasm-experimental` workload), so pin the .NET version for this project and keep the JavaScript glue thin.
- Keep the WebAssembly build to pure logic (parsing, formulas, drawing to a canvas), with file access and platform code left out.

## Raw data: Datasette

- Point Datasette at the same SQLite files and you get faceted browsing, SQL queries and CSV/JSON export with no code. That's useful for dataminers, and as a debugging tool for the export.
- It's still pre-1.0 (1.0a43 shipped 15 November 2026), so pin the version. Datasette Apps can host custom HTML applications inside an instance if a few bespoke views are wanted there.
- It's a companion to the site, not the main site.

## Alternatives considered

| Option | Verdict | Notes |
|---|---|---|
| **Astro** reading the SQLite export | Best fallback | Astro 7 rewrote its compiler in Rust, and Astro's own benchmarks show builds 15–61% faster. 7.2 added experimental incremental builds via a per-path `cacheKey` from `getStaticPaths()`. Each route can be prerendered or rendered on demand. Cloudflare acquired Astro in January 2026; it remains open source. Not the primary choice because it adds a second language and toolchain and can't reuse engine code on the server. |
| **Hugo** | Viable, not preferred | Fastest builds. Content adapters (v0.126+) create pages from data, and a multidimensional content model (0.153+) covers versions as well as languages. But cross-references are awkward in Go templates, content adapters can't call `.Site.Pages` because the site isn't fully built at that point, and interactive parts need a separate JS build. |
| **Custom static site generator** | Already covered | Static export mode is effectively this, using Razor instead of an invented template system. |
| **Eleventy / Build Awesome** | Skip for now | Rebranded as Build Awesome under Font Awesome in March 2026; its direction isn't settled. |
| **SvelteKit** | Peer of Astro | Only worth it if the interactive parts grow big enough that one component framework everywhere is wanted. |
| **Next.js** | Skip | In one 100,000-page benchmark it took 264.5 s and produced 1.84 GiB, versus Astro's 22.6 s and 47 MiB. |
| **Observable Framework** | Partial fit | Build-time data loaders in any language. Good for analysis pages (stat curves, drop rates, patch comparisons), not for tens of thousands of entity pages. Observable Cloud hosting was deprecated in April 2025, so you'd host the output yourself. |
| **MediaWiki + Bucket / Cargo / Semantic MediaWiki** | Different product | The choice if the goal becomes a community-edited wiki around the data. The Old School RuneScape wiki runs Bucket, a lightweight Lua interface for structured data. Heavy to run. |
| **Interactive Blazor (Server or WebAssembly) for the whole site** | Skip | Either a live connection per visitor or a large download up front; the wrong shape for public, read-heavy pages. |

## Scale reference points

- A synthetic benchmark built 100,000 Astro pages in 22.6 s. Real sites are slower.
- A 339,000-page Astro site was tuned from 35 to 127 pages per second.
- FreeDevTools moved 125,000+ pages from static Astro to server rendering after static builds stopped scaling.
- Cloudflare D1 (only relevant to an edge-rendered Astro variant): 10 GB per database on Workers Paid, 500 MB on Free.

## Prior art worth studying

- **AoWoW:** the open-source Wowhead clone, a database viewer for TrinityCore-based servers, written in PHP + MySQL on top of Wowhead's JS engine. https://github.com/Sarjuuk/aowow
- **Garland Tools (FFXIV):** a Visual Studio solution converts game client files into the database behind a LAMP site, and its contribution guide documents the pipeline. https://github.com/ufx/GarlandTools
- **XIVAPI (FFXIV):** an open-source web API over the game data, used for everything from tooltips to full database apps. https://v2.xivapi.com/docs/welcome/
- **WoW.tools:** an open-source datamining tool for WoW. https://warcraft.wiki.gg/wiki/Wow.tools
- **Spelunker:** a database explorer for WoW servers, with an API and a web client. https://github.com/wowserhq/spelunker

## Open questions to settle first

1. **Entity counts** per game, and how many builds stay online. This decides static or server at launch.
2. **User features** (comments, guides, saved lists)? If yes, use server mode from day one.
3. **Ops appetite:** free static hosting, or a small server behind a CDN.
4. **Asset policy:** which extracted content (icons, sprites, models, text) gets published, and what's left for users to supply from their own game files. This affects both the exporter and the hosting setup.
5. **Localization**, if the games ship in several languages.

## Suggested first milestones

1. `Encyclopedia.Export` for one game and two or three entity types with one cross-reference (for example items, monsters and drops), including `content_hash`, `build_info` and assets.
2. Browse the result in Datasette to sanity-check the schema.
3. `Encyclopedia.Web`: list and detail pages for those types, tooltip JSON plus `tooltips.js`, and FTS5 search.
4. `Encyclopedia.Static`: render the same routes to `dist/`, run Pagefind, and deploy to a static host.
5. Add a second game to test the shared conventions.
6. Build the first WebAssembly widget from engine code (for example a map viewer).
7. Add a patch-diff page between two builds.

## Sources

**.NET / ASP.NET Core**
- .NET 11 release and support: https://infoq.com/news/2026/11/dotnet-11-release
- .NET 10 / 11 support windows: https://startdebugging.net/2026/11/dotnet-11-is-generally-available-what-to-change-in-your-project/
- Rendering Razor components outside ASP.NET Core (`HtmlRenderer`): https://learn.microsoft.com/en-us/aspnet/core/blazor/components/render-components-outside-of-aspnetcore
- Running .NET from JavaScript (`[JSImport]`/`[JSExport]`): https://learn.microsoft.com/en-us/aspnet/core/client-side/dotnet-interop
- Running .NET in the browser without Blazor: https://andrewlock.net/running-dotnet-in-the-browser-without-blazor

**htmx**
- htmx 4.0.0 release: https://four.htmx.org/announcements/2026-08-28-htmx-4.0.0-is-released
- htmx 4 coverage: https://www.infoq.com/news/2026/09/htmx-4-released/

**Astro, Hugo and other site generators**
- Astro 7 / 7.1 / 7.2 performance and incremental builds: https://infoq.com/news/2026/08/astro-7-release-speed
- Astro blog (7.2 announcement): https://astro.build/blog
- Astro 6 and the Cloudflare acquisition: https://heise.de/-11207142
- Hugo content adapters: https://gohugo.io/content-management/content-adapters/
- Hugo multidimensional content model: https://www.docsy.dev/blog/2026/hugo-0.152.0+/
- Eleventy becomes Build Awesome: https://www.11ty.dev/blog/build-awesome/
- 100,000-page framework benchmark: https://dev.to/lazarv/time-to-yield-20m8
- Tuning a 339k-page Astro site: https://www.bitdoze.com/astro-ssg-build-optimization/
- FreeDevTools moving from static to SSR: https://dev.to/lovestaco/when-static-sites-stop-scaling-migrating-freedevtools-125k-pages-from-static-astro-to-ssr-1hf5
- Observable Framework: https://observablehq.com/framework/
- Observable Cloud data apps deprecation: https://old.observablehq.com/documentation/data-apps/

**Hosting limits**
- Cloudflare Workers limits: https://developers.cloudflare.com/workers/platform/limits
- Cloudflare Pages 100k file limit (Jan 2026): https://developers.cloudflare.com/changelog/product/pages/
- Cloudflare D1 limits: https://developers.cloudflare.com/d1/platform/limits

**Search and data tools**
- Pagefind: https://www.pagefind.app
- sql.js-httpvfs: https://github.com/phiresky/sql.js-httpvfs
- sql.js-httpvfs write-up (670 MB database example): https://recca0120.github.io/en/2026/03/07/sql-js-httpvfs-static-hosting/
- Datasette 1.0a43: https://simonwillison.net/2026/Nov/15/datasette/
- Datasette Apps: https://github.com/datasette/datasette-apps

**Wikis**
- MediaWiki Bucket extension: https://www.mediawiki.org/wiki/Extension:Bucket
- OSRS wiki extension list: https://oldschool.runescape.wiki/w/Special:Version
