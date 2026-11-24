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

`package-lock.json` is written by npm 11.19.1, the npm of the image's Node, and the image installs from it with
`npm ci`. An older npm leaves out of the lock the `@emnapi` packages that the wasm32 builds of Astro's compiler,
rolldown and satteri ask for, and the image's `npm ci` then refuses the lock as out of sync (the first deploy's
image job, 2026-11-23). So change the dependencies with that npm, `npx npm@11.19.1 install ...`, or a newer one
if the image's has moved on.

Each build copies OME's guides from the bundle into `src/content/docs/docs/`, which git ignores, and fails on a guide
link it cannot map. The favicon is OME's icon (`godot/assets/ome-icon.svg` in OME).

The game database needs each game's export, which holds the game's data and so is never committed. Make it on a
machine with the game installed, as the deploy does, with an OME checkout:

```sh
node scripts/make-export.mjs --ome ../age-reimpl --game kamidori --install <the game's install> \
  --translations <a folder holding en/, the translated install> --output data/kamidori
```

It runs OME's build tools, imports each translation `site.config.mjs` lists for the game into a language package
(written beside the output, as `data/kamidori.en/`), and exports the game with them, so that `data/kamidori/` holds
`<revision>.sqlite`, `pictures/` and `manifest.json`. The build reads the revision from the manifest. The game version
the game's pages show is the config's `gameVersion`, which the export records (`data-export --game-version`): OME's
own is the installer's, from the registry of the machine the game was installed on, which a deploy's runner is not.
Change it when the install in the bucket changes. To build without
the database, set `OME_SITE_GAMES` empty; to build some games only, list them (`OME_SITE_GAMES=kamidori`).

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

The workflow `.github/workflows/site-image.yml` makes the image with no step by hand. It runs on every push to
`develop`, when OME publishes a release (OME's workflow `notify-site.yml` sends this repository an `ome-release`
event), and by hand. Its three jobs:

1. **Resolve.** It reads what the deploy works from (`scripts/deploy-sources.mjs`): the OME that `site.config.mjs`
   names in `ome.release` (`'latest'`, OME's latest release, by default; or a tag; or `'develop'`), and each game with
   its translations. For each game it computes the export's key (`scripts/export-key.mjs`) from OME's commit, the
   game's install and translated installs as the bucket lists them (each file's name, ETag and size), the game's
   translations in `site.config.mjs` and `scripts/make-export.mjs` itself. An export the bucket holds under its key is
   not made again.
2. **Export,** for each game whose export is missing: a runner downloads the install and its translations, makes the
   export with that OME (`scripts/make-export.mjs`), and uploads it under its key, its manifest last, so that an
   export the bucket lists is a whole one.
3. **Image.** It downloads OME's reference bundle into `bundle/` (the release's `OME-reference-<tag>.zip`; for
   `develop`, one made from its commit) and each game's export into `data/<game>/`, and builds the image. Only the
   built site ends up in it: the build reads `data/` and `bundle/` through mounts, so no layer holds an export. It runs
   the image and checks it as it serves (`scripts/smoke-test.mjs`), then pushes it to GitHub's container registry as
   `ghcr.io/<owner>/<repository>`, tagged with the commit and, from `develop`, `latest`.

So an OME release, an install or translation changed in the bucket, and a push here each end in a new image, and what
did not change is not exported again. The server's own tooling takes the image from there. It needs a token that can
read the package (`read:packages`), since the package is private.

### The bucket

Any S3-compatible bucket works. It holds each game's install and translated installs, which are uploaded once, and
the exports the workflow writes:

```
<bucket>/installs/<game>/...                  the game's install as it is on disk, SYS4INI.BIN at its top
<bucket>/translations/<game>/<language>/...   a translated install that a translation in site.config.mjs imports
<bucket>/exports/<game>/<key>/...             the workflow's exports: <revision>.sqlite, pictures/, manifest.json
```

Upload an install, or a new one in its place, with the AWS CLI or any S3 client; `--delete` makes the bucket's copy
the same as the folder:

```sh
aws s3 sync "<the game's install>" s3://<bucket>/installs/kamidori/ --delete --endpoint-url <endpoint>
aws s3 sync "<the translated install>" s3://<bucket>/translations/kamidori/en/ --delete --endpoint-url <endpoint>
```

The next run exports the game again. Nothing reads an export once no key names it, so old ones under `exports/` can
be deleted; a run that needs one again makes it.

### The repositories' settings

This repository's settings hold where the bucket is and a key for it. The key reads the bucket and writes `exports/`:

| Kind | Name | What |
|---|---|---|
| Variable | `EXPORTS_ENDPOINT` | The bucket's S3 endpoint (empty for AWS's own S3) |
| Variable | `EXPORTS_BUCKET` | The bucket's name |
| Variable | `EXPORTS_REGION` | Its region, if it needs one (default `auto`) |
| Secret | `EXPORTS_ACCESS_KEY_ID` | The bucket's key |
| Secret | `EXPORTS_SECRET_ACCESS_KEY` | Its secret |

The repository's default branch is `develop`: GitHub runs an event that another repository sends with the default
branch's workflow, and `latest` comes from `develop` only.

OME's repository holds what its `notify-site.yml` needs to send the event. It sends it as a GitHub App, owned by the
organization, with the repository permission Contents: Read and write and installed on this repository alone; each
run makes a token from the app's key that lasts an hour and may write only this repository's contents:

| Kind | Name | What |
|---|---|---|
| Variable | `SITE_REPOSITORY` | This repository, as `<owner>/<name>`; without it no event is sent |
| Variable | `SITE_DISPATCH_APP_CLIENT_ID` | The app's client ID (its settings page shows it, with its app ID) |
| Secret | `SITE_DISPATCH_APP_KEY` | A private key of the app, the whole `.pem` file |

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
