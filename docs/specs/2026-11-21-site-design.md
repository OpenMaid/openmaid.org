# Site design

**Date:** 2026-11-21
**Status:** accepted by the user on 2026-11-21 ("Go ahead and approve it and get started"), after they decided its
questions (§14). Nothing is built yet.
**How it was decided:** the user's outline (`Site Ideas.md` at the workspace root, beside this repository), a
research note on the stack written by another session on 2026-11-19 (kept here as
`docs/research/2026-11-19-encyclopedia-tech-stack.md`), and the user's answers of 2026-11-21 (§3.1).
**Builds on:** the Open Maid Engine's game data export design, in the OME repository at
`docs/superpowers/specs/2026-11-21-game-data-export-design.md` (cited below as "export §n"). That design owns
everything this site reads: the game export and the reference bundle. This one owns how the site shows them.
**Direction:** OME's backlog item "A project site with each game's data as a knowledge base" (2026-11-19).

**Not verified.** Each is work for the first milestones:

- the versions and limits the research note gives (Astro 7, Starlight, Pagefind, the hosts' file limits). They
  were current on 2026-11-19; check each before relying on it;
- that one Astro project serves the reference section through Starlight and the home page and the database as
  ordinary pages, with one search index over both (§5);
- the page and file counts of §10.3, which are estimates from the record counts in OME's
  `docs/kamidori-data-tables.md`, not from an export.

## 1. Purpose and scope

### 1.1 The site

One domain for the Open Maid Engine (OME), in three sections:

- **Home:** what OME is, the games it supports and how far, where to get it and where to buy the games.
- **The modding reference:** OME's guides for modders, and a page for each thing a modder names: an opcode, a
  global, a record table, a patch point, an event, a game script.
- **The game database:** a page for each thing in a game's data, in the manner of Wowhead and the games' wikis:
  items, units, skills, quests, recipes and the rest, with links both ways between them, hover tooltips, search
  and filtered lists. Kamidori first.

The user sees the reference and the database as two sites. They share a domain, a header and a look, and link to
each other: the database's modder mode (§8.7) names every table, field and script it shows, and each name links
to its reference page.

### 1.2 What this design delivers

- the URL map of the domain (§4);
- the stack and why (§5);
- what each section shows and where its content comes from (§6 to §8);
- how comments fit in later (§9);
- where the game data lives, and how the site is built and deployed without it entering a public repository
  (§10).

### 1.3 Not in this design

- **What OME exports, and how.** The export design owns the exporter, the entity declarations, the content rule,
  the SQLite format and the reference bundle. This site reads them.
- **Comments in detail.** §9 fixes what has to be right from the start (stable keys, same origin). Accounts,
  moderation and storage get their own design when comments are scheduled.
- **Interactive viewers** (maps that pan, calculators that run game formulas). The export renders maps to
  pictures; a viewer is future work (§13).

## 2. What there is to build on

- **OME's documentation**, in its repository: `docs/modding/` (the guides, generic across games, with a page for
  each game under `docs/modding/games/`), and generated references for opcodes, globals, patch points and the
  supported games. The reference bundle (export §8) carries them, with the registries' structured data, so this
  site renders pages from data rather than from the large generated markdown files.
- **The game export** (export §7): one SQLite file for each game revision, with pictures beside it. It holds the
  entities, their text in each exported language, the references between them, and what modder mode shows.
- **Prior art** the research note lists: Wowhead and its open clone AoWoW, Garland Tools and XIVAPI for Final
  Fantasy XIV, WoW.tools, Spelunker.

## 3. Decisions

### 3.1 The user's (2026-11-21)

- **One domain.**
- **The database starts with Kamidori.**
- **Comments "would be nice eventually":** the data shows what a quest asks and pays, and players answer what it
  cannot, such as how to complete it.
- **No scene text.** The games are visual novels, and their story text "may cross the line". Quest text and the
  rest of the data fill the niche of Wowhead and the existing wikis, including the text information screens show
  for a record: descriptions, the glossary, character profiles, chapter objectives (export §5.7). The rule is about
  the story scenes, "due to the nature of this being a VN". The export enforces it (export §5.5); the site shows
  only what the export holds.
- **The site lives in its own repository**, this one, beside OME's (`S:\Game Hacking\Eushully\Himegari\ome-site`).
  OME keeps the exporter, the entity declarations and the docs.
- **The stack is open**, and the site need not be static. Then, answering §14: "We can try astro and starlight".
- **An age notice:** "these are adult titles" (§8.10).
- **No spoiler warnings:** "determining that for different entities and games would be wonky (what constitutes
  late game after all)".
- **Kamidori's English text is published, tentatively**, and taken down if asked (§8.6).
- **The domain is a placeholder** for now: `ome.example`. The user sets up the GitHub repository later.

### 3.2 This design's

- **The export and the reference bundle are the only inputs.** The site reads no game file and runs no engine
  code. A page that needs a fact the export lacks is a change to the export design first.
- **Pages are built ahead of time** while the site has no comments. Comments are added as a service on the same
  domain that pages call after they load (§9), so pages stay built ahead even then.
- **The stack is Astro, with Starlight for the reference section** (§5). The user agreed to try it; the first
  milestone is the trial (§13).

## 4. The URL map

| Path | Section | Shows |
|---|---|---|
| `/` | home | the project, the games and their support levels, downloads |
| `/docs/` | reference | the guides |
| `/docs/reference/opcodes/<op>` | reference | one opcode, by build |
| `/docs/<game>/globals/<name>` | reference | one global of a game |
| `/docs/<game>/tables/<table>` | reference | one record table: its fields, what a data file may change |
| `/docs/<game>/patch-points/<name>`, `/docs/<game>/events/<name>` | reference | one patch point, one base mod event |
| `/docs/<game>/scripts/<name>` | reference | one game script (export §8.2) |
| `/<game>/` | database | the game's front page: its kinds, search |
| `/<game>/<kind>/` | database | the list of a kind, with filters |
| `/<game>/<kind>/<id>/<slug>` | database | one entity |
| `/<game>/tooltips/<kind>.json` | database | every tooltip of a kind (§8.5) |
| `/api/…` | comments, later | §9 |

- `<game>` is OME's game id (`kamidori`). `<kind>` and `<id>` are the export's stable entity key (export §5.6). The
  slug is made from the entity's name, is only for people, and a wrong or missing slug redirects to the right one.
- Game ids, `docs` and `api` share the first path segment, so a game id may never be `docs` or `api`. OME's game
  ids are short lower-case names, so this costs nothing.
- **Older versions.** The reference for an older OME release is under `/docs/<version>/`, built from that
  release's bundle. An older game revision's database is under `/<game>/<kind>/<id>/<slug>?rev=<revision>` while
  the site is built ahead of time only for the revisions §10.1 lists.

## 5. The stack

### 5.1 The choice

- **Astro**, building the whole site ahead of time to static files.
- **Starlight**, Astro's documentation theme, for the reference section: navigation, a table of contents, code
  highlighting, search and translation of the interface come with it.
- The home page and the database are ordinary Astro pages in the same project, sharing the header and the look.
- **Pagefind** for full-text search: Starlight uses it already, and it indexes the built pages in chunks, so a
  search loads a small part of the index.
- The database reads the SQLite export at build time through a Node SQLite reader.

### 5.2 Why

- **The reference section is documentation**, and a documentation framework gives it what a hand-built one would
  take weeks to match: sidebars from the folder tree, versioned sections, search, anchors, admonitions.
- **One project, one toolchain** for every page. The tooltip script, the header and the theme are written once.
- **C# would buy nothing here.** The research note's case for an ASP.NET site was that pages could use the engine's
  types. With the export as the only input, the site never touches them; the C# work is in OME's exporter, where
  the engine runs.
- **Built ahead, the site is cheap and quick:** a static host, a CDN, nothing to patch on a server.
- **It does not close the door on a server.** Astro renders a route on request where its adapter runs on a server,
  so the comments' API (§9) can be part of this project, or a separate service.

### 5.3 What it costs

- A Node toolchain beside OME's .NET and Python. It lives in this repository only.
- Build time grows with the page count. §10.3 estimates it stays small for years; the research note's numbers put
  100,000 Astro pages at well under a minute on a synthetic benchmark.

## 6. Home

- What OME is, in a few paragraphs, and screenshots of the supported games running in it.
- The supported games, each with its support levels on OME's two tracks (play P0 to P4, modding M1 to M3), from
  the reference bundle's games data (export §8.1).
- Downloads: links to OME's GitHub releases, with the latest version's packages named.
- Where to buy each game, from its OME manifest.

## 7. The reference section

### 7.1 Guides

The guides are OME's `docs/modding/` pages as the bundle carries them, under `/docs/`. OME edits them in the
same change as the code they describe; this repository never edits a guide. The build maps their relative links
to site links, and fails on a link it cannot map.

### 7.2 Reference pages

One page for each entry of OME's registries, rendered from the bundle's structured data:

- **opcodes**, with each build's facts side by side (4.24J, 4.33G, 4.38D): name, operands, what it does, what the
  port does with it;
- **globals**, by game: name, address, type and shape, what it means, the record table it belongs to;
- **record tables**, by game: fields, what each holds, what a data file may change, the table's old names;
- **patch points and events**, by game: where each is, what is true there, what a handler may do;
- **game scripts**, by game (export §8.2): what each does, its arguments, the globals it reads and writes, what
  calls it and what it calls, the patch points in it.

Each page links to the others it names, and a record table's page links to the database's list of the kind built
from it.

### 7.3 Versions

The reference shows the latest OME release at `/docs/`. A release whose modding interface changed keeps its
reference under `/docs/<version>/`, built from its own bundle. The site's build lists which releases it keeps.

## 8. The database

### 8.1 Kinds differ by game

Each game declares its own kinds in OME (export §5.2): Kamidori has quests and recipes, Arterial has cards and
decks, Himegari has neither. The site has one generic template for each page type, driven by the export's
description of each kind: which field names it, which fields to show, which hold references, which hold pictures.
Where the generic page reads badly, a kind gets its own template in this repository
(`src/games/<game>/<kind>.astro`). The generic template comes first, and an override is the exception.

### 8.2 An entity page

From top to bottom:

- name, picture, kind and the game revision shown;
- an infobox of the kind's fields;
- the entity's text (a quest's description, an item's description; export §5.7);
- references both ways, each a list of linked entities with tooltips: a quest's reward items, and on an item's
  page the quests that reward it, the recipes that make or use it, where it is gathered. Shops come later (export
  §11);
- relations found in the game's scripts (export §6.7), labelled as found in scripts;
- the modder panel, hidden unless modder mode is on (§8.7);
- later, the comments (§9).

### 8.3 Lists and filters

A kind's list page shows every entity in a table, with filters on the fields the export marks as filterable
(type, level, price range). The page loads the kind's rows as one JSON file and filters in the browser: Kamidori's
largest kind has about 1,300 items, a few hundred kilobytes. Filters are in the URL, so a filtered list can be
linked.

### 8.4 Search

One Pagefind index over the reference and the database. Database pages are indexed by name and text, with the
game and kind as Pagefind filters, so a search can be narrowed to Kamidori's items.

### 8.5 Tooltips

- A small script without a framework, `tooltips.js`. Hovering a link to an entity page shows its tooltip.
- Tooltips come in one JSON file for each kind (`/<game>/tooltips/<kind>.json`), loaded once on the first hover
  over that kind and kept. One file a kind keeps the file count down (§10.3).
- The script depends on nothing else on the page, so another site (a wiki, a forum) can load it and get the same
  tooltips, as Wowhead's are used.

### 8.6 Languages

- The interface is English. A Japanese interface is a later choice; Starlight translates its own parts.
- Game text is shown in each language the export holds (export §6.4). Kamidori's export holds Japanese and the
  fan translation's English, which the user decided to publish tentatively and to take down if asked (§3.1). The
  site credits its translators on every page that shows it. A switch on each page chooses the language of game
  text, remembered in the browser. Both languages are in the page, so the switch needs no request.
- Names are shown in the chosen language, with the other in the tooltip or beside it, as the games' wikis do.

### 8.7 Modder mode

A switch, remembered in the browser, that shows a modder panel on every entity page. The panel is in the built
page and hidden, so the switch needs no request. It shows what the export gives (export §6.6):

- the record table and record index, and each field's name as OMS and data files write it;
- the raw values of every named field, and which script, so which layer, wrote each. A string field the kind does
  not publish shows its address only (export §6.6). Later, the arrays no field names yet;
- a ready data file that changes this entity, to copy into a mod;
- the scripts that read or write the record;
- each picture's catalog name, for a translator or a mod replacing it;
- the globals' addresses, for native tools.

Every table, field, global and script name links to its reference page. This is the part no wiki has, and it is
what joins the two sections.

### 8.8 Game revisions

The export is made for one game revision at a time (export §6.8). The site shows the newest revision a game has.
Pages for an older revision are kept only where the site lists that revision (§10.1). A page for what changed
between two revisions is future work (§13); the export's content hashes make it cheap (export §7.3).

### 8.9 Pictures

Pictures are the export's PNG files (export §6.5); the site's build may convert them to WebP. They are served from the same domain
under `/pictures/<game>/<revision>/`, or from a separate asset host when the file count needs it (§10.3). For
Kamidori's units that is the face, the bestiary sprite and the battle sprites (export §5.4).

### 8.10 The age notice

The games are adult titles, so the site says so before its first page: a notice over the page on the first visit,
with a confirm button, remembered in the browser. The page's content is in the HTML underneath, so search and
the tooltips work. The tooltip script on another site (§8.5) shows names and icons only, and the site embedding
it decides its own notice.

No page warns of spoilers (§3.1): what counts as late in a game cannot be told the same way for every kind and
game.

## 9. Comments, later

What has to be right before comments exist:

- **A comment belongs to an entity key** (game, kind, id), never to a URL or an export. Keys outlive re-exports and
  game revisions (export §5.6). Each comment also records the revision shown when it was written.
- **Same origin.** Comments are served under `/api/` on the site's domain, so a page calls them without
  cross-origin rules and a sign-in cookie is the site's own.
- **Pages stay built ahead.** A page loads its comments after it shows.

What the comments design decides when it is scheduled:

- sign-in through an outside provider (Discord, GitHub or both), so the site keeps no passwords;
- moderation: reporting, a review queue, removal, bans, rate limits;
- storage and backups;
- a privacy statement, and how a user deletes what they wrote;
- whether the API is an Astro route on a server or a separate small service.

## 10. Build, data and deploy

### 10.1 Where the game data lives

- An export is made on a machine that has the game installed (export §9). It holds game data, so it never enters
  this repository, which may be public, or OME's. `data/` is in `.gitignore`.
- Exports are kept in private storage (a private bucket, for example). The site's build downloads the ones it
  lists in `site.config` (which game revisions, which languages), with read-only credentials.
- The reference bundle is public: OME's release workflow publishes it with each release (export §8.3), and the
  site's build downloads the version it lists.

### 10.2 Building

- Locally: `npm run build` with exports in `data/` and a bundle in `bundle/` (or a path to an OME checkout, so a
  guide can be previewed before an OME release).
- On CI: the same build, fed from private storage and the release. A change to this repository, a new OME release
  and a new export each start it.
- The build fails on a reference link it cannot map, an entity key that no export holds, and a picture the export
  lacks.

### 10.3 Size

Estimates from OME's `docs/kamidori-data-tables.md`, before any export:

- Kamidori: about 1,300 items, 450 units, 450 skills, 187 quests, 490 recipes, plus shops, stages, conditions and
  the glossary. Some 4,000 entity pages.
- With one tooltip file for each kind and pictures kept apart, the files grow with the pages, so about 5,000 files
  for Kamidori, and a few thousand for the reference.
- Static hosts limit files per deploy. The research note gives 20,000 on Cloudflare's free plans and 100,000 on
  paid ones, as of 2026-11-19. Three games stay under 20,000 if pictures are served from an asset host.

### 10.4 Hosting

Any static host with a CDN works for the pages. Comments add a server for `/api/` (§9). The host and the domain
name are the user's choice (§14).

## 11. Repository layout

```
ome-site/
  docs/specs/        designs (this file)
  docs/research/     notes the designs cite
  src/pages/         home and database pages (Astro)
  src/content/docs/  the reference section's pages, written by the build from the bundle (Starlight)
  src/games/<game>/  a kind's own template, where the generic one reads badly
  src/lib/           reading the export and the bundle, slugs, links
  public/            tooltips.js, static files
  site.config        which OME version, game revisions and languages a build uses
  data/              exports, downloaded or copied in; never committed
  bundle/            the reference bundle, downloaded; never committed
```

## 12. Alternatives considered

- **ASP.NET Core with Razor components rendered on the server**, as the research note recommended. It keeps one
  language with OME and can also write static pages. It is set aside because the reference section would need a
  documentation framework built by hand, and the site never uses the engine's types (§5.2). It stays the fallback
  if the database grows features that want a server on every request.
- **Two Astro projects**, one per section. Set aside: one domain, one look and one search index are simpler in one
  project.
- **A wiki (MediaWiki with structured data)**, as the Old School RuneScape wiki runs. It is the choice if the site
  becomes community-edited. Comments answer the need the user named, at a fraction of the running cost.
- **Hugo.** Fast, but cross-references are awkward in its templates, and interactive parts need a separate
  JavaScript build.

## 13. Milestones

Each needs OME's export milestone it names (export §13).

1. **Skeleton, and the trial of the stack.** The Astro project with Starlight; the home page and the age notice;
   the guides rendered from a local OME checkout; search over them. Needs nothing from OME but its docs. If
   Starlight cannot serve `/docs/` beside ordinary pages with one search index (the second "not verified" item),
   the fallback is ASP.NET Core (§12), decided with the user then.
2. **Kamidori's first kinds.** Item, unit and skill pages, lists with filters, tooltips, and modder mode's fields,
   values and writers, from the first export (export milestone 1). Its data files and script lists follow with
   export milestone 4.
3. **The reference pages** from the reference bundle (export milestone 5).
4. **Deploy:** the domain, the host, private storage for exports, CI, and the GitHub repository the user sets up.
5. **More of Kamidori** as the export grows: quests, recipes, gathering, the glossary, characters, stages and
   their enemies (export milestones 2 and 3).
6. **Comments**, after their own design.
7. **A second game.**

Future work: pages of what changed between game revisions; maps rendered by the export shown with their objects
and enemies; viewers or calculators running OME's code in the browser through .NET WebAssembly (the research note
describes how).

## 14. Decisions by the user

The user answered this design's questions on 2026-11-21:

1. **The stack** (§5): "We can try astro and starlight". The first milestone is the trial (§13).
2. **The domain name and the host:** a placeholder for now (`ome.example`). The host is chosen at the deploy
   milestone.
3. **An age notice:** yes, "these are adult titles" (§8.10).
4. **Spoilers:** no warnings (§3.1, §8.10).
5. **Kamidori's English game text:** published, tentatively, and taken down if asked (§8.6).
6. **The GitHub repository:** the user sets it up later, for this repository to be pushed to. Nothing has been
   pushed.
