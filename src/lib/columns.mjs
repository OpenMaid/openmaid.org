// A kind's list columns (site plan §9.1): the columns a table of its entries can show, those it shows first, each
// entry's cell in each, and the file a list page's script draws its table from (src/pages/[game]/[kind]/list.json.ts).
// A kind's list and its entries' "Related" tables on other pages take their columns from here.
import { emptyValue, isNone, linkTo, nameOf, pictureTuple, valueItems } from './format.mjs';
import { columnLabel, labelled, named } from './values.mjs';

/** An array as wide as this, or narrower, gives a column for each element; a wider one gives one column of them all. */
const ELEMENT_COLUMNS = 16;

const typeOf = (field) => (field.refKind ? 'entity' : field.format?.bits ? 'mask' : field.names ? 'name' : 'number');
/** The column types whose cells hold one value of a field, which the list file gives as the number. */
const VALUE_TYPES = new Set(['number', 'name', 'mask']);

const columnsOf = new WeakMap();

/**
 * The columns a table of a kind's entries can show, in the order of the kind's fields (a list offers them so, by
 * group). A column is `{ key, field, index, label, group, type, note, quick, default, filter, options }`:
 * - a field of one cell is a column (`index` null) of a `number`, a `name` (a value the game or OME names), a `mask`
 *   (the names of the bits it sets) or an `entity` (a reference);
 * - an array whose elements have names gives a column for each element (`index`), its `group` the field's label: a
 *   unit's stats, an item's price, a resistance by element (its label the game's name for the element, `{ title,
 *   names }`, in each language);
 * - an array of references is one column of `entities` (a unit's skills, a recipe's ingredients), under its group's
 *   label where it is in one; an array whose elements are named by entities, or wider than ELEMENT_COLUMNS, one `list`
 *   column of its elements that are not none, each with its name ("Poison +1").
 *
 * Left out: text (the title is the table's name column, and the rest is long); the field whose value is the title (a
 * recipe's item); an array whose elements have no names (a drop's chance, which an entity's page shows beside its
 * item); the fields of a group whose rows hold several elements of a field (a condition's levels); and a column that
 * is empty for every entry, or the same in every entry (a unit's resistance to an element every unit has alike; site
 * plan §13, P9), unless the site's config shows it. `key` names a column in a page's address: the field's name, and for an element OME's word
 * for it, else its index (`stats.max_hp`). `quick` marks the fields OME's declarations filter on, which a list filters
 * by a select of their values even where they are numbers (a quest's stars); `default` the columns a table shows
 * first: the site's config's (`columns`, by key), else the quick ones.
 */
export function listColumns(kind) {
	if (columnsOf.has(kind)) return columnsOf.get(kind);
	const groupOf = new Map(kind.groups.flatMap((group) => group.fields.map((field) => [field.name, group])));
	const grid = (group) => Boolean(group) && new Set(group.fields.map((field) => field.width)).size > 1;
	const all = [];
	for (const field of kind.fields) {
		if (!field.published || field.text || kind.titleFields.includes(field.name)) continue;
		const group = groupOf.get(field.name);
		const note = kind.notes.get(field.name) ?? null;
		const whole = { field, index: null, label: field.label, note, quick: field.filter && !field.isArray };
		if (!field.isArray) all.push({ ...whole, key: field.name, group: null, type: typeOf(field) });
		else if (grid(group)) continue;
		else if (field.refKind) all.push({ ...whole, key: field.name, group: group?.label ?? null, type: 'entities' });
		else if (!named(field)) continue;
		else if (field.columnEntities?.size || field.width > ELEMENT_COLUMNS)
			all.push({ ...whole, key: field.name, group: null, type: 'list' });
		else
			for (let i = 0; i < field.width; i++)
				all.push({
					...whole,
					key: `${field.name}.${field.columns?.[i] ?? i}`,
					index: i,
					label: columnLabel(field, i) ?? `#${i}`,
					group: field.label,
					type: field.names ? 'name' : 'number',
					note: null,
				});
	}
	const configured = new Set(kind.defaultColumns ?? []);
	const cellKey = (items) => JSON.stringify(items.map((item) => item.text ?? item.title ?? item.entity?.url ?? item.missing ?? ''));
	const columns = all.filter((column) => {
		const cells = kind.entities.map((entity) => cellItems(column, entity));
		if (!cells.some((items) => items.length)) return false;
		if (configured.has(column.key) || cells.length < 2) return true;
		const first = cellKey(cells[0]);
		return cells.some((items) => cellKey(items) !== first);
	});
	const keys = new Set(columns.map((column) => column.key));
	if (keys.size !== columns.length) throw new Error(`${kind.id}: two list columns share a key`);
	const chosen = kind.defaultColumns ?? columns.filter((column) => column.quick).map((column) => column.key);
	for (const key of chosen)
		if (!keys.has(key))
			throw new Error(`site.config.mjs: ${kind.id} has no list column ${key} (its columns: ${[...keys].join(', ')})`);
	for (const column of columns) {
		column.default = chosen.includes(column.key);
		column.filter = filterOf(column);
		column.options = column.filter === 'select' ? options(kind, column) : null;
	}
	columnsOf.set(kind, columns);
	defaultsOf.set(kind, chosen);
	return columns;
}
const defaultsOf = new WeakMap();

/** The keys of the columns a table of a kind's entries shows first, in the order it shows them. */
export function defaultKeys(kind) {
	listColumns(kind);
	return defaultsOf.get(kind);
}

/** The columns a table of a kind's entries shows first, in order. */
export const defaultColumns = (kind) => defaultKeys(kind).map((key) => listColumns(kind).find((column) => column.key === key));

/**
 * How a list filters on a column: by a `select` of the values its entries have (a name, a mask's bit, a reference to
 * one entry, and a number OME's declarations filter on: a quest's stars), by a `range` of numbers as they read (from,
 * to), or by `text` its cells contain, in any language (a unit's skills).
 */
const filterOf = (column) =>
	['name', 'mask', 'entity'].includes(column.type) || (column.quick && column.type === 'number')
		? 'select'
		: column.type === 'number'
			? 'range'
			: 'text';

/**
 * The choices of a column's `select` filter: each value its entries have, with how many have it and its name as the
 * column shows it (`{ t, n }`, the game's in each language, or `{ x }`), in the value's order; a mask's are its bits,
 * and a reference's the entries it names (`v` their id), in the game's order of them (a labyrinth's ids follow the
 * world map), since a select cannot follow the language shown.
 */
function options(kind, column) {
	const { field, type } = column;
	const counts = new Map();
	const count = (v, shown) => {
		if (!counts.has(v)) counts.set(v, { v, c: 0, ...shown });
		counts.get(v).c++;
	};
	const named = (item) => (item.names ? { t: item.title, n: item.names } : { x: item.text ?? item.title });
	for (const entity of kind.entities) {
		const v = rawValue(column, entity);
		// Each record a reference names counts (a row reference names several: OME's export plan §5), a 0 the export
		// linked among them (format.mjs `noneIn`: a Kamidori weapon's Omni).
		if (type === 'entity') {
			for (const ref of entity.refs.filter((r) => r.field === field.name))
				if (ref.target) count(ref.target.id, { t: ref.target.title, n: ref.target.names });
			continue;
		}
		if (emptyValue(field, type, v)) continue;
		if (type === 'mask') {
			for (let k = 0; k < 31; k++) if (v & (1 << k)) count(k, named(nameOf(field, k) ?? { text: String(k) }));
		} else count(v, named(valueItems(field, v)[0]));
	}
	return [...counts.values()].sort((a, b) => a.v - b.v);
}

/** The value of an entry a column of one value shows. */
const rawValue = (column, entity) => {
	const v = entity.values[column.field.name];
	return column.index === null ? v : v?.[column.index];
};

/**
 * An entry's cell in a column, as the items `Value` draws (lib/values.mjs): none for an empty cell (format.mjs
 * `emptyValue`), a link for a reference, each reference of an array, each named element of a `list` column, else
 * the value's name or number.
 */
export function cellItems(column, entity) {
	const { field, type } = column;
	const missing = (id) => ({ missing: `${field.refKind} ${id}` });
	if (type === 'entities')
		return entity.refs.filter((ref) => ref.field === field.name).map((ref) => (ref.target ? linkTo(ref.target) : missing(ref.id)));
	if (type === 'list')
		// A 0 that is a value (OME's `zero`) is none still in a column with no name, as an entry's page has it.
		return (entity.values[field.name] ?? []).flatMap((v, i) =>
			v === null || v === undefined || isNone(field, v) || (v === 0 && columnLabel(field, i) === null)
				? []
				: [labelled(columnLabel(field, i) ?? `#${i}`, valueItems(field, v))],
		);
	const v = rawValue(column, entity);
	if (type === 'entity') {
		// A row reference names every record of a row (OME's export plan §5): the cards that may carry an item. A value
		// that is none is empty, unless the export linked it (format.mjs `noneIn`: a Kamidori weapon's Omni).
		const refs = entity.refs.filter((r) => r.field === field.name);
		if (v === null || v === undefined || (isNone(field, v) && !refs.length)) return [];
		// A value that names no record shows as the game names it, where it does (values.mjs refItems).
		return refs.length
			? refs.map((ref) => (ref.target ? linkTo(ref.target) : missing(ref.id)))
			: [nameOf(field, v) ?? missing(v)];
	}
	if (emptyValue(field, type, v)) return [];
	return valueItems(field, v);
}

/**
 * The file a kind's list page draws its table from (site plan §9.1): every column, with what the browser needs to
 * draw a value as `valueItems` does (the field's name, its format and its values' names), and every entry: its id,
 * address, name (`t`, and `n` in each language), thumbnail (`p`: file, width, height) and a cell for each column (`v`):
 * the value for a column of one value (`number`, `name`, `mask`), else its items, each a link, a name (`t`, `n`), a
 * text (`x`) or an id no entry has (`m`). A link is the index of the entry it names in `links` (its id `i`, `u`, `t`,
 * `n`, and its icon `p` where its kind's links show one), which holds each entry the cells name once: a skill many units
 * have is written once. A column says how a list
 * filters on it (`filter`, `filterOf`) and the choices of its select (`options`).
 */
export function listData(data, kind) {
	const columns = listColumns(kind);
	const links = [];
	const linked = new Map();
	const link = (entity) => {
		if (!linked.has(entity))
			linked.set(
				entity,
				links.push({
					i: entity.id,
					u: entity.url,
					t: entity.title,
					n: entity.names,
					...(entity.icon ? { p: pictureTuple(entity.icon) } : {}),
				}) - 1,
			);
		return linked.get(entity);
	};
	const item = (i) =>
		i.entity
			? link(i.entity)
			: i.missing
				? { m: i.missing }
				: i.names
					? { t: i.title, n: i.names }
					: { x: i.text };
	return {
		kind: kind.id,
		pictures: `/pictures/${data.game}/${data.revision}/`,
		// The columns a table shows first, in order; a column chosen besides them follows them, in the columns' order.
		defaults: defaultKeys(kind),
		columns: columns.map((c) => ({
			key: c.key,
			label: c.label,
			group: c.group,
			type: c.type,
			note: c.note,
			quick: c.quick,
			filter: c.filter,
			options: c.options,
			field: {
				name: c.field.name,
				refKind: c.field.refKind ?? null,
				format: c.field.format,
				names: VALUE_TYPES.has(c.type) && c.field.names ? Object.fromEntries(c.field.names) : null,
			},
		})),
		rows: kind.entities.map((e) => ({
			id: e.id,
			u: e.url,
			t: e.title,
			n: e.names,
			p: e.thumbnail ? pictureTuple(e.thumbnail) : null,
			v: columns.map((c) => (VALUE_TYPES.has(c.type) ? (rawValue(c, e) ?? null) : cellItems(c, e).map(item))),
		})),
		links,
	};
}
