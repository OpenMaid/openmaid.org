// Checks a built site (dist/), after `astro build` (site design §10.2):
//
// - every link and asset a page names on the site resolves to a built file, and every anchor to an id on that page;
// - the search index holds every page that marks its content for search (`data-pagefind-body`), and only those: the
//   reference section and the ordinary pages share one index (site design §5);
// - every entity of a game's database has its page, in the search index, and its picture: each kind's tooltip file
//   (/<game>/tooltips/<kind>.json) lists every entity of the export (site design §10.2), and the page of each whose
//   name or text the export translates credits the translation's packages (§8.6);
// - a game database's search (site plan §9.2) has its page, and its index (/<game>/search.json) lists every entity the
//   tooltip files do, each at its page's address, and only those, with its thumbnail built;
// - every entry of the reference bundle the build read has its page, in the search index: each opcode, and each game's
//   named globals, record tables, patch points, events and scripts (site plan §6.1);
// - every link of a page to a file in OME's repository names the bundle's commit, so a guide rendered for another
//   commit (Astro's content store keeps a render while the file is the same) shows up; where the bundle was built from
//   a checkout, the file is in it (a path a registry's note cites may be stale).
//
// It exits 1 on any failure, listing each.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';
import config from '../site.config.mjs';
import { locateBundle, openBundle } from '../src/lib/bundle.mjs';
import { href, referenceModel } from '../src/lib/reference-model.mjs';

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
		credited: /\sclass="ome-credit"/.test(html),
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
	const addresses = new Map(); // "item 12" -> its page's address, from the tooltip files
	for (const name of fs.readdirSync(dir)) {
		const tooltips = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
		for (const [id, entity] of Object.entries(tooltips.entities)) {
			entities++;
			const where = `${game} ${name.replace(/\.json$/, '')} ${id}`;
			addresses.set(`${name.replace(/\.json$/, '')} ${id}`, entity.u);
			if (!pages.has(entity.u)) failures.push(`${where}: its page ${entity.u} is not built`);
			else if (!indexed.has(entity.u)) failures.push(`${where}: its page ${entity.u} is not in the search index`);
			if (entity.tr && pages.get(entity.u) && !pages.get(entity.u).credited)
				failures.push(`${where}: its page ${entity.u} shows translated text and credits no package`);
			if (entity.p && !fs.existsSync(path.join(dist, decodeURI(entity.p)))) failures.push(`${where}: its picture ${entity.p} is not built`);
		}
	}
	if (!pages.has(`/${game}/search/`)) failures.push(`${game}: its search page is not built`);
	const indexFile = path.join(dist, game, 'search.json');
	if (!fs.existsSync(indexFile)) {
		failures.push(`${game}: its search index (search.json) is not built`);
		continue;
	}
	const index = JSON.parse(fs.readFileSync(indexFile, 'utf8'));
	const listed = new Set();
	for (const [k, id, slug, , , picture] of index.entries) {
		const key = `${index.kinds[k].id} ${id}`;
		const address = `/${game}/${index.kinds[k].id}/${id}/${slug}/`;
		listed.add(key);
		if (!addresses.has(key)) failures.push(`${game}: the search index lists ${key}, which no tooltip file does`);
		else if (addresses.get(key) !== address) failures.push(`${game}: the search index has ${key} at ${address}, not ${addresses.get(key)}`);
		if (picture && !fs.existsSync(path.join(dist, decodeURI(index.pictures), picture[0])))
			failures.push(`${game}: the search index's picture of ${key}, ${picture[0]}, is not built`);
	}
	for (const key of addresses.keys()) if (!listed.has(key)) failures.push(`${game}: the search index does not list ${key}`);
}

// The bundle the build read: the same source, without building it again.
const root = fileURLToPath(new URL('../', import.meta.url));
const located = locateBundle({ siteRoot: root, bundleDir: path.join(root, 'bundle'), checkout: config.ome.checkout, build: false });
const model = referenceModel(openBundle(located.zip));
const entries = [
	...model.opcodes.map((op) => [`opcode ${op.op}`, href.opcode(op.op)]),
	...model.games.flatMap((game) => [
		...game.globals.map((cell) => [`${game.id} global ${cell.name}`, href.global(game.id, cell.name)]),
		...game.tables.map((table) => [`${game.id} table ${table.name}`, href.table(game.id, table.name)]),
		...game.points.map((point) => [`${game.id} patch point ${point.name}`, href.point(game.id, point.name)]),
		...game.events.map((event) => [`${game.id} event ${event.name}`, href.event(game.id, event.name)]),
		...Object.keys(game.scripts ?? {}).map((key) => [`${game.id} script ${key}`, href.script(game.id, key)]),
	]),
];
for (const [what, url] of entries) {
	if (!pages.has(url)) failures.push(`${what}: its page ${url} is not built`);
	else if (!indexed.has(url)) failures.push(`${what}: its page ${url} is not in the search index`);
}
const files = `${config.ome.repository}/`;
let repositoryLinks = 0;
for (const [, page] of pages)
	for (const link of page.links) {
		if (!link.startsWith(files)) continue;
		const ref = link.slice(files.length).match(/^(?:blob|tree)\/([^/]+)\//);
		if (!ref) continue;
		repositoryLinks++;
		if (ref[1] !== model.commit) failures.push(`${page.file}: ${link} is at ${ref[1]}, not the bundle's commit ${model.commit}`);
		const file = decodeURIComponent(link.slice(files.length + ref[0].length).replace(/#.*$/, ''));
		if (located.checkout && !fs.existsSync(path.join(located.checkout, file)))
			failures.push(`${page.file}: ${link} names ${file}, which the checkout lacks`);
	}

console.log(
	`check-site: ${pages.size} pages, ${links} links on the site, ${repositoryLinks} to OME's files, ${indexed.size} pages in the search index, ${entities} entities, ${entries.length} reference entries`,
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
