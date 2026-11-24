// Each game's cover, from the build's checked copy (src/lib/covers.mjs): /databases/covers/<game>.jpg.
import fs from 'node:fs';
import type { APIRoute } from 'astro';
import ome from 'virtual:ome';

export function getStaticPaths() {
	return ome.databases.flatMap((d) => (d.cover ? [{ params: { file: d.cover.name }, props: { cover: d.cover } }] : []));
}

export const GET: APIRoute = ({ props }) =>
	new Response(fs.readFileSync(props.cover.source), { headers: { 'Content-Type': props.cover.type } });
