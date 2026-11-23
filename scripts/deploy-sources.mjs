// What a deploy's build downloads before it runs (site plan §15): the OME release whose reference bundle it reads, and
// each game's export by the revision site.config.mjs names. Prints JSON, which the deploy workflow reads with jq:
//
//   { "ome": { "release": "v0.10.0", "repository": "https://github.com/…" },
//     "games": [ { "id": "kamidori", "revision": "0294c8eafacf" }, … ] }
//
// `release` is null while site.config.mjs names none; the workflow then builds the bundle from OME's develop branch.
import config from '../site.config.mjs';
import { listedGames } from '../src/lib/listed-games.mjs';

const sources = {
	ome: { release: config.ome.release ?? null, repository: config.ome.repository },
	games: listedGames(config).map((id) => ({ id, revision: config.games[id].revision })),
};
console.log(JSON.stringify(sources, null, '\t'));
