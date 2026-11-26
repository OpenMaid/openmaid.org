// A table of a kind's entries in the browser (site plan §9.1), drawn from the kind's list file
// (src/lib/columns.mjs `listData`): the columns chosen, each entry's cells in them, and the sorting by any column whose
// heading is pressed. A kind's list page (list-table.ts) adds its filters and keeps it in the address; the search's
// results page (search.ts) shows the entries it found in one.
import { emptyValue, shownNumber, valueItems } from '../lib/format.mjs';
import { SOURCE_LANGUAGE } from '../lib/language.mjs';

export type Names = Record<string, string>;
type Field = {
	name: string;
	refKind: string | null;
	format: { scale: number | null; offset: number | null; unit: string | null; bits: boolean } | null;
	names: Map<number, Names> | null;
};
type Option = { v: number; c: number; t?: string; n?: Names; x?: string };
export type Column = {
	key: string;
	label: string | { title: string; names: Names };
	group: string | null;
	type: 'number' | 'name' | 'mask' | 'entity' | 'entities' | 'list';
	note: string | null;
	quick: boolean;
	filter: 'select' | 'range' | 'text';
	options: Option[] | null;
	/** How many entries a select offers as "no value" (columns.mjs `noneCount`), or null where it offers none. */
	none: number | null;
	field: Field;
	position: number;
};
/** An item of a cell: a link (the index of its entry in `links`), a name, a text or an id no entry has. */
export type Item = number | { t?: string; n?: Names; x?: string; m?: string };
type Link = { i: number; u: string; t: string; n: Names; p?: PictureTuple };
export type Row = { id: number; u: string; t: string; n: Names; p: PictureTuple | null; v: unknown[] };
export type ListFile = { pictures: string; defaults: string[]; columns: Column[]; rows: Row[]; links: Link[] };
export type Sort = { key: string; desc: boolean };
/** A filter of a list: a column and the value it wants, as the address writes it (`3`, `10..20`, `poison`, `none`). */
export type Filter = { column: Column; value: string };
/** The value of a select filter that wants the entries with no value in its column. */
export const NO_VALUE = 'none';

const VALUE_TYPES = new Set(['number', 'name', 'mask']);
/** What a cell sorts by: a number, a text, or for a cell of several items each item's in turn. */
type SortKey = number | string | (number | string)[];

export const esc = (text: unknown) =>
	String(text).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** A name as `Name.astro` draws it: in each language it has one, which the language switch picks from. */
export function nameHtml(title: string, names: Names = {}) {
	const entries = Object.entries(names);
	if (entries.length > 1)
		return entries.map(([tag, name]) => `<span lang="${esc(tag)}" data-ome-text="${esc(tag)}">${esc(name)}</span>`).join(' ');
	if (entries.length === 1) return `<span lang="${SOURCE_LANGUAGE}">${esc(title)}</span>`;
	return esc(title);
}

/** A picture in a list file: its file, width and height, and 1 where the game draws it with its additive glow. */
export type PictureTuple = [string, number, number] | [string, number, number, 1];

/** A picture's classes, as `Picture.astro` gives them: a small one's pixels kept sharp, an additive one on a dark tile. */
const pictureClass = (picture: PictureTuple) => {
	const classes = [...(picture[1] <= 32 && picture[2] <= 32 ? ['ome-pixel'] : []), ...(picture[3] ? ['ome-additive'] : [])];
	return classes.length > 0 ? ` class="${classes.join(' ')}"` : '';
};

/** A thumbnail beside a name, as `Value.astro` draws it; an empty box keeps the names in line where an entry has none. */
export function thumbHtml(pictures: string, picture: PictureTuple | null | 0) {
	const img = picture
		? `<img src="${esc(pictures + picture[0])}" alt="" width="${picture[1]}" height="${picture[2]}" loading="lazy"${pictureClass(picture)}>`
		: '';
	return `<span class="ome-row-thumb" aria-hidden="true">${img}</span>`;
}

/** An entry's icon in a link's line of text, as `Value.astro` draws it (site.config.mjs `linkIcons`). */
export function iconHtml(pictures: string, picture: PictureTuple) {
	return `<span class="ome-link-icon" aria-hidden="true"><img src="${esc(pictures + picture[0])}" alt="" width="${picture[1]}" height="${picture[2]}" loading="lazy"${pictureClass(picture)}></span>`;
}

/** The language a game's text shows in: the switch's choice, else the page's first translation. */
export const shownLanguage = (fallback = SOURCE_LANGUAGE) => document.documentElement.getAttribute('data-ome-lang') ?? fallback;

const lists = new Map<string, Promise<ListFile>>();

/** A kind's list file, loaded once a page, its columns ready to draw (their positions, their values' names as maps). */
export function loadList(url: string): Promise<ListFile> {
	if (!lists.has(url))
		lists.set(
			url,
			fetch(url)
				.then((response) => (response.ok ? response.json() : Promise.reject(new Error(`${url}: ${response.status}`))))
				.then((file: ListFile) => {
					file.columns.forEach((column, position) => {
						column.position = position;
						const names = column.field.names as unknown as Record<string, Names> | null;
						column.field.names = names ? new Map(Object.entries(names).map(([v, n]) => [Number(v), n])) : null;
					});
					return file;
				}),
		);
	return lists.get(url)!;
}

type Options = {
	/** The columns shown first, by key. */
	shown: string[];
	/** The sorting; none keeps the rows in the order `draw` is given them. */
	sort: Sort | null;
	/** The language names sort in. */
	language: () => string;
	/** Called when a heading is pressed and the sorting changed, to draw the table again. */
	onSort: () => void;
	/** An entry's name in its link, where it is more than the name (the search's results add the name that matched). */
	name?: (row: Row) => string;
};

/**
 * A table of a list file's entries: `draw` fills `table` (a `<table>` with a `<thead>` and a `<tbody>`) with the rows
 * it is given, in the columns `state.shown`, sorted by `state.sort`.
 */
export function listTable(file: ListFile, table: HTMLTableElement, options: Options) {
	const { columns, links } = file;
	const byKey = new Map(columns.map((column) => [column.key, column]));
	const pictured = file.rows.some((row) => row.p);
	const state = { shown: options.shown.filter((key) => byKey.has(key)), sort: options.sort };
	const named = (title: string, names: Names | undefined, tag = options.language()) => names?.[tag] ?? title;

	// What an entry's cell shows, as markup and as the text a filter searches.
	const items = (column: Column, row: Row): Item[] => row.v[column.position] as Item[];
	const valueOf = (column: Column, row: Row) => row.v[column.position] as number | null;
	const itemHtml = (item: Item) => {
		if (typeof item === 'number') {
			const link = links[item];
			return link.p
				? `<a href="${esc(link.u)}" class="ome-thumbed">${iconHtml(file.pictures, link.p)}${nameHtml(link.t, link.n)}</a>`
				: `<a href="${esc(link.u)}">${nameHtml(link.t, link.n)}</a>`;
		}
		if (item.m) return `<span class="ome-missing">${esc(item.m)} (no such entry)</span>`;
		if (item.n) return nameHtml(item.t ?? '', item.n);
		return esc(item.x ?? '');
	};
	const valueHtml = (column: Column, v: number | null) =>
		emptyValue(column.field, column.type, v)
			? ''
			: valueItems(column.field, v)
					.map((i: { text?: string; title?: string; names?: Names }) => (i.names ? nameHtml(i.title ?? '', i.names) : esc(i.text)))
					.join(', ');
	const cellHtml = (column: Column, row: Row) =>
		VALUE_TYPES.has(column.type) ? valueHtml(column, valueOf(column, row)) : items(column, row).map(itemHtml).join(', ');
	const texts = new Map<string, string>();
	const cellText = (column: Column, row: Row) => {
		const key = `${row.id}:${column.key}`;
		if (!texts.has(key)) {
			const words: string[] = [];
			const add = (t?: string, n?: Names) => words.push(t ?? '', ...Object.values(n ?? {}));
			if (VALUE_TYPES.has(column.type)) {
				const v = valueOf(column, row);
				if (!emptyValue(column.field, column.type, v))
					for (const i of valueItems(column.field, v) as { text?: string; title?: string; names?: Names }[]) add(i.text ?? i.title, i.names);
			} else
				for (const item of items(column, row)) {
					if (typeof item === 'number') add(links[item].t, links[item].n);
					else add(item.t ?? item.x ?? item.m, item.n);
				}
			texts.set(key, words.join(' ').toLowerCase());
		}
		return texts.get(key)!;
	};

	// The table: its heading, each column's a button that sorts by it, and its rows, each drawn once for the columns shown.
	const order = (key: string) => (file.defaults.includes(key) ? file.defaults.indexOf(key) : file.defaults.length + byKey.get(key)!.position);
	const visible = () => state.shown.map((key) => byKey.get(key)!);
	const labelHtml = (column: Column) => {
		const text = typeof column.label === 'string' ? esc(column.label) : nameHtml(column.label.title, column.label.names);
		const label = column.note ? `<span class="ome-noted" title="${esc(column.note)}">${text}</span>` : text;
		return `${column.group ? `<span class="ome-col-group">${esc(column.group)}</span>` : ''}${label}`;
	};
	const headingHtml = (key: string, inner: string, numeric: boolean) => {
		const sorted = state.sort?.key === key ? (state.sort.desc ? 'descending' : 'ascending') : null;
		const attributes = `${numeric ? ' class="ome-num"' : ''}${sorted ? ` aria-sort="${sorted}"` : ''}`;
		return `<th scope="col"${attributes}><button type="button" class="ome-sort" data-sort="${esc(key)}">${inner}<span class="ome-sort-mark" aria-hidden="true"></span></button></th>`;
	};
	const drawHead = () => {
		const head = [
			headingHtml('id', 'ID', true),
			headingHtml('name', 'Name', false),
			...visible().map((column) => headingHtml(column.key, labelHtml(column), column.type === 'number')),
		];
		table.tHead!.innerHTML = `<tr>${head.join('')}</tr>`;
	};
	let drawn = new Map<Row, string>();
	const rowHtml = (row: Row) => {
		if (!drawn.has(row)) {
			const cells = visible().map((column) => {
				const kind = column.type === 'number' ? ' class="ome-num"' : column.type === 'entities' || column.type === 'list' ? ' class="ome-wrap"' : '';
				return `<td${kind}>${cellHtml(column, row)}</td>`;
			});
			drawn.set(
				row,
				`<tr><td class="ome-num">${row.id}</td><td><a href="${esc(row.u)}"${pictured ? ' class="ome-thumbed"' : ''}>${pictured ? thumbHtml(file.pictures, row.p) : ''}${options.name ? options.name(row) : nameHtml(row.t, row.n)}</a></td>${cells.join('')}</tr>`,
			);
		}
		return drawn.get(row)!;
	};

	// Sorting: numbers as they read, a named value in the game's order of its values, a mask by the values it has in that
	// order, a name or a reference by its name in the language shown, a cell of several references or a list by each
	// item in turn (a list's numbers as numbers); empty cells last either way, and the id between equals.
	const itemName = (item: Item) =>
		typeof item === 'number' ? named(links[item].t, links[item].n) : named(item.t ?? item.x ?? item.m ?? '', item.n);
	// The values a mask shows (format.mjs `valueItems`): its named ones, or every bit it has where none is named.
	const maskValues = (field: Field, v: number) => {
		const set: number[] = [];
		for (let k = 0; k < 31; k++) if (v & (1 << k)) set.push(k);
		const namedSet = set.filter((k) => field.names?.has(k));
		return namedSet.length ? namedSet : set;
	};
	const sortKey = (sort: Sort, row: Row): SortKey | null => {
		if (sort.key === 'id') return row.id;
		if (sort.key === 'name') return named(row.t, row.n);
		const column = byKey.get(sort.key)!;
		if (column.type === 'entity') {
			const item = items(column, row)[0];
			return typeof item === 'number' ? named(links[item].t, links[item].n) : null;
		}
		if (column.type === 'entities' || column.type === 'list') {
			const list = items(column, row);
			return list.length ? list.map(itemName) : null;
		}
		const v = valueOf(column, row);
		if (emptyValue(column.field, column.type, v))
			return column.type === 'number' && v === 0 && column.field.format?.none !== 0 ? 0 : null;
		if (column.type === 'mask' && column.field.format?.bits) return maskValues(column.field, v!);
		return column.type === 'number' ? shownNumber(column.field, v) : v;
	};
	const sorted = (list: Row[]) => {
		const sort = state.sort;
		if (!sort) return list;
		const collator = new Intl.Collator(options.language(), { numeric: byKey.get(sort.key)?.type === 'list' });
		// Item by item; a cell whose items begin another's sorts before it.
		const compare = (a: SortKey, b: SortKey): number => {
			if (Array.isArray(a) && Array.isArray(b)) {
				for (let i = 0; i < Math.min(a.length, b.length); i++) {
					const by = compare(a[i], b[i]);
					if (by) return by;
				}
				return a.length - b.length;
			}
			return typeof a === 'string' ? collator.compare(a, b as string) : (a as number) - (b as number);
		};
		const keyed = list.map((row) => ({ row, key: sortKey(sort, row) }));
		keyed.sort((a, b) => {
			if (a.key === null || b.key === null) return a.key === b.key ? a.row.id - b.row.id : a.key === null ? 1 : -1;
			const by = compare(a.key, b.key);
			return (sort.desc ? -by : by) || a.row.id - b.row.id;
		});
		return keyed.map(({ row }) => row);
	};

	/** Whether an entry's cell shows nothing, as columns.mjs `cellItems` gives it none (its `noneCount`). */
	const isEmpty = (column: Column, row: Row) =>
		VALUE_TYPES.has(column.type) ? emptyValue(column.field, column.type, valueOf(column, row)) : items(column, row).length === 0;

	/** Whether an entry passes a filter, by its column's kind of filter (columns.mjs `filterOf`). */
	const matches = (row: Row, { column, value }: Filter) => {
		if (column.filter === 'text') return cellText(column, row).includes(value.toLowerCase());
		if (column.filter === 'select' && value === NO_VALUE) return isEmpty(column, row);
		if (column.filter === 'range') {
			const v = valueOf(column, row);
			if (v === null || v === undefined) return false;
			const n = shownNumber(column.field, v);
			const [from, to] = value.split('..').map((bound) => (bound === '' ? null : Number(bound)));
			return (from === null || Number.isNaN(from) || n >= from) && (to === null || Number.isNaN(to) || n <= to);
		}
		const wanted = Number(value);
		if (column.type === 'mask') return Boolean((valueOf(column, row) ?? 0) & (1 << wanted));
		if (column.type === 'entity') return items(column, row).some((item) => typeof item === 'number' && links[item].i === wanted);
		return valueOf(column, row) === wanted;
	};

	/** Fills the table with these rows, sorted; `head` draws the heading again, for a change of columns or sorting. */
	const draw = (rows: Row[], { head = false }: { head?: boolean } = {}) => {
		state.shown.sort((a, b) => order(a) - order(b));
		if (head) {
			drawn = new Map();
			drawHead();
		}
		table.tBodies[0].innerHTML = sorted(rows).map(rowHtml).join('');
		// The box the table scrolls in marks its edges again (public/scroll-edges.js).
		table.parentElement?.dispatchEvent(new Event('scroll'));
	};

	table.tHead!.addEventListener('click', (event) => {
		const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-sort]');
		if (!button) return;
		const key = button.dataset.sort!;
		const column = byKey.get(key);
		// A number sorts from the highest first, a name from the start of the alphabet.
		state.sort = state.sort?.key === key ? { key, desc: !state.sort.desc } : { key, desc: column?.type === 'number' };
		options.onSort();
	});

	const byName = new Set(['entity', 'entities', 'list']);
	return { state, byKey, visible, draw, matches, sortsByName: () => state.sort?.key === 'name' || byName.has(byKey.get(state.sort?.key ?? '')?.type ?? '') };
}
