// Reading OME: its guides and its games, from the reference bundle (src/lib/bundle.mjs; OME's export design §8.1).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const GUIDES = 'docs/modding';

/** The games from the bundle's games.json, by title: id, titles, engine build, support levels and the maker's site. */
export function games(bundle) {
	return bundle
		.json('games.json')
		.games.map((game) => ({
			id: game.id,
			title: game.title,
			titles: game.titles,
			engineBuild: game.engine_build,
			scriptRevisions: game.script_revisions,
			play: game.support?.play ?? null,
			modding: game.support?.modding ?? null,
			site: game.site ?? null,
			// The package's picture on the publisher's site, its address and SHA-256 (src/lib/covers.mjs).
			cover: game.cover ?? null,
			baseMod: game.base_mod,
			scriptIndex: game.script_index,
		}))
		.sort((a, b) => a.title.localeCompare(b.title));
}

/**
 * Copies OME's guides from the bundle into the docs collection under /docs/ (site design §7.1) and returns what the
 * site needs of them: the sidebar's guide groups, and each copied file's original path for the link rewriter
 * (src/lib/guide-links.mjs).
 *
 * A guide's first `# ` heading becomes its title; a README.md becomes its folder's index page. `linkKey`
 * (src/lib/guide-links.mjs `guideLinkKey`) goes into each copy's frontmatter, so a change to what its links map to
 * renders it again. The sidebar follows the
 * guide index's "Where to go next" table, which is OME's reading order. A guide the table does not name comes after
 * it, with a warning; the game guides form their own group.
 */
export function syncGuides(bundle, outDir, linkKey) {
	// The reference pages own /docs/reference/ and /docs/<game>/ (site plan §6.1), so no guide may take those paths.
	const reserved = new Set(['reference', ...bundle.games]);
	const out = fileURLToPath(outDir);
	fs.rmSync(out, { recursive: true, force: true });

	const pages = new Map(); // guide path in OME ("docs/modding/lua.md") -> { slug, title, copy }
	for (const name of bundle.names.filter((name) => name.startsWith(`${GUIDES}/`) && name.endsWith('.md'))) {
		const rel = name.slice(GUIDES.length + 1);
		const text = bundle.text(name);
		const heading = text.match(/^# (.+)$/m);
		if (!heading) throw new Error(`${name} has no "# " title`);
		const body = text.slice(0, heading.index) + text.slice(heading.index + heading[0].length + 1);
		const target = rel.replace(/(^|\/)README\.md$/, '$1index.md');
		const copy = path.join(out, target);
		fs.mkdirSync(path.dirname(copy), { recursive: true });
		fs.writeFileSync(copy, `---\ntitle: ${JSON.stringify(heading[1].trim())}\nomeLinks: ${JSON.stringify(linkKey)}\n---\n${body}`);
		const slug = ('docs/' + target.replace(/(^|\/)index\.md$/, '').replace(/\.md$/, '')).replace(/\/$/, '');
		if (reserved.has(slug.split('/')[1])) throw new Error(`${name} would be /${slug}/, which the reference pages own`);
		pages.set(name, { slug, title: heading[1].trim(), copy });
	}
	if (!pages.has(`${GUIDES}/README.md`)) throw new Error(`the reference bundle has no ${GUIDES}/README.md`);

	const index = bundle.text(`${GUIDES}/README.md`);
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
