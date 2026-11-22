// Every tooltip of a kind, as one file (site design §8.5): its name, address, picture and a line of text, by id, with
// its name and line in each language the export translates them into (`tr`, §8.6). The tooltip script
// (public/tooltips.js) loads it on the first hover over that kind; the 404 page finds an entity's address in it.
import type { APIRoute } from 'astro';
import { game, games, pictureUrl } from '../../../lib/database.mjs';

export function getStaticPaths() {
	return games().flatMap((data) => data.kinds.map((kind) => ({ params: { game: data.game, kind: kind.id } })));
}

export const GET: APIRoute = ({ params }) => {
	const data = game(params.game!);
	const kind = data.kinds.find((k) => k.id === params.kind)!;
	const textField = kind.fields.find((f) => f.text && f.name !== kind.titleField)?.name;
	const lineOf = (text: Record<string, string[]>) =>
		textField ? (text[textField] ?? []).filter(Boolean).join(' ').replace(/\s+/g, ' ').trim().slice(0, 160) || null : null;
	const entities = Object.fromEntries(
		kind.entities.map((e) => {
			const tooltip: Record<string, unknown> = { n: e.title, u: e.url, p: e.thumbnail ? pictureUrl(data, e.thumbnail) : null, t: lineOf(e.text) };
			const tr = Object.fromEntries(
				data.languages
					.map((tag: string) => [tag, { n: e.names[tag] ?? null, t: lineOf(e.translations[tag]) }])
					.filter(([, x]: [string, { n: string | null; t: string | null }]) => x.n || x.t),
			);
			if (Object.keys(tr).length) tooltip.tr = tr;
			return [e.id, tooltip];
		}),
	);
	return new Response(JSON.stringify({ game: data.title, kind: kind.label.one, entities }), {
		headers: { 'Content-Type': 'application/json' },
	});
};
