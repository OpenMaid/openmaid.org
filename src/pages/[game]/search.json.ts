// A game database's search index (site plan §9.2; src/lib/search-index.mjs): every entry's names, kind and thumbnail,
// which the search box suggests from and the results page finds entries in.
import type { APIRoute } from 'astro';
import { game, games } from '../../lib/database.mjs';
import { searchData } from '../../lib/search-index.mjs';

export function getStaticPaths() {
	return games().map((data) => ({ params: { game: data.game } }));
}

export const GET: APIRoute = ({ params }) =>
	new Response(JSON.stringify(searchData(game(params.game!))), { headers: { 'Content-Type': 'application/json' } });
