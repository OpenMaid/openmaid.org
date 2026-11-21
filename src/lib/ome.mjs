// Reading OME: its guides and its games, from a local checkout (site.config.mjs). The reference bundle will carry the
// same files (OME's export design §8.1), and this module will read it instead.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const GUIDES = 'docs/modding';
const PROFILES = 'engine/Ome.Engine/Profiles';

/** A checkout's root, commit and version; fails unless the path holds OME's guides and profile manifests. */
export function openCheckout(root) {
	const resolved = path.resolve(root);
	for (const needed of [`${GUIDES}/README.md`, PROFILES]) {
		if (!fs.existsSync(path.join(resolved, needed)))
			throw new Error(`${resolved} is not an OME checkout: it has no ${needed} (set OME_CHECKOUT or site.config.mjs)`);
	}
	const git = (...args) => execFileSync('git', ['-C', resolved, ...args], { encoding: 'utf8' }).trim();
	return { root: resolved, commit: git('rev-parse', 'HEAD'), version: git('describe', '--tags', '--always') };
}

/** The games from OME's profile manifests, by title: id, title, support levels and the maker's site. */
export function games(checkout) {
	const dir = path.join(checkout.root, PROFILES);
	return fs
		.readdirSync(dir)
		.filter((name) => name.endsWith('.json'))
		.map((name) => JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')))
		.map((manifest) => ({
			id: manifest.id,
			title: manifest.displayTitle,
			play: manifest.support?.play ?? null,
			modding: manifest.support?.modding ?? null,
			site: manifest.launcher?.site ?? null,
		}))
		.sort((a, b) => a.title.localeCompare(b.title));
}

/**
 * Copies OME's guides into the docs collection under /docs/ (site design §7.1) and returns what the site needs of
 * them: the sidebar, and each copied file's original path for the link rewriter (src/lib/guide-links.mjs).
 *
 * A guide's first `# ` heading becomes its title; a README.md becomes its folder's index page. The sidebar follows the
 * guide index's "Where to go next" table, which is OME's reading order. A guide the table does not name comes after
 * it, with a warning; the game guides form their own group.
 */
export function syncGuides(checkout, outDir) {
	const source = path.join(checkout.root, GUIDES);
	const out = fileURLToPath(outDir);
	fs.rmSync(out, { recursive: true, force: true });

	const pages = new Map(); // guide path in OME ("docs/modding/lua.md") -> { slug, title, copy }
	for (const file of walk(source)) {
		const rel = path.relative(source, file).split(path.sep).join('/');
		const text = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
		const heading = text.match(/^# (.+)$/m);
		if (!heading) throw new Error(`${GUIDES}/${rel} has no "# " title`);
		const body = text.slice(0, heading.index) + text.slice(heading.index + heading[0].length + 1);
		const target = rel.replace(/(^|\/)README\.md$/, '$1index.md');
		const copy = path.join(out, target);
		fs.mkdirSync(path.dirname(copy), { recursive: true });
		fs.writeFileSync(copy, `---\ntitle: ${JSON.stringify(heading[1].trim())}\n---\n${body}`);
		const slug = ('docs/' + target.replace(/(^|\/)index\.md$/, '').replace(/\.md$/, '')).replace(/\/$/, '');
		pages.set(`${GUIDES}/${rel}`, { slug, title: heading[1].trim(), copy });
	}

	const index = fs.readFileSync(path.join(source, 'README.md'), 'utf8').replace(/\r\n/g, '\n');
	const table = index.match(/^## Where to go next\n([\s\S]*?)(?=^## |(?![\s\S]))/m);
	if (!table) throw new Error(`${GUIDES}/README.md has no "## Where to go next" section, the sidebar's order`);
	const order = [...table[1].matchAll(/\]\(([^)#]+\.md)\)/g)].map((m) => `${GUIDES}/${m[1]}`);

	const games = [...pages.keys()].filter((key) => key.startsWith(`${GUIDES}/games/`));
	const gamesIndex = `${GUIDES}/games/README.md`;
	const guides = [...new Set(order)].filter((key) => pages.has(key) && !games.includes(key));
	const unlisted = [...pages.keys()]
		.filter((key) => !games.includes(key) && key !== `${GUIDES}/README.md` && !guides.includes(key))
		.sort();
	for (const key of unlisted) console.warn(`[ome] ${key} is not in the guide index's table; listed after it`);

	const item = (key, label) => (label ? { slug: pages.get(key).slug, label } : { slug: pages.get(key).slug });
	const sidebar = [
		{ label: 'Modding guide', items: [item(`${GUIDES}/README.md`, 'Overview'), ...[...guides, ...unlisted].map((key) => item(key))] },
		{
			label: 'Games',
			items: [
				...(pages.has(gamesIndex) ? [item(gamesIndex, 'Supported games')] : []),
				...games
					.filter((key) => key !== gamesIndex)
					.sort((a, b) => pages.get(a).title.localeCompare(pages.get(b).title))
					.map((key) => item(key)),
			],
		},
	];
	return { sidebar, pages };
}

function* walk(dir) {
	for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) yield* walk(full);
		else if (entry.name.endsWith('.md')) yield full;
	}
}
