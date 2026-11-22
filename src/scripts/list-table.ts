// A kind's list in the browser (site plan §9.1): draws the list page's table from the kind's list file
// (src/lib/columns.mjs `listData`) with the columns a visitor chooses, sorted by the column whose heading they pressed,
// and filtered by the name and by any column. The page's table, drawn by the build with the default columns, shows
// until the file is in, and without scripts. The columns, the sorting and the filters are kept in the page's address,
// so a list as a visitor made it can be linked.
import { emptyValue, shownNumber, valueItems } from '../lib/format.mjs';
import { SOURCE_LANGUAGE } from '../lib/language.mjs';

type Names = Record<string, string>;
type Field = {
	name: string;
	refKind: string | null;
	format: { scale: number | null; offset: number | null; unit: string | null; bits: boolean } | null;
	names: Map<number, Names> | null;
};
type Option = { v: number; c: number; t?: string; n?: Names; x?: string };
type Column = {
	key: string;
	label: string | { title: string; names: Names };
	group: string | null;
	type: 'number' | 'name' | 'mask' | 'entity' | 'entities' | 'list';
	note: string | null;
	quick: boolean;
	filter: 'select' | 'range' | 'text';
	options: Option[] | null;
	field: Field;
	position: number;
};
/** An item of a cell: a link (the index of its entry in `links`), a name, a text or an id no entry has. */
type Item = number | { t?: string; n?: Names; x?: string; m?: string };
type Link = { i: number; u: string; t: string; n: Names };
type Row = { id: number; u: string; t: string; n: Names; p: [string, number, number] | null; v: unknown[] };
type ListFile = { pictures: string; defaults: string[]; columns: Column[]; rows: Row[]; links: Link[] };
type Sort = { key: string; desc: boolean };

const VALUE_TYPES = new Set(['number', 'name', 'mask']);
const SORTED = new Set(['number', 'name', 'entity']);
const OWN = new Set(['q', 'cols', 'sort']);

const esc = (text: unknown) =>
	String(text).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** A name as `Name.astro` draws it: in each language it has one, which the language switch picks from. */
function nameHtml(title: string, names: Names = {}) {
	const entries = Object.entries(names);
	if (entries.length > 1)
		return entries.map(([tag, name]) => `<span lang="${esc(tag)}" data-ome-text="${esc(tag)}">${esc(name)}</span>`).join(' ');
	if (entries.length === 1) return `<span lang="${SOURCE_LANGUAGE}">${esc(title)}</span>`;
	return esc(title);
}

const table = document.querySelector<HTMLTableElement>('table[data-ome-list]');
const form = document.querySelector<HTMLFormElement>('form[data-ome-filters]');
if (table && form)
	fetch(table.dataset.omeList!)
		.then((response) => (response.ok ? response.json() : Promise.reject(new Error(`${response.status}`))))
		.then((file: ListFile) => start(table, form, file))
		.catch((error) => console.warn('the list file did not load; the list stays as the build drew it', error));

function start(table: HTMLTableElement, form: HTMLFormElement, file: ListFile) {
	const { columns, rows, links } = file;
	columns.forEach((column, position) => {
		column.position = position;
		const names = column.field.names as unknown as Record<string, Names> | null;
		column.field.names = names ? new Map(Object.entries(names).map(([v, n]) => [Number(v), n])) : null;
	});
	const byKey = new Map(columns.map((column) => [column.key, column]));
	const pictured = rows.some((row) => row.p);
	const language = () => document.documentElement.getAttribute('data-ome-lang') ?? form.dataset.lang ?? SOURCE_LANGUAGE;
	const named = (title: string, names: Names | undefined, tag = language()) => names?.[tag] ?? title;

	// The state: the name searched for, the columns shown, the sorting and the filters, from the address.
	const params = new URLSearchParams(location.search);
	let shown = params.has('cols') ? params.get('cols')!.split(',').filter((key) => byKey.has(key)) : [...file.defaults];
	const sortParam = params.get('sort');
	let sort: Sort =
		sortParam && (byKey.has(sortParam.replace(/^-/, '')) || ['id', 'name'].includes(sortParam.replace(/^-/, '')))
			? { key: sortParam.replace(/^-/, ''), desc: sortParam.startsWith('-') }
			: { key: 'id', desc: false };
	const added = [...params.keys()].filter((key) => !OWN.has(key) && byKey.has(key) && !byKey.get(key)!.quick);

	// What an entry's cell shows, as markup and as the text a filter searches.
	const items = (column: Column, row: Row): Item[] => row.v[column.position] as Item[];
	const valueOf = (column: Column, row: Row) => row.v[column.position] as number | null;
	const itemHtml = (item: Item) => {
		if (typeof item === 'number') {
			const link = links[item];
			return `<a href="${esc(link.u)}">${nameHtml(link.t, link.n)}</a>`;
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

	// The table: its heading, each sortable column's a button, and its rows, each drawn once for the columns shown.
	const order = (key: string) => (file.defaults.includes(key) ? file.defaults.indexOf(key) : file.defaults.length + byKey.get(key)!.position);
	const visible = () => shown.map((key) => byKey.get(key)!);
	const labelHtml = (column: Column) => {
		const text = typeof column.label === 'string' ? esc(column.label) : nameHtml(column.label.title, column.label.names);
		const label = column.note ? `<span class="ome-noted" title="${esc(column.note)}">${text}</span>` : text;
		return `${column.group ? `<span class="ome-col-group">${esc(column.group)}</span>` : ''}${label}`;
	};
	const headingHtml = (key: string, inner: string, numeric: boolean, sortable: boolean) => {
		const sorted = sort.key === key ? (sort.desc ? 'descending' : 'ascending') : null;
		const attributes = `${numeric ? ' class="ome-num"' : ''}${sorted ? ` aria-sort="${sorted}"` : ''}`;
		if (!sortable) return `<th scope="col"${attributes}>${inner}</th>`;
		return `<th scope="col"${attributes}><button type="button" class="ome-sort" data-sort="${esc(key)}">${inner}<span class="ome-sort-mark" aria-hidden="true"></span></button></th>`;
	};
	const drawHead = () => {
		const head = [
			headingHtml('id', 'ID', true, true),
			headingHtml('name', 'Name', false, true),
			...visible().map((column) => headingHtml(column.key, labelHtml(column), column.type === 'number', SORTED.has(column.type))),
		];
		table.tHead!.innerHTML = `<tr>${head.join('')}</tr>`;
	};
	let drawn = new Map<Row, string>();
	const rowHtml = (row: Row) => {
		if (!drawn.has(row)) {
			const thumb = pictured
				? `<span class="ome-row-thumb" aria-hidden="true">${
						row.p
							? `<img src="${esc(file.pictures + row.p[0])}" alt="" width="${row.p[1]}" height="${row.p[2]}" loading="lazy"${row.p[1] <= 32 && row.p[2] <= 32 ? ' class="ome-pixel"' : ''}>`
							: ''
					}</span>`
				: '';
			const cells = visible().map((column) => {
				const kind = column.type === 'number' ? ' class="ome-num"' : column.type === 'entities' || column.type === 'list' ? ' class="ome-wrap"' : '';
				return `<td${kind}>${cellHtml(column, row)}</td>`;
			});
			drawn.set(
				row,
				`<tr><td class="ome-num">${row.id}</td><td><a href="${esc(row.u)}"${pictured ? ' class="ome-thumbed"' : ''}>${thumb}${nameHtml(row.t, row.n)}</a></td>${cells.join('')}</tr>`,
			);
		}
		return drawn.get(row)!;
	};

	// Sorting: numbers as they read, a named value in the game's order of its values, a name or a reference by its name in
	// the language shown; empty cells last either way, and the id between equals.
	const sortKey = (row: Row): number | string | null => {
		if (sort.key === 'id') return row.id;
		if (sort.key === 'name') return named(row.t, row.n);
		const column = byKey.get(sort.key)!;
		if (column.type === 'entity') {
			const item = items(column, row)[0];
			return typeof item === 'number' ? named(links[item].t, links[item].n) : null;
		}
		const v = valueOf(column, row);
		if (emptyValue(column.field, column.type, v)) return column.type === 'number' && v === 0 ? 0 : null;
		return column.type === 'number' ? shownNumber(column.field, v) : v;
	};
	const sorted = (list: Row[]) => {
		const tag = language();
		const keyed = list.map((row) => ({ row, key: sortKey(row) }));
		keyed.sort((a, b) => {
			if (a.key === null || b.key === null) return a.key === b.key ? a.row.id - b.row.id : a.key === null ? 1 : -1;
			const by = typeof a.key === 'string' ? a.key.localeCompare(b.key as string, tag) : a.key - (b.key as number);
			return (sort.desc ? -by : by) || a.row.id - b.row.id;
		});
		return keyed.map(({ row }) => row);
	};

	// Filtering: every filter at once, each by its column's kind of filter (columns.mjs `filterOf`).
	type Filter = { column: Column; value: string };
	const readFilters = (): Filter[] => {
		const filters: Filter[] = [];
		for (const control of form.querySelectorAll<HTMLElement>('[data-filter]')) {
			const column = byKey.get(control.dataset.filter!)!;
			if (column.filter === 'range') {
				const [from, to] = [...control.querySelectorAll('input')].map((input) => input.value.trim());
				if (from || to) filters.push({ column, value: `${from}..${to}` });
			} else {
				const value = (control as HTMLInputElement | HTMLSelectElement).value.trim();
				if (value) filters.push({ column, value });
			}
		}
		return filters;
	};
	const matches = (row: Row, { column, value }: Filter) => {
		if (column.filter === 'text') return cellText(column, row).includes(value.toLowerCase());
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

	// The controls: the name and the quick filters the build drew, a filter added for any other column, the columns to
	// show, and the count.
	const nameInput = form.querySelector<HTMLInputElement>('input[name="q"]')!;
	const count = form.querySelector<HTMLOutputElement>('output[data-ome-count]')!;
	const tools = form.querySelector<HTMLElement>('[data-ome-tools]')!;
	const addedBox = form.querySelector<HTMLElement>('[data-ome-added]')!;
	nameInput.value = params.get('q') ?? '';
	for (const select of form.querySelectorAll<HTMLSelectElement>('select[data-filter]'))
		select.value = params.get(select.dataset.filter!) ?? '';

	const optionsHtml = (column: Column) =>
		`<option value="">all</option>${column
			.options!.map(
				(o) =>
					`<option value="${o.v}" data-count="${o.c}"${o.n ? ` data-names="${esc(JSON.stringify(o.n))}"` : ''}>${esc(o.t ?? o.x)} (${o.c})</option>`,
			)
			.join('')}`;
	const textOf = (column: Column) => (typeof column.label === 'string' ? column.label : column.label.title);
	const fullLabel = (column: Column) => (column.group ? `${column.group}: ${textOf(column)}` : textOf(column));
	const addFilter = (column: Column, value = '') => {
		const box = document.createElement('span');
		box.className = 'ome-filter';
		box.dataset.box = column.key;
		const label = `<span class="ome-filter-label">${column.group ? `${esc(column.group)}: ` : ''}${
			typeof column.label === 'string' ? esc(column.label) : nameHtml(column.label.title, column.label.names)
		}</span>`;
		let control: string;
		if (column.filter === 'select') control = `<select data-filter="${esc(column.key)}">${optionsHtml(column)}</select>`;
		else if (column.filter === 'range') {
			const [from, to] = value.split('..');
			control = `<span class="ome-range" data-filter="${esc(column.key)}"><input type="number" step="any" inputmode="decimal" aria-label="From" placeholder="from" value="${esc(from ?? '')}"><span aria-hidden="true">–</span><input type="number" step="any" inputmode="decimal" aria-label="To" placeholder="to" value="${esc(to ?? '')}"></span>`;
		} else control = `<input type="search" data-filter="${esc(column.key)}" autocomplete="off" placeholder="contains" value="${esc(value)}">`;
		box.innerHTML = `<label>${label} ${control}</label><button type="button" class="ome-remove" data-remove="${esc(column.key)}" aria-label="Remove the filter on ${esc(fullLabel(column))}">×</button>`;
		addedBox.append(box);
		if (column.filter === 'select') box.querySelector('select')!.value = value;
		relabel(box);
	};

	// The tools: a menu of the columns to filter on, and the columns to show.
	const groups = new Map<string, Column[]>();
	for (const column of columns) {
		const group = column.group ?? 'Details';
		if (!groups.has(group)) groups.set(group, []);
		groups.get(group)!.push(column);
	}
	const details = groups.get('Details');
	const grouped = details ? [['Details', details] as const, ...[...groups].filter(([group]) => group !== 'Details')] : [...groups];
	if (columns.length) {
		const filterable = grouped
			.map(([group, list]) => [group, list.filter((column) => !column.quick)] as const)
			.filter(([, list]) => list.length);
		tools.innerHTML = `${
			filterable.length
				? `<label>Filter on <select data-ome-add><option value="">a column…</option>${filterable
						.map(
							([group, list]) =>
								`<optgroup label="${esc(group)}">${list
									.map(
										(column) =>
											`<option value="${esc(column.key)}"${typeof column.label === 'string' ? '' : ` data-names="${esc(JSON.stringify(column.label.names))}"`}>${esc(textOf(column))}</option>`,
									)
									.join('')}</optgroup>`,
						)
						.join('')}</select></label>`
				: ''
		}<details class="ome-choose"><summary>Columns</summary><div class="ome-choose-panel">
			<p><button type="button" data-cols="default">Default columns</button> <button type="button" data-cols="none">None</button></p>
			${grouped
				.map(
					([group, list]) =>
						`<fieldset><legend>${esc(group)}</legend>${list
							.map(
								(column) =>
									`<label><input type="checkbox" value="${esc(column.key)}"> ${
										typeof column.label === 'string' ? esc(column.label) : nameHtml(column.label.title, column.label.names)
									}</label>`,
							)
							.join('')}</fieldset>`,
				)
				.join('')}
		</div></details>`;
	}
	tools.insertAdjacentHTML('beforeend', '<button type="button" data-ome-clear hidden>Clear filters</button>');
	for (const key of added) addFilter(byKey.get(key)!, params.get(key)!);
	const addSelect = tools.querySelector<HTMLSelectElement>('select[data-ome-add]');
	const chooser = tools.querySelector<HTMLDetailsElement>('details.ome-choose');
	const clear = tools.querySelector<HTMLButtonElement>('[data-ome-clear]')!;

	// An option of a select names a value in the language of the game text shown (DatabaseSwitches.astro), as the cells
	// do, with its count.
	function relabel(root: ParentNode = form!) {
		const tag = language();
		for (const option of root.querySelectorAll<HTMLOptionElement>('option[data-names]')) {
			const names: Names = JSON.parse(option.dataset.names!);
			const text = names[tag] ?? names[SOURCE_LANGUAGE] ?? Object.values(names)[0];
			option.textContent = option.dataset.count ? `${text} (${option.dataset.count})` : text;
		}
	}

	const update = ({ head = false }: { head?: boolean } = {}) => {
		shown.sort((a, b) => order(a) - order(b));
		if (head) {
			drawn = new Map();
			drawHead();
		}
		const filters = readFilters();
		const q = nameInput.value.trim().toLowerCase();
		const found = rows.filter(
			(row) =>
				(!q || [row.t, ...Object.values(row.n)].some((name) => name.toLowerCase().includes(q))) &&
				filters.every((filter) => matches(row, filter)),
		);
		table.tBodies[0].innerHTML = sorted(found).map(rowHtml).join('');
		// The box the table scrolls in marks its edges again (public/scroll-edges.js).
		table.parentElement?.dispatchEvent(new Event('scroll'));
		count.textContent = found.length === rows.length ? `${rows.length} shown` : `${found.length} of ${rows.length} shown`;
		clear.hidden = !q && !filters.length;
		if (chooser) {
			for (const box of chooser.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')) box.checked = shown.includes(box.value);
			chooser.querySelector('summary')!.textContent = `Columns (${shown.length})`;
		}
		if (addSelect)
			for (const option of addSelect.querySelectorAll<HTMLOptionElement>('option[value]:not([value=""])'))
				option.disabled = Boolean(addedBox.querySelector(`[data-box="${CSS.escape(option.value)}"]`));
		// The address keeps the list as it is shown.
		const next = new URLSearchParams();
		if (q) next.set('q', nameInput.value.trim());
		for (const { column, value } of filters) next.set(column.key, value);
		for (const box of addedBox.querySelectorAll<HTMLElement>('[data-box]'))
			if (!next.has(box.dataset.box!)) next.set(box.dataset.box!, '');
		if (shown.join(',') !== file.defaults.join(',')) next.set('cols', shown.join(','));
		if (sort.key !== 'id' || sort.desc) next.set('sort', `${sort.desc ? '-' : ''}${sort.key}`);
		const url = new URL(location.href);
		url.search = next.toString();
		history.replaceState(history.state, '', url);
	};

	form.addEventListener('input', (event) => {
		const target = event.target as HTMLElement;
		if (target === addSelect) return;
		if (target instanceof HTMLInputElement && target.type === 'checkbox') {
			shown = target.checked ? [...shown, target.value] : shown.filter((key) => key !== target.value);
			update({ head: true });
			return;
		}
		update();
	});
	form.addEventListener('submit', (event) => event.preventDefault());
	addSelect?.addEventListener('change', () => {
		const column = byKey.get(addSelect.value);
		addSelect.value = '';
		if (!column) return;
		addFilter(column);
		addedBox.querySelector<HTMLElement>(`[data-box="${CSS.escape(column.key)}"] select, [data-box="${CSS.escape(column.key)}"] input`)?.focus();
		update();
	});
	form.addEventListener('click', (event) => {
		const button = (event.target as HTMLElement).closest('button');
		if (!button) return;
		if (button.dataset.remove) {
			addedBox.querySelector(`[data-box="${CSS.escape(button.dataset.remove)}"]`)?.remove();
			update();
		} else if (button.dataset.cols) {
			shown = button.dataset.cols === 'default' ? [...file.defaults] : [];
			update({ head: true });
		} else if (button === clear) {
			nameInput.value = '';
			for (const select of form.querySelectorAll<HTMLSelectElement>('select[data-filter]')) select.value = '';
			addedBox.replaceChildren();
			update();
		}
	});
	table.tHead!.addEventListener('click', (event) => {
		const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-sort]');
		if (!button) return;
		const key = button.dataset.sort!;
		const column = byKey.get(key);
		// A number sorts from the highest first, a name from the start of the alphabet.
		sort = sort.key === key ? { key, desc: !sort.desc } : { key, desc: column?.type === 'number' };
		update({ head: true });
	});
	// The column menu closes on a click outside it and on Escape.
	document.addEventListener('click', (event) => {
		if (chooser?.open && !chooser.contains(event.target as Node)) chooser.open = false;
	});
	chooser?.addEventListener('keydown', (event) => {
		if (event.key === 'Escape' && chooser.open) {
			chooser.open = false;
			chooser.querySelector('summary')!.focus();
		}
	});
	// A sort by name follows the language shown.
	new MutationObserver(() => {
		relabel();
		if (sort.key === 'name' || byKey.get(sort.key)?.type === 'entity') update();
	}).observe(document.documentElement, { attributes: true, attributeFilter: ['data-ome-lang'] });

	tools.hidden = false;
	relabel();
	update({ head: true });
}
