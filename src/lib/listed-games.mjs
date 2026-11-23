// The games a build makes a database for (site design §10.1): those site.config.mjs lists, or those the OME_SITE_GAMES
// environment variable names, comma-separated (empty names none). The build (astro.config.mjs) and the deploy's
// download (scripts/deploy-sources.mjs) both read it, so they agree on which exports a build needs.

/** The ids of the games a build makes, in the order given, each checked against the config. */
export function listedGames(config, environment = process.env) {
	const listed =
		environment.OME_SITE_GAMES?.split(',')
			.map((game) => game.trim())
			.filter(Boolean) ?? Object.keys(config.games);
	for (const game of listed) if (!config.games[game]) throw new Error(`OME_SITE_GAMES names ${game}, which site.config.mjs does not`);
	return listed;
}
