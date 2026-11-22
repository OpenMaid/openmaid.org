// Maps a guide's relative links to site links (site design §7.1), as a Sätteri mdast plugin (Astro 7's Markdown
// processor). The build fails on a link it cannot map.
//
// - A link to another guide goes to that guide's page, its anchor kept. scripts/check-site.mjs then checks each
//   anchor against the built page.
// - A link to one of OME's generated references goes to the reference page that shows the same registry (site plan
//   §6.1): a game's global reference to its globals, its patch point reference to its patch points.
// - A link to another OME file goes to that file in OME's repository, at the bundle's commit. A bundle built from a
//   checkout checks that the file exists there; a downloaded one cannot.
// - A link that leaves OME's tree, or names a file in the guides that is not a guide, fails.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { href } from './reference-model.mjs';

/**
 * A key over everything the rewriter reads besides a guide's own text: the commit, whether a checkout is there to check
 * files, the repository, the guides' paths and the reference targets. Astro's content store keeps a guide's render
 * while the file's text is the same, so src/lib/ome.mjs writes this key into each copy's frontmatter: a new commit
 * then renders every guide again, instead of keeping links to the last one's.
 */
export function guideLinkKey(source, guideNames, repository) {
	const inputs = [source.commit, Boolean(source.checkout), repository, [...guideNames].sort(), [...source.references]];
	return crypto.createHash('sha256').update(JSON.stringify(inputs)).digest('hex').slice(0, 16);
}

/**
 * The reference pages that replace OME's generated references, by the reference's path in OME, as the bundle's
 * games.json names them (each game's `references`).
 */
export function referenceTargets(games) {
	const pages = { globals: href.globals, patch_points: href.points };
	const targets = new Map();
	for (const game of games)
		for (const [kind, file] of Object.entries(game.references ?? {})) {
			if (!pages[kind]) throw new Error(`games.json names a ${kind} reference of ${game.id}, which the site has no page for`);
			targets.set(file, pages[kind](game.id));
		}
	return targets;
}

/** `source` is { commit, checkout (an OME checkout's root, or null), references (referenceTargets) }. */
export function guideLinks(source, guides, repository) {
	const byCopy = new Map([...guides.pages].map(([key, page]) => [path.normalize(page.copy), key]));
	return (ctx) => {
		const from = ctx.fileURL && byCopy.get(path.normalize(fileURLToPath(ctx.fileURL)));
		if (!from) return null;
		const rewrite = (node, context) => {
			const to = mapLink(node.url, from, source, guides.pages, repository);
			if (to !== node.url) context.setProperty(node, 'url', to);
		};
		return { name: 'ome-guide-links', link: rewrite, definition: rewrite, image: rewrite };
	};
}

export function mapLink(url, from, source, pages, repository) {
	if (/^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith('#')) return url;
	if (url.startsWith('/')) throw new Error(`${from}: the link ${url} is absolute; a guide links relative to itself`);
	const at = url.indexOf('#');
	const target = decodeURI(at < 0 ? url : url.slice(0, at));
	const hash = at < 0 ? '' : url.slice(at);
	const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(from), target));
	if (resolved.startsWith('../')) throw new Error(`${from}: the link ${url} leaves OME's tree`);

	const page = pages.get(resolved);
	if (page) return `/${page.slug}/${hash}`;
	if (resolved.startsWith('docs/modding/'))
		throw new Error(`${from}: the link ${url} names ${resolved}, in the guides but not a guide; the site cannot show it`);
	const reference = source.references.get(resolved);
	if (reference) {
		if (hash) throw new Error(`${from}: the link ${url} has an anchor, which the reference page ${reference} does not keep`);
		return reference;
	}
	let kind = 'blob';
	if (source.checkout) {
		const full = path.join(source.checkout, resolved);
		if (!fs.existsSync(full)) throw new Error(`${from}: the link ${url} names ${resolved}, which the checkout lacks`);
		if (fs.statSync(full).isDirectory()) kind = 'tree';
	} else if (resolved.endsWith('/')) kind = 'tree';
	return `${repository}/${kind}/${source.commit}/${resolved.replace(/\/$/, '').split('/').map(encodeURIComponent).join('/')}${hash}`;
}
