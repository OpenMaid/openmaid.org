// What a deploy works from (site plan §15): the OME it builds with and the games it makes, each with the translations
// its export carries. Prints JSON, which the deploy workflow reads with jq:
//
//   { "ome": { "release": "latest", "repository": "https://github.com/…" },
//     "games": [ { "id": "kamidori", "translations": [ { "language": "en", "import": [...], "package": {...} } ] },
//                { "id": "arterial", "translations": [] }, … ] }
import config from '../site.config.mjs';
import { listedGames } from '../src/lib/listed-games.mjs';

const sources = {
	ome: { release: config.ome.release ?? 'latest', repository: config.ome.repository },
	games: listedGames(config).map((id) => ({ id, translations: config.games[id].translations ?? [] })),
};
console.log(JSON.stringify(sources, null, '\t'));
