// Checks a built site (dist/), after `astro build` (site design §10.2):
//
// - every link and asset a page names on the site resolves to a built file, and every anchor to an id on that page;
// - the search index holds every page that marks its content for search (`data-pagefind-body`), and only those: the
//   reference section and the ordinary pages share one index (site design §5);
// - every entity of a game's database has its page, in the search index, and its picture: each kind's tooltip file
//   (/<game>/tooltips/<kind>.json) lists every entity of the export (site design §10.2).
//
// It exits 1 on any failure, listing each.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

const dist = fileURLToPath(new URL('../dist/', import.meta.url));
const failures = [];

const pages = new Map(); // "/docs/lua/" -> { file, ids, links, searchable }
for (const file of walk(dist)) {
	if (!file.endsWith('.html')) continue;
	const rel = path.relative(dist, file).split(path.sep).join('/');
	const url = '/' + rel.replace(/(^|\/)index\.html$/, '$1');
	const html = fs.readFileSync(file, 'utf8').replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/g, '');
	pages.set(url, {
		file: rel,
		ids: new Set([...html.matchAll(/\sid="([^"]*)"/g)].map((m) => decode(m[1]))),
		links: [...html.matchAll(/<(?:a|link|img|script|source)\b[^>]*?\s(?:href|src)="([^"]*)"/g)].map((m) => decode(m[1])),
		searchable: /\sdata-pagefind-body(?:[\s=>])/.test(html),
	});
}

let links = 0;
for (const [url, page] of pages) {
	for (const link of page.links) {
		if (/^[a-z][a-z0-9+.-]*:/i.test(link) || link.startsWith('//')) continue;
		links++;
		const target = new URL(link, `https://site.invalid${url}`);
		const targetPath = decodeURIComponent(target.pathname);
		const hash = decodeURIComponent(target.hash.slice(1));
		const linked = pages.get(targetPath) ?? pages.get(targetPath.endsWith('/') ? targetPath : `${targetPath}/`);
		if (!linked) {
			if (targetPath.endsWith('/') || !fs.existsSync(path.join(dist, targetPath))) failures.push(`${page.file}: ${link} is not built`);
			else if (hash) failures.push(`${page.file}: ${link} has an anchor on a file that is not a page`);
			continue;
		}
		if (hash && hash !== '_top' && !linked.ids.has(hash)) failures.push(`${page.file}: ${link} names no id on ${linked.file}`);
	}
}

const indexed = new Set();
const fragments = path.join(dist, 'pagefind', 'fragment');
if (!fs.existsSync(fragments)) failures.push('the search index (pagefind/) is not built');
else
	for (const name of fs.readdirSync(fragments)) {
		const text = zlib.gunzipSync(fs.readFileSync(path.join(fragments, name))).toString('utf8');
		indexed.add(decodeURI(JSON.parse(text.slice(text.indexOf('{'))).url));   // Pagefind keeps a URL percent-encoded
	}
const searchable = [...pages].filter(([, page]) => page.searchable).map(([url]) => url);
for (const url of searchable) if (!indexed.has(url)) failures.push(`${pages.get(url).file}: marked for search, not in the index`);
for (const url of indexed) if (!searchable.includes(url)) failures.push(`the index holds ${url}, which no built page marked for search`);

let entities = 0;
for (const [url] of pages) {
	const game = url.match(/^\/([^/]+)\/$/)?.[1];
	const dir = game && path.join(dist, game, 'tooltips');
	if (!dir || !fs.existsSync(dir)) continue;
	for (const name of fs.readdirSync(dir)) {
		const tooltips = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
		for (const [id, entity] of Object.entries(tooltips.entities)) {
			entities++;
			const where = `${game} ${name.replace(/\.json$/, '')} ${id}`;
			if (!pages.has(entity.u)) failures.push(`${where}: its page ${entity.u} is not built`);
			else if (!indexed.has(entity.u)) failures.push(`${where}: its page ${entity.u} is not in the search index`);
			if (entity.p && !fs.existsSync(path.join(dist, decodeURI(entity.p)))) failures.push(`${where}: its picture ${entity.p} is not built`);
		}
	}
}

console.log(
	`check-site: ${pages.size} pages, ${links} links on the site, ${indexed.size} pages in the search index, ${entities} entities`,
);
if (failures.length) {
	for (const failure of failures) console.error(`  ${failure}`);
	console.error(`check-site: ${failures.length} failure${failures.length === 1 ? '' : 's'}`);
	process.exit(1);
}

function decode(value) {
	return value.replace(/&(amp|lt|gt|quot|#39|#x27);/g, (_, entity) =>
		({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", '#x27': "'" })[entity],
	);
}

function* walk(dir) {
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) yield* walk(full);
		else yield full;
	}
}
