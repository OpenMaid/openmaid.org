# Working on the site

Written 2026-11-24 at the user's suggestion, from the sessions that built the site, for whoever works on it next, an
agent included. The user: "take some of these gotchas, some processes/notes for developing the site and any other
things you find useful, and typing it up into a document". Other documents cover the rest, and this guide links to
them rather than repeating them:

- `README.md`: how to build, make exports and deploy.
- The design, `docs/specs/2026-11-21-site-design.md`: what the site is and why.
- The plan, `docs/plans/2026-11-21-site-plan.md`: what each piece of work built and found, and what the user decided.

This guide covers how to work on the site: where a change goes, how to see it, and what has gone wrong before. Keep it
current: when a way of working changes or a new gotcha turns up, it goes here.

## 1. What the site is made of

The site is static. Astro and Starlight build every page ahead of time from two inputs, and neither is committed:

- **OME's reference bundle** (README, "Building"). It holds OME's guides, the reference pages (opcodes, globals,
  record tables, patch points, events, scripts) and `games.json`, which gives each game's names, support levels and
  cover. A local build makes the bundle from the OME checkout beside this repository and says so:
  `[ome] reference bundle v0.10.1-3-g93324bf7 (93324bf764aa) from ...\age-reimpl`. The version ends in `-dirty` when
  the checkout has uncommitted changes, so read that line to know which OME a build used.
- **Each game's export**, in `data/<game>/` (README, "Building"). It is the SQLite file OME's `data-export` writes,
  with its pictures and its manifest. It holds the game's data, so it never enters the repository. Neither does the
  translated text it carries, which belongs to its translators.

Where the code is:

| Path | What |
|---|---|
| `site.config.mjs` | The site's title and address; the OME a deploy builds with (`ome.release`); for each game, its version, translations, thumbnails, link icons, cards, the pictures drawn on a dark tile, and each kind's default list columns |
| `src/lib/` | Code that runs at build time. `export.mjs` reads an export, `database.mjs` makes each game's kinds and entities, `columns.mjs` writes the list files, `format.mjs` and `values.mjs` decide how a value reads, `search-index.mjs` builds the search, `bundle.mjs` and `reference*.mjs` read the bundle |
| `src/pages/` | The routes: `[game]/[kind]/` for a list, `[game]/[kind]/[id]/[slug]` for an entity, `docs/` for the guides and the reference, `databases/` for the overview |
| `src/components/` | The components the pages draw with (`Value.astro`, `DataTable.astro`, `Picture.astro`, `Label.astro`, ...) |
| `src/scripts/` | Code that runs in the browser: `list-view.ts` and `list-table.ts` for the list tables, `search.ts` for a database's search, `tabs.ts` |
| `public/tooltips.js` | The tooltips on links to entities; it depends on nothing, so another site can load it |
| `scripts/` | Node tools: `check-site.mjs` checks a build, `shots.mjs` takes screenshots, `make-export.mjs` makes an export, `fetch-covers.mjs` fetches the covers, `smoke-test.mjs` checks a running image, and the deploy uses `deploy-sources.mjs`, `export-key.mjs` and `entity-redirects.mjs` |
| `Dockerfile`, `deploy/nginx.conf`, `.github/workflows/site-image.yml` | The image and the workflow that makes it (README, "Deploying") |

Git ignores `dist/`, `.astro/`, `data/` and `bundle/`. It also ignores `src/content/docs/`, which each build fills
with the bundle's guides.

## 2. Where a change goes

OME decides most of what the database shows, not this repository. Find a change's home before writing it:

| The change | Where it goes |
|---|---|
| A field, kind, reference, picture, note or category that the database shows | OME's `vm-map/entities-<game>.toml`, with references in the registry's `[table.refs]`; then make the export again (§3). OME's `AGENTS.md` and its game data export design say how |
| A value's name, unit or scale | OME's registry for the game (`vm-map/globals.toml` for Himegari, `vm-map/globals-<game>.toml` for the others) |
| A list's default columns; a kind's thumbnails, link icons and cards | `site.config.mjs` |
| How a value reads | `src/lib/format.mjs` and the browser code that mirrors it (§6) |
| A page's layout | `src/pages/`, `src/components/`, `src/styles/site.css` |
| A guide's text | OME's `docs/modding/`, which the build copies |

Work that spans both repositories starts in OME, on a branch there, then continues here on a branch of the same work.
Each repository's plan names the other's commit: OME's in its export plan §5, the site's in this plan's section for
the work.

## 3. The two repositories, and what a deploy builds with

- **A build reads whatever export is in `data/<game>/`.** After OME's exporter or a declaration changes, make the
  export again before building. Use `scripts/make-export.mjs` (README, "Building"), which also imports the
  translations `site.config.mjs` lists; a bare `data-export` leaves Kamidori's English out. To compare before and
  after, keep a copy of the old export.
- **A column that `site.config.mjs` names must be in the export:** `src/lib/columns.mjs` stops the build on one that
  is missing.
- **A deploy uses the OME that `ome.release` names** to export each game and to make the bundle (plan §15). The
  default, `'latest'`, is the newest OME release. So a site that needs something OME has not released cannot deploy
  until OME releases it, or until `ome.release` is set to `'develop'`. A push never deploys (plan §15.5), so pushing
  such work is safe; tagging it is not.
- **Read a new export table or column tolerantly where that costs little,** so the site still builds against an
  older export. `export.mjs` asks the SQLite file which columns a table has
  (`columnsOf('picture').includes('additive')`) and reads a missing one as its default value.

## 4. The loop: change, build, check, look

1. **Branch** from `develop` (`feature/<what>`). The repository commits as the project's identity, which its local
   git config sets; check `git config user.name` before the first commit.
2. **Build into `.astro/check-dist`, not `dist/`:** `npx astro build --outDir .astro/check-dist`. A build takes about
   a minute and a half and writes about 14,000 pages, so run it in the background, one build at a time. Keep it out
   of `dist/` because a preview may be serving `dist/` to someone. The folder must be inside the project (§7). For a
   quicker look while iterating, `OME_SITE_GAMES=<game>` builds only that game's database; build them all before
   committing.
3. **Check it:** `node scripts/check-site.mjs .astro/check-dist`. It checks every link and asset, the search index,
   each entity's page, picture and tooltip, the reference pages, and the links into OME's repository, then prints the
   counts (`check-site: 14009 pages, 1419878 links on the site, ... 9826 entities, 4090 reference entries`). Compare
   the counts with a build from before the change (the plan's sections record some). A kind whose entities vanished
   still passes the check.
4. **Look at it** (§5): serve the build, take screenshots and read them. Look at what the change touches in both
   themes, at a phone's width (390), and with the language switch where the game's text is translated. A list's
   sorting, filters and columns run in the browser, so press them, not only load the page.
5. **There is no type checker.** The build strips TypeScript's types without checking them. There is no `typescript`
   package, and `npx tsc` fetches an unrelated package. A type error builds fine, so read the types you touch.
6. **Close out the docs.** Add to the plan's section for the work what was built and what the user decided, in their
   words. Update the README if a command or the deploy changed, and this guide if a gotcha or a way of working did.
   The plan's and the design's earlier sections stay as they were.
7. **Push and tag only on the user's word.**

## 5. Looking at a build

**Serving it.** `npx astro preview --outDir .astro/check-dist` serves the build at <http://localhost:4321/>.
- Astro runs one preview per project. A second refuses to start ("Another astro preview server is already running")
  and names the first's PID; `npx astro preview stop` stops the first. Stopping the shell that started a preview
  can leave its `node` process serving, still holding the port.
- A preview serves its folder from disk, so a rebuild into that folder empties it while the preview runs. Stop the
  preview before rebuilding into its folder, or build elsewhere.
- If the user is looking at a preview, leave it alone unless they say otherwise.
- To serve a second build on another port, run `py -3.11 -m http.server 4399` in its folder.
- Neither server does what nginx does in the image (`deploy/nginx.conf`). An entity's address without its slug, or
  with a wrong one, gives a 404 instead of a redirect. Ask for the full address, `/<game>/<kind>/<id>/<slug>/`, as
  the list file or a link to the entity gives it.

**Screenshots.** `node scripts/shots.mjs <folder> <page> ...` loads each page in headless Chrome and saves `p1.png`,
`p2.png`, and so on. `BASE`, `WIDTH`, `HEIGHT` and `THEME` choose the server, the window and the theme (the script's
header has the details). Read the PNGs: a build that passes its check can still draw wrong.
- The age notice covers every page until it is answered. Its answer (`localStorage` `ome-age-confirmed`) is kept per
  origin, and another port is another origin, so the script answers it on `BASE` first.
- Chrome needs an absolute `--user-data-dir`: given a relative one, it opens a dialog instead of starting.
- Edge's `--screenshot` flag wrote nothing. The debugging protocol's `Page.captureScreenshot` works.
- In Git Bash, a `/path` argument to a Windows program is rewritten into a Windows path. Set `MSYS_NO_PATHCONV=1` to
  pass it unchanged.

**Pressing things on a page.** To check what a press does, send real input through the debugging protocol:
`Input.dispatchMouseEvent` at a point, and `document.elementFromPoint` to see what is under that point. Don't use
`element.click()`, which ignores whatever lies on top of the element. Scope a query to the element you mean: a list
page has more than one table, since the modder panel's scripts table follows the list.

**The list files.** Each kind's `list.json` in the build (`<game>/<kind>/list.json`) says what its list can show.
`columns` describes the columns; each row in `rows` holds its values in column order; `links` lists the entities that
cells link to. To find which lists have a column of some type, or a column with a note, read these files instead of
clicking through pages.

## 6. Values drawn twice

A list's first rows are drawn at build time (`Value.astro` and `DataTable.astro`, with `src/lib/`), so the list reads
without scripts. Then the browser draws it again from its list file (`src/scripts/list-view.ts`), with the columns and
sorting the visitor chose. The browser code mirrors the build's:
- `list-view.ts`'s `nameHtml` draws a name as `Name.astro` does;
- its `pictureClass` gives a picture the classes `Picture.astro` gives it;
- its mask values follow `format.mjs`'s `valueItems`;
- its `isEmpty`, the rows a select's "no value" keeps, follows `columns.mjs`'s `noneCount`, which counts them.

So a change to how a value reads is a change to both. The comments in `list-view.ts` name each function's twin.

Notes and tooltips come from three places:
- `public/tooltips.js` shows the tooltip on a link to an entity, from each kind's `tooltips/<kind>.json`;
- `Label.astro` shows a detail's note on an entity page;
- a list heading's note is its `title`, which the browser shows as its own tooltip.

## 7. Gotchas

- **`astro build --outDir`** must name a folder inside the project. On another drive the build fails with `EXDEV`; in
  a folder outside the project, it cannot find its packages (`piccolore` not found). `.astro/check-dist` works.
- **`EPERM`:** a build fails emptying `dist\<game>` while a shell's working directory is inside it.
- **A stale guide:** Astro's content store (`node_modules/.astro/data-store.json`) keeps a guide's render while the
  guide's text is unchanged. The guides' `omeLinks` key and the check's rule on links into OME's repository guard
  against a stale render (plan §6.4).
- **Harmless warnings:** the build warns that the collection "i18n" does not exist, and Node that SQLite is
  experimental. Both are expected.
- **The lock file:** `package-lock.json` must be written by the image's npm (README, "Building").
- **Windows:**
  - Edit text with the editor tools or Python, never PowerShell (OME's `AGENTS.md`, "Conventions").
  - In Git Bash, a heredoc that holds a script needs a quoted delimiter (`<<'EOF'`).
  - GitHub's CLI is at `/c/Program Files/GitHub CLI/gh.exe` when Git Bash's PATH lacks it.
  - The AWS CLI v1 prints the bucket's listings in cp932, which mangles Arterial's Japanese names; set
    `PYTHONIOENCODING=utf-8`.

## 8. Deploying

README "Deploying" describes the workflow, and plan §15 its history. In short:
- A version tag `v*`, or a run by hand on `develop`, deploys. A run by hand on any other branch builds and checks the
  image without deploying it.
- Before tagging, make sure the OME that `ome.release` names can build the site (§3).
- A new OME release changes every export's key, so the first deploy after one exports every game again, about half an
  hour. Before tagging after a new game or a new release, run the workflow by hand on a branch other than `develop`,
  which builds and checks without deploying; the tag's run then finds its exports in the bucket.
- The publisher's site may refuse the runner a cover (HTTP 403; all four new games' on 2026-11-28, plan §15.8). The
  build then goes on without it and says "no cover". Put the game's cover in the bucket's `covers/` as
  `<game>.jpg`, the copy `fetch-covers.mjs` saved on your desk with the bundle's hash, and only on the user's word,
  since it writes to the bucket.
- The user's server takes the image. Whether it did is for the user to check.

## 9. Rules that hold here as in OME

- Push, tag and deploy only on the user's word. Push only to `origin`, and never force-push.
- Work from `develop`, on branches. `main` holds the design, and the work is not merged into it (the user,
  2026-11-21).
- Game data, the games' pictures and translated text never enter the repository. The covers are copies that
  `scripts/fetch-covers.mjs` downloads into `data/covers/` (plan §15.4), and a deploy keeps them in the bucket's
  `covers/` (§15.7).
- One fact, one home: a decision lives in the design or the plan, a command in the README, a way of working here.
