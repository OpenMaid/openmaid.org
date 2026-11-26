// A kind's list in the browser (site plan §9.1): draws the list page's table from the kind's list file (list-view.ts)
// with the columns a visitor chooses, sorted by the column whose heading they pressed, and filtered by the name and by
// the filters they add on any column ("Filter on", the columns shown first). The page's table, drawn by the build with
// the default columns, shows until the file is in, and without scripts. The columns, the sorting and the filters are
// kept in the page's address, so a list as a visitor made it can be linked; the search's results link a kind's list
// with their search as its name (§9.2), which matches names as the search does (lib/match.mjs).
import { SOURCE_LANGUAGE } from '../lib/language.mjs';
import { namesMatch } from '../lib/match.mjs';
import { esc, listTable, loadList, nameHtml, NO_VALUE, shownLanguage, type Column, type Filter, type ListFile, type Names } from './list-view.ts';

const OWN = new Set(['q', 'cols', 'sort']);

const table = document.querySelector<HTMLTableElement>('table[data-ome-list]');
const form = document.querySelector<HTMLFormElement>('form[data-ome-filters]');
if (table && form)
	loadList(table.dataset.omeList!)
		.then((file) => start(table, form, file))
		.catch((error) => console.warn('the list file did not load; the list stays as the build drew it', error));

function start(table: HTMLTableElement, form: HTMLFormElement, file: ListFile) {
	const { columns, rows } = file;
	const language = () => shownLanguage(form.dataset.lang);

	// The state: the name searched for, the columns shown, the sorting and the filters, from the address.
	const params = new URLSearchParams(location.search);
	const byKeyOf = new Map(columns.map((column) => [column.key, column]));
	const sortParam = params.get('sort');
	const sortKey = sortParam?.replace(/^-/, '');
	const view = listTable(file, table, {
		shown: params.has('cols') ? params.get('cols')!.split(',') : [...file.defaults],
		sort:
			sortKey && (byKeyOf.has(sortKey) || ['id', 'name'].includes(sortKey))
				? { key: sortKey, desc: sortParam!.startsWith('-') }
				: { key: 'id', desc: false },
		language,
		onSort: () => update({ head: true }),
	});
	const { state, byKey, visible } = view;
	const added = [...params.keys()].filter((key) => !OWN.has(key) && byKey.has(key));

	// The filters set: every one at once.
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

	// The controls: the name, which the build drew, the filters added on columns, the menu that adds one, the columns to
	// show, and the count. A number reads with its thousands grouped, as the cells' do (format.mjs).
	const nameInput = form.querySelector<HTMLInputElement>('input[name="q"]')!;
	const count = form.querySelector<HTMLOutputElement>('output[data-ome-count]')!;
	const tools = form.querySelector<HTMLElement>('[data-ome-tools]')!;
	const addedBox = form.querySelector<HTMLElement>('[data-ome-added]')!;
	const number = (n: number) => n.toLocaleString('en');
	nameInput.value = params.get('q') ?? '';

	// "no value" follows "all" where some entries have no value in the column (columns.mjs `noneCount`).
	const optionsHtml = (column: Column) =>
		`<option value="">all</option>${
			column.none ? `<option value="${NO_VALUE}" data-count="${number(column.none)}">no value (${number(column.none)})</option>` : ''
		}${column
			.options!.map(
				(o) =>
					`<option value="${o.v}" data-count="${number(o.c)}"${o.n ? ` data-names="${esc(JSON.stringify(o.n))}"` : ''}>${esc(o.t ?? o.x)} (${number(o.c)})</option>`,
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

	// The tools: the menu of the columns to filter on, and the columns to show, each by group.
	const groups = new Map<string, Column[]>();
	for (const column of columns) {
		const group = column.group ?? 'Details';
		if (!groups.has(group)) groups.set(group, []);
		groups.get(group)!.push(column);
	}
	const details = groups.get('Details');
	const grouped = details ? [['Details', details] as const, ...[...groups].filter(([group]) => group !== 'Details')] : [...groups];
	if (columns.length) {
		tools.innerHTML = `<label>Filter on <select data-ome-add></select></label><details class="ome-choose"><summary>Columns</summary><div class="ome-choose-panel">
			<p><button type="button" data-cols="default">Default columns</button> <button type="button" data-cols="none">None</button></p>
			<div class="ome-choose-groups">${grouped
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
				.join('')}</div>
		</div></details>`;
	}
	tools.insertAdjacentHTML('beforeend', '<button type="button" data-ome-clear hidden>Clear filters</button>');
	for (const key of added) addFilter(byKey.get(key)!, params.get(key)!);
	const addSelect = tools.querySelector<HTMLSelectElement>('select[data-ome-add]');
	const chooser = tools.querySelector<HTMLDetailsElement>('details.ome-choose');
	const clear = tools.querySelector<HTMLButtonElement>('[data-ome-clear]')!;
	// The menu that adds a filter: the columns shown first, in the table's order, then the others by group; a column
	// filtered on already is greyed.
	const optionHtml = (column: Column) =>
		`<option value="${esc(column.key)}"${typeof column.label === 'string' ? '' : ` data-names="${esc(JSON.stringify(column.label.names))}"`}${
			addedBox.querySelector(`[data-box="${CSS.escape(column.key)}"]`) ? ' disabled' : ''
		}>${esc(column.group && state.shown.includes(column.key) ? `${column.group}: ${textOf(column)}` : textOf(column))}</option>`;
	const drawAddMenu = () => {
		if (!addSelect) return;
		const others = grouped
			.map(([group, list]) => [group, list.filter((column) => !state.shown.includes(column.key))] as const)
			.filter(([, list]) => list.length);
		addSelect.innerHTML = `<option value="">a column…</option>${
			state.shown.length ? `<optgroup label="Shown columns">${visible().map(optionHtml).join('')}</optgroup>` : ''
		}${others.map(([group, list]) => `<optgroup label="${esc(group)}">${list.map(optionHtml).join('')}</optgroup>`).join('')}`;
		relabel(addSelect);
	};

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
		const filters = readFilters();
		const q = nameInput.value.trim();
		const found = rows.filter((row) => namesMatch(q, [row.t, ...Object.values(row.n)]) && filters.every((filter) => view.matches(row, filter)));
		view.draw(found, { head });
		count.textContent =
			found.length === rows.length ? `${number(rows.length)} shown` : `${number(found.length)} of ${number(rows.length)} shown`;
		clear.hidden = !q && !filters.length;
		if (chooser) {
			for (const box of chooser.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')) box.checked = state.shown.includes(box.value);
			chooser.querySelector('summary')!.textContent = `Columns (${state.shown.length})`;
		}
		drawAddMenu();
		// The address keeps the list as it is shown.
		const next = new URLSearchParams();
		if (q) next.set('q', q);
		for (const { column, value } of filters) next.set(column.key, value);
		for (const box of addedBox.querySelectorAll<HTMLElement>('[data-box]'))
			if (!next.has(box.dataset.box!)) next.set(box.dataset.box!, '');
		if (state.shown.join(',') !== file.defaults.join(',')) next.set('cols', state.shown.join(','));
		const sort = state.sort!;
		if (sort.key !== 'id' || sort.desc) next.set('sort', `${sort.desc ? '-' : ''}${sort.key}`);
		const url = new URL(location.href);
		url.search = next.toString();
		history.replaceState(history.state, '', url);
	};

	form.addEventListener('input', (event) => {
		const target = event.target as HTMLElement;
		if (target === addSelect) return;
		if (target instanceof HTMLInputElement && target.type === 'checkbox') {
			state.shown = target.checked ? [...state.shown, target.value] : state.shown.filter((key) => key !== target.value);
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
			state.shown = button.dataset.cols === 'default' ? [...file.defaults] : [];
			update({ head: true });
		} else if (button === clear) {
			nameInput.value = '';
			addedBox.replaceChildren();
			update();
		}
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
		if (view.sortsByName()) update();
	}).observe(document.documentElement, { attributes: true, attributeFilter: ['data-ome-lang'] });

	tools.hidden = false;
	relabel();
	update({ head: true });
}
