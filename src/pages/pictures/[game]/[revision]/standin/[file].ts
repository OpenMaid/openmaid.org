// The blurred stand-in of each explicit picture (site design §8.11): the picture shrunk to a few pixels across, which
// the page shows at full size until a click loads the picture itself.
import type { APIRoute } from 'astro';
import sharp from 'sharp';
import { game, games } from '../../../../../lib/database.mjs';

export function getStaticPaths() {
	return games().flatMap((data) =>
		[...data.pictures.values()]
			.filter((p) => p.explicit)
			.map((p) => ({ params: { game: data.game, revision: data.revision, file: p.file } })),
	);
}

export const GET: APIRoute = async ({ params }) => {
	const picture = game(params.game!).pictures.get(params.file!);
	const png = await sharp(picture.source).resize({ width: 12 }).blur(0.6).png().toBuffer();
	return new Response(new Uint8Array(png), { headers: { 'Content-Type': 'image/png' } });
};
