// The games a build makes a database for (site design §10.1): those site.config.mjs lists, or those the OME_SITE_GAMES
// environment variable names, comma-separated (empty names none). The build (astro.config.mjs) and the deploy's
// download (scripts/deploy-sources.mjs) both read it, so they agree on which exports a build needs.

/**
 * The first path segments the site's own pages take, which a game's database therefore may not (site design §4, site
 * plan §15.4): the guides and the reference, comments later, the exports' pictures, and the list of the databases.
 */
export const RESERVED_PATHS = ['docs', 'api', 'pictures', 'databases'];

/** The ids of the games a build makes, in the order given, each checked against the config. */
export function listedGames(config, environment = process.env) {
	for (const game of Object.keys(config.games))
		if (RESERVED_PATHS.includes(game)) throw new Error(`site.config.mjs has a game ${game}, a path the site's own pages take`);
	const listed =
		environment.OME_SITE_GAMES?.split(',')
			.map((game) => game.trim())
			.filter(Boolean) ?? Object.keys(config.games);
	for (const game of listed) if (!config.games[game]) throw new Error(`OME_SITE_GAMES names ${game}, which site.config.mjs does not`);
	return listed;
}
