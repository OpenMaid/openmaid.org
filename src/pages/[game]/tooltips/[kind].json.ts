// Every tooltip of a kind, as one file (site design §8.5): its name, address, picture and a line of text, by id. The
// tooltip script (public/tooltips.js) loads it on the first hover over that kind; the 404 page finds an entity's
// address in it.
import type { APIRoute } from 'astro';
import { game, games, pictureUrl } from '../../../lib/database.mjs';

export function getStaticPaths() {
	return games().flatMap((data) => data.kinds.map((kind) => ({ params: { game: data.game, kind: kind.id } })));
}

export const GET: APIRoute = ({ params }) => {
	const data = game(params.game!);
	const kind = data.kinds.find((k) => k.id === params.kind)!;
	const textField = kind.fields.find((f) => f.text && f.name !== kind.titleField)?.name;
	const entities = Object.fromEntries(
		kind.entities.map((e) => {
			const line = textField ? (e.text[textField] ?? []).filter(Boolean).join(' ').replace(/\s+/g, ' ').trim() : '';
			return [e.id, { n: e.title, u: e.url, p: e.thumbnail ? pictureUrl(data, e.thumbnail) : null, t: line.slice(0, 160) || null }];
		}),
	);
	return new Response(JSON.stringify({ game: data.title, kind: kind.label.one, entities }), {
		headers: { 'Content-Type': 'application/json' },
	});
};
