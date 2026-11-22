// A game database's search results (site plan §9.2), as Wowhead has them: the entries whose names match the address's
// search (search.ts `find`), a tab for each kind with its count, each a table of the kind's list (list-view.ts) with
// its default columns, best matches first until a heading sorts it; and a last tab, "Full text", of the entries whose
// pages hold the words, from Pagefind's index of the site. A kind's table starts from the search index and takes the
// kind's columns when its list file is in, loaded when its tab is first chosen.
import { searchOf } from '../lib/match.mjs';
import { esc, listTable, loadList, shownLanguage, type Row } from './list-view.ts';
import { entryHtml, find, loadIndex, shownTag, type Entry, type Index, type Match } from './search.ts';
import { tabs } from './tabs.ts';

type Pagefind = {
	search: (text: string, options: { filters: Record<string, string> }) => Promise<{ results: PagefindResult[] }>;
};
type PagefindResult = { id: string; data: () => Promise<{ url: string; excerpt: string; meta: { title?: string } }> };

/** How many of the full text's results a press of "Show more" adds. */
const TEXT_PAGE = 25;

const root = document.querySelector<HTMLElement>('[data-ome-results]');
if (root) run(root).catch((error) => console.warn('the search failed', error));

async function run(root: HTMLElement) {
	const text = (new URLSearchParams(location.search).get('q') ?? '').trim();
	const input = document.querySelector<HTMLInputElement>('.ome-search-page input[name="q"]');
	const status = root.querySelector<HTMLElement>('[data-ome-status]')!;
	const number = (n: number) => n.toLocaleString('en');
	if (input) input.value = text;
	if (!searchOf(text)) {
		input?.focus();
		return;
	}
	document.title = `“${text}” – ${document.title}`;
	status.textContent = 'Searching…';
	const index = await loadIndex(root.dataset.omeIndex!);
	const found = find(index, text);
	const pages = await fullText(text, index.title);

	// What was found, by name and by text.
	const quoted = `“${esc(text)}”`;
	const byName = found.length ? `${number(found.length)} ${found.length === 1 ? 'entry matches' : 'entries match'} ${quoted} by name` : `No entry's name matches ${quoted}`;
	const byText = pages === null ? '' : `${found.length ? ', and' : ';'} ${number(pages.length)} by their text`;
	status.innerHTML =
		!found.length && !pages?.length
			? `Nothing matches ${quoted}, by name or by text. A name matches when it holds every word searched for, ${esc(
					root.dataset.omeLanguages ?? '',
				)}: try fewer words, or part of a word. A comma separates names to find any of them (“sword, spear”).`
			: `${byName}${byText}.`;
	if (!found.length && !pages?.length) return;

	// A tab for each kind with entries found, in the kinds' order, and one for the full text.
	const groups = index.kinds
		.map((kind, k) => ({ kind, matches: found.filter((match) => match.entry.kind === k) }))
		.filter((group) => group.matches.length);
	const panels = groups.map(({ kind, matches }) => ({
		id: `results-${kind.id}`,
		label: kind.many,
		count: matches.length,
		html: `<h2 class="ome-tab-heading">${esc(kind.many)}</h2>
			<p class="ome-results-line">Best matches first. <a href="/${esc(index.game)}/${esc(kind.id)}/?q=${encodeURIComponent(text)}">Open ${
				matches.length === 1 ? 'it' : `these ${number(matches.length)}`
			} in the list of ${esc(kind.many.toLowerCase())}</a> to choose the columns and filter them. <button type="button" data-ome-best hidden>Best matches first</button></p>
			<div class="ome-list-box"><table class="ome-list"><thead></thead><tbody></tbody></table></div>`,
	}));
	if (pages?.length)
		panels.push({
			id: 'results-text',
			label: 'Full text',
			count: pages.length,
			html: `<h2 class="ome-tab-heading">Full text</h2>
				<p class="ome-results-line">The entries whose pages hold every word, their text included, best first. This search takes whole words, so a Japanese name, which has no spaces, is best searched by name.</p>
				<div class="ome-list-box"><table class="ome-list"><thead><tr><th scope="col" class="ome-num">ID</th><th scope="col">Name, and where its page says so</th><th scope="col">Kind</th></tr></thead><tbody></tbody></table></div>
				<p class="ome-results-more" hidden><button type="button" data-ome-more>Show more</button></p>`,
		});
	const box = root.querySelector<HTMLElement>('[data-ome-tabs]')!;
	box.innerHTML = `<div class="ome-tablist not-content" role="tablist" aria-label="Results by kind" hidden>${panels
		.map(
			(panel, i) =>
				`<button type="button" role="tab" id="${panel.id}-tab" aria-controls="${panel.id}" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}">${esc(panel.label)}<span class="ome-tab-count">${number(panel.count)}</span></button>`,
		)
		.join('')}</div>${panels.map((panel) => `<section id="${panel.id}">${panel.html}</section>`).join('')}`;

	const language = () => shownLanguage(root.dataset.lang);
	const loaders = [
		...groups.map((group) => () => showKind(index, group.kind.id, group.matches, document.getElementById(`results-${group.kind.id}`)!, language)),
		() => showText(index, pages!, document.getElementById('results-text')!),
	];
	const started = new Set<number>();
	// The tab of the best match first; a kind's table loads when its tab is first chosen.
	const best = found.length ? groups.findIndex((group) => group.kind === index.kinds[found[0].entry.kind]) : panels.length - 1;
	tabs(box, {
		initial: best,
		onChoose: (i) => {
			if (started.has(i)) return;
			started.add(i);
			loaders[i]();
		},
	});
}

/** The full text's results for the game's entries, from Pagefind's index; null where it cannot be loaded (`astro dev`). */
async function fullText(text: string, game: string) {
	try {
		const url = '/pagefind/pagefind.js';
		const pagefind: Pagefind = await import(/* @vite-ignore */ url);
		return (await pagefind.search(text, { filters: { game } })).results;
	} catch (error) {
		console.warn('the full text search did not load', error);
		return null;
	}
}

/** A name with the name that matched, when the switch shows another language. */
const matchedName = (index: Index, match: Match) => entryHtml(index, match, { thumb: false });

/** A kind's table of the entries found: first from the search index, then from the kind's list, with its columns. */
async function showKind(index: Index, kind: string, matches: Match[], panel: HTMLElement, language: () => string) {
	const table = panel.querySelector('table')!;
	const best = panel.querySelector<HTMLButtonElement>('[data-ome-best]')!;
	const pictured = matches.some((match) => match.entry.picture);
	const drawIndex = () => {
		table.tHead!.innerHTML = '<tr><th scope="col" class="ome-num">ID</th><th scope="col">Name</th></tr>';
		table.tBodies[0].innerHTML = matches
			.map(
				(match) =>
					`<tr><td class="ome-num">${match.entry.id}</td><td><a href="${esc(match.entry.url)}"${pictured ? ' class="ome-thumbed"' : ''}>${entryHtml(index, match, { thumb: pictured })}</a></td></tr>`,
			)
			.join('');
	};
	drawIndex();
	let file;
	try {
		file = await loadList(`/${index.game}/${kind}/list.json`);
	} catch (error) {
		console.warn('the list file did not load; the results keep their names only', error);
		return;
	}
	const byId = new Map(file.rows.map((row) => [row.id, row]));
	const matchOf = new Map<Row, Match>();
	const rows: Row[] = [];
	for (const match of matches) {
		const row = byId.get(match.entry.id);
		if (!row) continue;
		rows.push(row);
		matchOf.set(row, match);
	}
	const view = listTable(file, table, {
		shown: [...file.defaults],
		sort: null,
		language,
		onSort: () => {
			best.hidden = false;
			view.draw(rows, { head: true });
		},
		name: (row) => matchedName(index, matchOf.get(row)!),
	});
	view.draw(rows, { head: true });
	best.addEventListener('click', () => {
		view.state.sort = null;
		best.hidden = true;
		view.draw(rows, { head: true });
	});
	// The name that matched follows the language shown, and so does a sort by name.
	new MutationObserver(() => view.draw(rows, { head: true })).observe(document.documentElement, {
		attributes: true,
		attributeFilter: ['data-ome-lang'],
	});
}

/**
 * The full text's table: each result's entry with Pagefind's excerpt under its name, so it is read whole on a phone too
 * (site plan §13, C7), and its kind, a page at a time.
 */
function showText(index: Index, results: PagefindResult[], panel: HTMLElement) {
	const body = panel.querySelector('tbody')!;
	const more = panel.querySelector<HTMLElement>('.ome-results-more')!;
	const byPath = new Map<string, Entry>(index.entries.map((entry) => [`${index.kinds[entry.kind].id}/${entry.id}`, entry]));
	let shown = 0;
	const page = async () => {
		const next = results.slice(shown, shown + TEXT_PAGE);
		shown += next.length;
		more.hidden = shown >= results.length;
		const rows = await Promise.all(
			next.map(async (result) => {
				const data = await result.data();
				const path = new URL(data.url, location.href).pathname.match(/^\/[^/]+\/([^/]+)\/(\d+)\//);
				const entry = path ? byPath.get(`${path[1]}/${path[2]}`) : undefined;
				if (!entry)
					return `<tr><td></td><td class="ome-wrap"><a href="${esc(data.url)}">${esc(data.meta.title ?? data.url)}</a><div class="ome-excerpt">${data.excerpt}</div></td><td></td></tr>`;
				const match = { entry, score: 0, tag: shownTag(entry.names) };
				return `<tr><td class="ome-num">${entry.id}</td><td class="ome-wrap"><a href="${esc(entry.url)}" class="ome-thumbed">${entryHtml(index, match)}</a><div class="ome-excerpt">${data.excerpt}</div></td><td>${esc(index.kinds[entry.kind].one)}</td></tr>`;
			}),
		);
		body.insertAdjacentHTML('beforeend', rows.join(''));
		panel.querySelector('.ome-list-box')?.dispatchEvent(new Event('scroll'));
	};
	more.querySelector('button')!.addEventListener('click', page);
	page();
}
