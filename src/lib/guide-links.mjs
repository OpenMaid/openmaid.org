// Maps a guide's relative links to site links (site design §7.1), as a Sätteri mdast plugin (Astro 7's Markdown
// processor). The build fails on a link it cannot map.
//
// - A link to another guide goes to that guide's page, its anchor kept. scripts/check-site.mjs then checks each
//   anchor against the built page.
// - A link to an OME file outside the guides goes to that file in OME's repository, at the checkout's commit. When
//   the reference pages exist (site milestone 3), the generated references these links name will map to them instead.
// - A link outside the checkout, to a file the checkout lacks, or to a file in the guides that is not a guide fails.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function guideLinks(checkout, guides, repository) {
	const byCopy = new Map([...guides.pages].map(([key, page]) => [path.normalize(page.copy), key]));
	return (ctx) => {
		const from = ctx.fileURL && byCopy.get(path.normalize(fileURLToPath(ctx.fileURL)));
		if (!from) return null;
		const rewrite = (node, context) => {
			const to = mapLink(node.url, from, checkout, guides.pages, repository);
			if (to !== node.url) context.setProperty(node, 'url', to);
		};
		return { name: 'ome-guide-links', link: rewrite, definition: rewrite, image: rewrite };
	};
}

export function mapLink(url, from, checkout, pages, repository) {
	if (/^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith('#')) return url;
	if (url.startsWith('/')) throw new Error(`${from}: the link ${url} is absolute; a guide links relative to itself`);
	const at = url.indexOf('#');
	const target = decodeURI(at < 0 ? url : url.slice(0, at));
	const hash = at < 0 ? '' : url.slice(at);
	const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(from), target));
	if (resolved.startsWith('../')) throw new Error(`${from}: the link ${url} leaves the OME checkout`);

	const page = pages.get(resolved);
	if (page) return `/${page.slug}/${hash}`;
	const full = path.join(checkout.root, resolved);
	if (!fs.existsSync(full)) throw new Error(`${from}: the link ${url} names ${resolved}, which the checkout lacks`);
	if (resolved.startsWith('docs/modding/'))
		throw new Error(`${from}: the link ${url} names ${resolved}, in the guides but not a guide; the site cannot show it`);
	const kind = fs.statSync(full).isDirectory() ? 'tree' : 'blob';
	return `${repository}/${kind}/${checkout.commit}/${resolved.split('/').map(encodeURIComponent).join('/')}${hash}`;
}
