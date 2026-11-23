# ome-site

The website of the Open Maid project, at <https://openmaid.org>: the project is Open Maid, and Open Maid Engine
(OME) is its engine (site plan §11).

- **Home:** what Open Maid is and its parts, the games OME supports, downloads.
- **The modding reference:** OME's guides, and a page for each opcode, global, record table, patch point, event
  and game script.
- **The game database:** a page for each item, unit, skill, quest and the rest of a game's data, mined from the
  game by OME's exporter. Kamidori first.

The design is `docs/specs/2026-11-21-site-design.md`, accepted on 2026-11-21. Its plan,
`docs/plans/2026-11-21-site-plan.md`, keeps what each milestone built and where the build departs from the design.
Built so far: milestone 1, the home page, the guides and search, on Astro and Starlight; milestone 2, Kamidori's
items, units and skills; two parts of milestone 5, Kamidori's quests, recipes, conditions, stages, world areas,
character profiles, objectives and glossary, then each stage's enemies; milestone 3, the reference pages; and the
design pass (plan §9, §10): the usability review's fixes, "Related" in tabs, list tables with columns to choose, and
the databases' own search; Arterial's and Himegari's databases beside Kamidori's (plan §12); and milestone 4's image
and the workflow that makes it (plan §15).

## Building

You need Node 22.23.4 or later and OME's reference bundle, `OME-reference-<version>.zip`, which each OME release
publishes. Everything the site shows of OME comes from it: the guides, the games and the reference pages. The build
takes the first of these it finds (`src/lib/bundle.mjs`):

1. `OME_BUNDLE`: the bundle's zip, or a folder holding one;
2. `OME_CHECKOUT`: an OME checkout, whose own `tools/reference_bundle.py` the build runs to make the bundle in
   `bundle/checkout/` (Python 3.11 from `OME_PYTHON`, else `py -3.11` on Windows and `python3` elsewhere);
3. a bundle's zip in `bundle/`;
4. the OME checkout at `../age-reimpl`, beside this repository, as in 2 (`site.config.mjs`).

A checkout shows OME's guides as they are before a release, and checks that each file a guide links in OME exists.

```sh
npm install
npm run dev      # a local server that rebuilds as you edit
npm run build    # the site in dist/, then scripts/check-site.mjs checks its links and search index
npm run preview  # serves dist/
```

Each build copies OME's guides from the bundle into `src/content/docs/docs/`, which git ignores, and fails on a guide
link it cannot map. The favicon is OME's icon (`godot/assets/ome-icon.svg` in OME).

The game database needs each game's export, which holds the game's data and so is never committed. Make it with
OME (`Ome.Cli data-export --game <game>`, on a machine with the game installed) and copy the folder it writes to
`data/<game>/`, so that `data/kamidori/` holds `<revision>.sqlite`, `pictures/` and `manifest.json`. The revision
must be the one `site.config.mjs` lists. To build without the database, set `OME_SITE_GAMES` empty; to build some
games only, list them (`OME_SITE_GAMES=kamidori`).

## What this repository holds, and what it does not

- It holds the site: pages, templates, styles, scripts, the build and the deploy.
- It does not hold game data. Exports from OME's exporter hold data from the games, so they are kept in private
  storage and copied into `data/`, which git ignores.
- It does not hold OME's docs or registries. OME's repository keeps them, and publishes them with each release as a
  reference bundle, which the build reads from `bundle/` or makes from a checkout there; git ignores it.

What the site reads, and how OME makes it, is OME's game data export design, in the OME repository at
`docs/superpowers/specs/2026-11-21-game-data-export-design.md`.

## Deploying

The site runs as a Docker image on the project's server, behind its reverse proxy (site plan §15). The image is nginx
serving the built site over plain HTTP on port 8080 (`Dockerfile`, `deploy/nginx.conf`); the proxy in front gives it
HTTPS. Besides the pages, nginx redirects an entity's address without its slug, or with a wrong one, to its page, from
a map the build writes (`scripts/entity-redirects.mjs`).

The workflow `.github/workflows/site-image.yml` makes the image on every push to `develop`, and by hand:

1. it reads what the build needs (`scripts/deploy-sources.mjs`): the OME release `site.config.mjs` names in
   `ome.release`, and each game's revision;
2. it downloads that release's `OME-reference-<tag>.zip` into `bundle/` (while `ome.release` is null, it makes one
   from OME's `develop` instead), and each game's export from the private bucket into `data/<game>/`;
3. it builds the image, in which only the built site ends up: the build reads `data/` and `bundle/` through mounts,
   so no layer holds an export;
4. it runs the image and checks it as it serves (`scripts/smoke-test.mjs`), then pushes it to GitHub's container
   registry as `ghcr.io/<owner>/<repository>`, tagged with the commit and, from `develop`, `latest`.

The server's own tooling takes the image from there. It needs a token that can read the package (`read:packages`),
since the package is private.

### The exports in the bucket

Any S3-compatible bucket works. Each game's export goes under `<game>/<revision>/`, exactly as OME writes it:

```
<bucket>/kamidori/0294c8eafacf/0294c8eafacf.sqlite
<bucket>/kamidori/0294c8eafacf/manifest.json
<bucket>/kamidori/0294c8eafacf/pictures/...
```

After making an export with OME, upload it with the AWS CLI (or any S3 client), from OME's checkout:

```sh
aws s3 sync build/games/kamidori/export/ s3://<bucket>/kamidori/0294c8eafacf/ --delete --endpoint-url <endpoint>
```

Then run the workflow by hand (or push), and the image is rebuilt with it.

The repository's settings hold where the bucket is and a key that can only read it:

| Kind | Name | What |
|---|---|---|
| Variable | `EXPORTS_ENDPOINT` | The bucket's S3 endpoint (empty for AWS's own S3) |
| Variable | `EXPORTS_BUCKET` | The bucket's name |
| Variable | `EXPORTS_REGION` | Its region, if it needs one (default `auto`) |
| Secret | `EXPORTS_ACCESS_KEY_ID` | A read-only key for the bucket |
| Secret | `EXPORTS_SECRET_ACCESS_KEY` | Its secret |

### Building the image by hand

With an export in each `data/<game>/` and one bundle zip in `bundle/` (a bundle the build made from a checkout, in
`bundle/checkout/`, is left out of the image's build: copy its zip up into `bundle/`):

```sh
docker build -t ome-site .
docker run --rm -p 8080:8080 ome-site
node scripts/smoke-test.mjs http://localhost:8080
```

## Notes

- `docs/research/2026-11-19-encyclopedia-tech-stack.md`: a survey of stacks and prior art for a Wowhead-style site,
  written on 2026-11-19. The design cites it; its versions and limits were current then.
- `docs/plans/`: each design's plan, with what was built and found.
