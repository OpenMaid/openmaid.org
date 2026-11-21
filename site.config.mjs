// What a build of the site reads (site design §10.1, §11).
//
// Until OME publishes its reference bundle (OME's export milestone 5), the build reads a local OME checkout: the
// guides (docs/modding/) and the profile manifests, which hold the games and their support levels. The bundle will
// carry the same files.
export default {
	// The site's address: a placeholder until the deploy milestone (site design §14, decision 2).
	site: 'https://ome.example',
	ome: {
		// A local OME checkout, relative to this file. The OME_CHECKOUT environment variable overrides it.
		checkout: process.env.OME_CHECKOUT ?? '../age-reimpl',
		// OME's repository. A guide's link to an OME file outside the guides goes to that file here, at the checkout's
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
			thumbnails: { item: ['icon'], skill: ['icon'], unit: ['battle_face', 'face', 'sprite'] },
		},
	},
};
