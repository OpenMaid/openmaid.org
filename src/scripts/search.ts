// A game database's search (site plan §9.2), as Wowhead has it: a box that suggests entries as one types, each with its
// picture and its kind, from the game's search index (src/lib/search-index.mjs), loaded on the first keystroke; Enter
// on a suggestion opens its page, and Enter otherwise opens the results page (search-results.ts), which finds entries
// the same way. A name matches by lib/match.mjs, in any language the entry has one in; one the language switch does
// not show is shown beside the name, so "銅" finds "Copper Key" and says why.
import { nameOf, nameScore, searchOf } from '../lib/match.mjs';
import { SOURCE_LANGUAGE } from '../lib/language.mjs';
import { esc, nameHtml, thumbHtml, type Names } from './list-view.ts';

type Kind = { id: string; one: string; many: string };
type Raw = [number, number, string, string, Names | 0, [string, number, number] | 0];
type IndexFile = { game: string; title: string; pictures: string; kinds: Kind[]; entries: Raw[] };
export type Entry = {
	kind: number;
	id: number;
	url: string;
	title: string;
	/** The entry's name in each language, the game's included; empty when its title is not the game's text. */
	names: Names;
	picture: [string, number, number] | 0;
	keys: { tag: string; key: ReturnType<typeof nameOf> }[];
};
export type Index = { game: string; title: string; pictures: string; kinds: Kind[]; entries: Entry[] };
export type Match = { entry: Entry; score: number; tag: string };

const indexes = new Map<string, Promise<Index>>();

/** A game's search index, loaded once a page, each name folded for matching. */
export function loadIndex(url: string): Promise<Index> {
	if (!indexes.has(url))
		indexes.set(
			url,
			fetch(url)
				.then((response) => (response.ok ? response.json() : Promise.reject(new Error(`${url}: ${response.status}`))))
				.then((file: IndexFile) => ({
					...file,
					entries: file.entries.map(([kind, id, slug, title, others, picture]) => {
						const names: Names = others ? { [SOURCE_LANGUAGE]: title, ...others } : {};
						const all = others ? Object.entries(names) : [[SOURCE_LANGUAGE, title]];
						return {
							kind,
							id,
							url: `/${file.game}/${file.kinds[kind].id}/${id}/${slug}/`,
							title,
							names,
							picture,
							keys: all.map(([tag, name]) => ({ tag, key: nameOf(name) })),
						};
					}),
				})),
		);
	return indexes.get(url)!;
}

/**
 * The entries whose names match a search, best first: by `nameScore`, then the shorter name (the closer match), then
 * in the order of the kinds and their ids. Each with the language of its name that matched best.
 */
export function find(index: Index, text: string): Match[] {
	const search = searchOf(text);
	if (!search) return [];
	const found: (Match & { length: number })[] = [];
	for (const entry of index.entries) {
		let best: { score: number; tag: string; length: number } | null = null;
		for (const { tag, key } of entry.keys) {
			const score = nameScore(search, key);
			if (score !== null && (!best || score < best.score || (score === best.score && key.whole.length < best.length)))
				best = { score, tag, length: key.whole.length };
		}
		if (best) found.push({ entry, ...best });
	}
	found.sort((a, b) => a.score - b.score || a.length - b.length || a.entry.kind - b.entry.kind || a.entry.id - b.entry.id);
	return found;
}

/** The language a name shows in, of those it has: the switch's choice, else the first translation, as the styles pick. */
export function shownTag(names: Names) {
	const tags = Object.keys(names);
	if (!tags.length) return SOURCE_LANGUAGE;
	const chosen = document.documentElement.getAttribute('data-ome-lang');
	if (chosen && tags.includes(chosen)) return chosen;
	return tags.find((tag) => tag !== SOURCE_LANGUAGE) ?? tags[0];
}

/** An entry's name, with its picture, and the name that matched when the switch shows another language. */
export function entryHtml(index: Index, { entry, tag }: Match, { thumb = true } = {}) {
	const also = Object.keys(entry.names).length && tag !== shownTag(entry.names);
	return `${thumb ? thumbHtml(index.pictures, entry.picture) : ''}<span class="ome-found-name">${nameHtml(entry.title, entry.names)}${
		also ? `<span class="ome-found-also" lang="${esc(tag)}">${esc(entry.names[tag])}</span>` : ''
	}</span>`;
}

const SUGGESTIONS = 8;

/** A search box (DatabaseSearch.astro): a combobox whose list suggests entries as one types. */
function searchBox(form: HTMLFormElement) {
	const input = form.querySelector<HTMLInputElement>('input[role="combobox"]')!;
	const list = form.querySelector<HTMLElement>('[role="listbox"]')!;
	const url = form.dataset.omeSearch!;
	let options: HTMLElement[] = [];
	let active = -1;

	const close = () => {
		list.hidden = true;
		input.setAttribute('aria-expanded', 'false');
		input.removeAttribute('aria-activedescendant');
		active = -1;
	};
	const activate = (i: number) => {
		options.forEach((option, k) => option.setAttribute('aria-selected', String(k === i)));
		active = i;
		if (i < 0) input.removeAttribute('aria-activedescendant');
		else {
			input.setAttribute('aria-activedescendant', options[i].id);
			options[i].scrollIntoView({ block: 'nearest' });
		}
	};
	const suggest = async () => {
		const text = input.value;
		if (!searchOf(text)) return close();
		let index: Index;
		try {
			index = await loadIndex(url);
		} catch (error) {
			console.warn('the search index did not load', error);
			return close();
		}
		if (input.value !== text) return;
		const found = find(index, text);
		const results = `${form.action}?q=${encodeURIComponent(text.trim())}`;
		const items = found.slice(0, SUGGESTIONS).map(
			(match, i) =>
				`<li role="option" id="${list.id}-${i}" aria-selected="false"><a href="${esc(match.entry.url)}" tabindex="-1">${entryHtml(index, match)}<span class="ome-found-kind">${esc(index.kinds[match.entry.kind].one)}</span></a></li>`,
		);
		items.push(
			`<li role="option" id="${list.id}-all" aria-selected="false" class="ome-found-all"><a href="${esc(results)}" tabindex="-1">${
				found.length
					? `All ${found.length.toLocaleString('en')} ${found.length === 1 ? 'entry' : 'entries'} named “${esc(text.trim())}”`
					: `No entry is named “${esc(text.trim())}”: search the text`
			}</a></li>`,
		);
		list.innerHTML = items.join('');
		options = [...list.querySelectorAll<HTMLElement>('[role="option"]')];
		list.hidden = false;
		input.setAttribute('aria-expanded', 'true');
		activate(-1);
	};

	input.addEventListener('input', suggest);
	input.addEventListener('focus', () => {
		loadIndex(url).catch(() => {});
		if (input.value && list.hidden) suggest();
	});
	input.addEventListener('keydown', (event) => {
		if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
			event.preventDefault();
			if (list.hidden) return void suggest();
			const step = event.key === 'ArrowDown' ? 1 : -1;
			const next = active + step;
			activate(next < -1 ? options.length - 1 : next >= options.length ? -1 : next);
		} else if (event.key === 'Enter' && active >= 0) {
			event.preventDefault();
			location.href = options[active].querySelector('a')!.href;
		} else if (event.key === 'Escape') {
			if (!list.hidden) {
				event.preventDefault();
				close();
			} else if (input.value) {
				event.preventDefault();
				input.value = '';
			}
		}
	});
	// A click on a suggestion keeps the focus in the box, so the list stays until its link is followed.
	list.addEventListener('mousedown', (event) => event.preventDefault());
	input.addEventListener('blur', close);
	form.addEventListener('submit', (event) => {
		if (!input.value.trim()) event.preventDefault();
	});

	// The header's box takes the focus on Ctrl+K (⌘K on Apple's systems) and on "/", as Starlight's search does.
	if (form.hasAttribute('data-ome-shortcut')) {
		const apple = /(Mac|iPhone|iPod|iPad)/i.test(navigator.platform);
		const key = form.querySelector<HTMLElement>('kbd [data-ome-modifier]');
		if (key && apple) key.textContent = '⌘';
		addEventListener('keydown', (event) => {
			const typing = (event.target as HTMLElement).closest?.('input, textarea, select, [contenteditable]');
			if (((apple ? event.metaKey : event.ctrlKey) && event.key.toLowerCase() === 'k') || (event.key === '/' && !typing)) {
				if (input.offsetParent === null) return;
				event.preventDefault();
				input.focus();
				input.select();
			}
		});
	}
}

for (const form of document.querySelectorAll<HTMLFormElement>('form[data-ome-search]')) searchBox(form);
