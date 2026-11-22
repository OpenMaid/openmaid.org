// A kind's list as data (site plan §9.1; src/lib/columns.mjs `listData`): every column a table of its entries can show,
// and every entry's cells in them. The kind's list page draws its table from it in the browser, with the columns a
// visitor chooses, their sorting and filters.
import type { APIRoute } from 'astro';
import { listData } from '../../../lib/columns.mjs';
import { game, games } from '../../../lib/database.mjs';

export function getStaticPaths() {
	return games().flatMap((data) => data.kinds.map((kind) => ({ params: { game: data.game, kind: kind.id } })));
}

export const GET: APIRoute = ({ params }) => {
	const data = game(params.game!);
	const kind = data.kinds.find((k) => k.id === params.kind)!;
	return new Response(JSON.stringify(listData(data, kind)), { headers: { 'Content-Type': 'application/json' } });
};
