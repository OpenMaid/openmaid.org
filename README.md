# ome-site

The website of the Open Maid Engine (OME), on one domain:

- **Home:** what OME is, the games it supports, downloads.
- **The modding reference:** OME's guides, and a page for each opcode, global, record table, patch point, event
  and game script.
- **The game database:** a page for each item, unit, skill, quest and the rest of a game's data, mined from the
  game by OME's exporter. Kamidori first.

The design is `docs/specs/2026-11-21-site-design.md`, accepted on 2026-11-21. Nothing is built yet.

## What this repository holds, and what it does not

- It holds the site: pages, templates, styles, scripts, the build and the deploy.
- It does not hold game data. Exports from OME's exporter hold data from the games, so they are kept in private
  storage and copied into `data/`, which git ignores.
- It does not hold OME's docs. OME's repository keeps them, and publishes them with each release as a reference
  bundle.

What the site reads, and how OME makes it, is OME's game data export design, in the OME repository at
`docs/superpowers/specs/2026-11-21-game-data-export-design.md`.

## Notes

- `docs/research/2026-11-19-encyclopedia-tech-stack.md`: a survey of stacks and prior art for a Wowhead-style site,
  written on 2026-11-19. The design cites it; its versions and limits were current then.
