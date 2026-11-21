// The export's pictures, served as the export holds them (site design §8.9): /pictures/<game>/<revision>/<name>.png.
import fs from 'node:fs';
import type { APIRoute } from 'astro';
import { game, games } from '../../../../lib/database.mjs';

export function getStaticPaths() {
	return games().flatMap((data) =>
		[...data.pictures.values()].map((p) => ({ params: { game: data.game, revision: data.revision, file: p.file } })),
	);
}

export const GET: APIRoute = ({ params }) =>
	new Response(fs.readFileSync(game(params.game!).pictures.get(params.file!).source), {
		headers: { 'Content-Type': 'image/png' },
	});
