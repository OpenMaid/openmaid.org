// What a build of the site reads (site design §10.1, §11).
//
// Everything of OME comes from its reference bundle, OME-reference-<version>.zip (src/lib/bundle.mjs, site plan §6.1):
// OME_BUNDLE (a zip, or a folder holding one); else OME_CHECKOUT, an OME checkout whose tools/reference_bundle.py the
// build runs into bundle/checkout/ (Python from OME_PYTHON); else a zip in bundle/; else the checkout below.
export default {
	// The project's name, which every page's title ends with, and the site's address (the user, 2026-11-22; site plan
	// §11): the project is Open Maid, and Open Maid Engine (OME) is its engine.
	title: 'Open Maid',
	site: 'https://openmaid.org',
	ome: {
		// The OME checkout a bundle is built from when no other source is given, relative to this file.
		checkout: '../age-reimpl',
		// OME's repository. A guide's link to an OME file outside the guides goes to that file here, at the bundle's
		// commit; the home page links its releases.
		repository: 'https://github.com/concopuffs/OpenMaidEngine',
	},
	// The games whose database the build makes (site design §8, §10.1), each from one export: the folder OME's
	// `data-export` writes, copied to data/<game>/. The OME_SITE_GAMES environment variable overrides which are built,
	// as a comma-separated list; empty builds the site without a database.
	games: {
		kamidori: {
			revision: '0294c8eafacf',
			// The picture a kind's lists and tooltips show, by the export's picture names, first found first. An explicit
			// picture is never shown there (site design §8.11).
			// A kind titled by a reference (a recipe, by the item it makes) shows its target's when it has none.
			thumbnails: {
				item: ['icon'],
				skill: ['icon'],
				unit: ['battle_face', 'face', 'sprite'],
				quest: ['journal_icon'],
				condition: ['icon'],
				world_area: ['picture'],
			},
			// The entry whose picture a kind's card on the game's front page shows, by id (site plan §10.3, finding 18),
			// where the first entry with a picture says less of the kind; a kind with no picture shows its initial.
			cards: { item: 250, condition: 9 },
		},
	},
};
