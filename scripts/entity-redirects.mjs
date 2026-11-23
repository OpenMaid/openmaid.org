// The nginx map from an entity's address without its slug to its page (site plan §15; finding 17, §10.3), written from
// the tooltip files the build makes (dist/<game>/tooltips/<kind>.json), whose entries hold each entity's address.
// deploy/nginx.conf answers /<game>/<kind>/<id>, with or without a slash or with a wrong slug, by a redirect to the
// page. The 404 page does the same in a browser, but a plain HTTP request does not run it.
//
//   node scripts/entity-redirects.mjs [dist] > entity-redirects.map
//
// Each line maps the address's first three parts to the page's, percent-encoded part by part, so a slug's characters
// (a Japanese name, a `$`) reach nginx as plain ASCII: "/kamidori/item/1" "/kamidori/item/1/%E9%8A%85.../";
import fs from 'node:fs';
import path from 'node:path';

const dist = path.resolve(process.argv[2] ?? 'dist');
const ENTITY = /^\/[^/]+\/[^/]+\/\d+\/[^/]+\/$/;
const lines = [];
for (const game of fs.readdirSync(dist).sort()) {
	const dir = path.join(dist, game, 'tooltips');
	if (!fs.existsSync(dir)) continue;
	for (const file of fs.readdirSync(dir).filter((name) => name.endsWith('.json')).sort()) {
		const { entities } = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
		for (const [id, entity] of Object.entries(entities)) {
			if (!ENTITY.test(entity.u)) throw new Error(`${game}/${file}: entity ${id}'s address ${entity.u} is not /<game>/<kind>/<id>/<slug>/`);
			const parts = entity.u.split('/');
			const key = parts.slice(0, 4).join('/');
			lines.push(`"${key}" "${parts.map(encodeURIComponent).join('/')}";`);
		}
	}
}
if (lines.length === 0) console.error(`entity-redirects: no tooltip files under ${dist}; the map is empty`);
process.stdout.write(lines.length ? `${lines.join('\n')}\n` : '');
console.error(`entity-redirects: ${lines.length} entities`);
