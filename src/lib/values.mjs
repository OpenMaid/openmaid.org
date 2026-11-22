// How an entity's published values read on its page (site design §8.2): each field becomes a row of the infobox, as
// plain values, links to other entities, or a list of an array's elements by name.
import { SOURCE_LANGUAGE } from './export.mjs';
import { label } from './labels.mjs';

// 0 is none, and for a reference so is a negative value (the games write -1 for none too).
const isNone = (field, v) => v === 0 || (field.refKind && v < 0);

/** One element of a field as a page shows it: `{ text }`, `{ entity }` (a link) or `{ missing }` (an id no entity has). */
function valueItem(entity, field, v, idx) {
	if (v === null || v === undefined) return { text: '—' };
	if (!field.refKind) return { text: String(v) };
	const ref = entity.refs.find((r) => r.field === field.name && r.idx === idx);
	return ref?.target ? { entity: ref.target } : { missing: `${field.refKind} ${v}` };
}

/**
 * A text of the entity as a value (`{ title, names }`, which `Name` draws in each language it has): the text field
 * `field`'s element `idx` (a loaded table's is `table.field`, its element the record times the width). Null when the
 * game's text has none there.
 */
function textItem(entity, field, idx) {
	const own = entity.text[field]?.[idx]?.trim();
	if (!own) return null;
	const names = { [SOURCE_LANGUAGE]: own };
	for (const [tag, text] of Object.entries(entity.translations)) {
		const line = text[field]?.[idx]?.trim();
		if (line) names[tag] = line;
	}
	return { title: own, names };
}

// A name that says no more than a number: `drop_1`, `skill_2`.
const GENERIC = /_\d+$/;
const words = (name) => name.split('_');

/** The words all the lists begin with. */
function lead(lists) {
	let n = 0;
	while (lists.length && lists.every((list) => n < list.length && list[n] === lists[0][n])) n++;
	return lists.length ? lists[0].slice(0, n) : [];
}

/** Labels with the words they all begin with left out, but never every word of the shortest ("Item", "Quantities"). */
function distinct(labels) {
	const split = labels.map((l) => l.split(' '));
	const shortest = Math.min(...split.map((w) => w.length));
	let common = 0;
	while (common < shortest - 1 && split.every((w) => w[common].toLowerCase() === split[0][common].toLowerCase())) common++;
	return split.map((w) => {
		const rest = w.slice(common).join(' ');
		return rest[0].toUpperCase() + rest.slice(1);
	});
}

/** Whether an array field's elements have names that say more than a number, so a table can name its rows. */
function named(field) {
	return Boolean(field.columns) && !field.columns.every((name) => !name || GENERIC.test(name));
}

/**
 * Rows of cells as a table (src/components/DataTable.astro): a group's fields (OME's export plan §5) or one array
 * field. The narrowest field's width is the number of rows; a field as wide gives a column, and a field some times as
 * wide gives that many, its elements row by row (a condition's nine stat changes at each level), named by its elements'
 * names less the words they share. A group's columns are its fields' labels less their words in common ("Item",
 * "Quantities"); one field's table has no header. The rows are named by what their elements' names share ("Level 1")
 * when a field gives several columns, else by the first field's element names when they say more than a number (a
 * unit's stats). A row whose cells are all 0 or none is left out, and so is a column that is in every row left. A table
 * with named rows whose fields give more columns than rows turns, a row for each column, so it fits the infobox (a
 * condition's five levels across, its stat changes down). A group with labels (OME's export plan §5) names row r by its
 * labelling text's record r (a stage's objective rewards by each objective's condition). Null when no row is left.
 */
function cellTable(entity, fields, labels = null) {
	const count = Math.min(...fields.map((field) => field.width));
	const per = fields.map((field) => field.width / count);
	const grid = per.some((k) => k > 1);
	const fieldLabels = fields.length > 1 ? distinct(fields.map((field) => label(field.name))) : fields.map(() => null);
	const columns = fields.flatMap((field, f) => {
		const k = per[f];
		if (k === 1) return [{ field, k, offset: 0, label: fieldLabels[f] }];
		const names = field.columns?.slice(0, k) ?? [];
		const shared = names.length === k && names.every(Boolean) ? lead(names.map(words)).length : 0;
		return Array.from({ length: k }, (_, c) => ({
			field,
			k,
			offset: c,
			label:
				names[c] && words(names[c]).length > shared ? label(words(names[c]).slice(shared).join('_')) : `${label(field.name)} ${c + 1}`,
		}));
	});
	let rowLabel = () => null;
	if (labels) {
		rowLabel = (r) => textItem(entity, labels, r) ?? `#${r}`;
	} else if (grid) {
		rowLabel = (r) => {
			const names = columns.map((col) => col.field.columns?.[r * col.k + col.offset]);
			const shared = names.every(Boolean) ? lead(names.map(words)) : [];
			return shared.length ? label(shared.join('_')) : `#${r}`;
		};
	} else if (named(fields[0])) {
		rowLabel = (r) => (fields[0].columns[r] ? label(fields[0].columns[r]) : `#${r}`);
	}
	const at = (col, r) => r * col.k + col.offset;
	const value = (col, r) => entity.values[col.field.name]?.[at(col, r)];
	const none = (col, r) => value(col, r) == null || isNone(col.field, value(col, r));
	const all = Array.from({ length: count }, (_, r) => r);
	const rows = all.filter((r) => columns.some((col) => !none(col, r)));
	const kept = columns.filter((col) => rows.some((r) => !none(col, r)));
	if (!rows.length || !kept.length) return null;
	const table = {
		columns: kept.map((col) => ({ label: col.label })),
		rows: rows.map((r) => ({
			label: rowLabel(r),
			// A reference that is none, beside values that are not, shows as a dash rather than as an entry no entity has.
			cells: kept.map((col) => [
				col.field.refKind && none(col, r) ? { text: '—' } : valueItem(entity, col.field, value(col, r), at(col, r)),
			]),
		})),
	};
	// The group's shape decides, not the cells one entity leaves, so every entity of a kind reads the same way round.
	if (rowLabel(0) === null || columns.length <= count) return table;
	return {
		columns: table.rows.map((row) => ({ label: row.label })),
		rows: table.columns.map((column, c) => ({ label: column.label, cells: table.rows.map((row) => row.cells[c]) })),
	};
}

/**
 * The infobox of an entity: a row for each published field that is not 0 or none, in the export's order. A value is
 * `items`, each `{ text }`, `{ entity }` (a link) or `{ missing }` (an id no entity has); an array whose elements have
 * names is a `table` (`cellTable`, its elements that are not 0), and one whose elements have none is a list of them
 * (its elements that are not 0, when most are). A group's fields share one row, at the first of them, which holds its
 * table.
 */
export function infobox(kind, entity) {
	const rows = [];
	const groupOf = new Map(kind.groups.flatMap((group) => group.fields.map((field) => [field.name, group])));
	const placed = new Set();
	for (const field of kind.fields) {
		if (!field.published) continue;
		const group = groupOf.get(field.name);
		if (group) {
			if (placed.has(group)) continue;
			placed.add(group);
			const table = cellTable(entity, group.fields, group.labels);
			if (table) rows.push({ field, label: group.label, note: kind.notes.get(group.name) ?? null, table });
			continue;
		}
		const note = kind.notes.get(field.name) ?? null;
		const value = entity.values[field.name];
		const elements = field.isArray ? (value ?? []) : [value];
		const none = (v) => isNone(field, v);
		if (elements.every(none)) continue;
		const item = (v, idx) => valueItem(entity, field, v, idx);
		if (!field.isArray) {
			rows.push({ field, label: label(field.name), note, items: [item(value, 0)] });
			continue;
		}
		if (named(field)) {
			const table = cellTable(entity, [field]);
			if (table) rows.push({ field, label: label(field.name), note, table });
			continue;
		}
		const sparse = field.refKind || elements.filter(none).length * 2 > elements.length;
		const items = elements.map((v, idx) => ({ v, idx })).filter(({ v }) => !sparse || !none(v));
		rows.push({ field, label: label(field.name), note, items: items.map(({ v, idx }) => item(v, idx)) });
	}
	return rows;
}

/**
 * The tables the game's loaders built for the entity (OME's export plan §4.2), each with its rows: a stage's enemies, a
 * unit's title changes, one row a record. Its text columns come first (a title's name), then its references, since they
 * name what the row is (an enemy's unit); a column that is 0 or none in every row is left out. A cell's `items` are as
 * an infobox row's; an array whose elements have names shows each that is not 0 by its name ("Max HP +5"), one whose
 * elements have none its elements that are not 0 when most are, and an empty array cell shows nothing. Such a named
 * array's items, and a list of references, stack one to a line. A table whose text labels a group's rows is shown in
 * that group, not here. A column's note is the export's for table.field.
 */
export function loadedTables(kind, entity) {
	const labelling = new Set(kind.groups.map((group) => group.labels?.split('.')[0]).filter(Boolean));
	return kind.loaded
		.filter((table) => !labelling.has(table.name))
		.map((table) => {
			const rows = entity.loaded[table.name] ?? [];
			const published = table.fields.filter((field) => field.published);
			const refs = new Map(
				entity.refs.filter((r) => r.field.startsWith(`${table.name}.`)).map((r) => [`${r.field}:${r.idx}`, r]),
			);
			const elements = (field, row) => (field.isArray ? (row.values[field.name] ?? []) : [row.values[field.name]]);
			const text = (field, row) => textItem(entity, `${table.name}.${field.name}`, row.record * (field.width || 1));
			const textColumns = table.fields.filter((field) => field.text && rows.some((row) => text(field, row)));
			const columns = published
				.filter((field) => rows.some((row) => elements(field, row).some((v) => !isNone(field, v))))
				.sort((a, b) => Boolean(b.refKind) - Boolean(a.refKind));
			// A change shows its sign: "Max HP +5", "Fire -1".
			const signed = (field) => /(^|_)deltas?$/.test(field.name);
			const cell = (field, row) => {
				const values = elements(field, row);
				if (named(field))
					return values
						.map((v, idx) => ({ v, idx }))
						.filter(({ v }) => v != null && !isNone(field, v))
						.map(({ v, idx }) => ({
							text: `${field.columns[idx] ? label(field.columns[idx]) : `#${idx}`} ${signed(field) && v > 0 ? '+' : ''}${v}`,
						}));
				const item = (v, idx) => {
					if (v === null || v === undefined) return { text: '—' };
					if (!field.refKind) return { text: String(v) };
					const ref = refs.get(`${table.name}.${field.name}:${row.record * values.length + idx}`);
					return ref?.target ? { entity: ref.target } : { missing: `${field.refKind} ${v}` };
				};
				const items = values.map((v, idx) => ({ ...item(v, idx), zero: isNone(field, v) }));
				const zeros = items.filter((i) => i.zero).length;
				return zeros === items.length ? [] : field.refKind || zeros * 2 > items.length ? items.filter((i) => !i.zero) : items;
			};
			const note = (field) => kind.notes.get(`${table.name}.${field.name}`) ?? null;
			return {
				table,
				id: table.label.many.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
				label: table.label.many,
				columns: [
					...textColumns.map((field) => ({ label: label(field.name), note: note(field) })),
					...columns.map((field) => ({
						label: label(field.name),
						note: note(field),
						stack: field.isArray && (named(field) || Boolean(field.refKind)),
					})),
				],
				rows: rows.map((row) => ({
					label: row.record,
					cells: [
						...textColumns.map((field) => (text(field, row) ? [text(field, row)] : [])),
						...columns.map((field) => cell(field, row)),
					],
				})),
			};
		})
		.filter((table) => table.rows.length > 0);
}

/**
 * The entity's text, apart from its title, as the rows of a table (site design §8.2): a row for each text field, or
 * for each of its blocks when the export divides its lines into the blocks the game draws them in (OME's export plan
 * §5: a quest's overview, clear condition and failure condition). A row holds its lines in the game's language and in
 * each that translates it (§8.6); a field or block with no line of text has no row. A field's note is on its first row.
 */
export function texts(kind, entity) {
	const lines = (values) => values.filter((v) => v !== undefined && v !== null).join('\n').split('\n');
	const shown = (list) => list && list.some((line) => line.trim());
	const rows = [];
	for (const field of kind.fields) {
		if (!field.text || field.name === kind.titleField || !entity.text[field.name]) continue;
		const blocks = kind.textBlocks.get(field.name) ?? [{ name: field.name, first: 0, last: Infinity }];
		blocks.forEach((block, b) => {
			const part = (values) => (values ? lines(values.slice(block.first, block.last + 1)) : null);
			const own = part(entity.text[field.name]);
			if (!shown(own)) return;
			const translations = Object.entries(entity.translations)
				.map(([tag, text]) => [tag, part(text[field.name])])
				.filter(([, list]) => shown(list));
			rows.push({
				field,
				label: label(block.name),
				note: b === 0 ? (kind.notes.get(field.name) ?? null) : null,
				languages: [[SOURCE_LANGUAGE, own], ...translations],
				translated: translations.length > 0,
			});
		});
	}
	return rows;
}

/** Whether a page shows any of the entities' translated text: a name or a text in another language. */
export function translated(entities) {
	return entities.some(
		(entity) => Object.keys(entity.names).length > 1 || Object.values(entity.translations).some((t) => Object.keys(t).length),
	);
}

/** Who refers to the entity, grouped by the referring kind and field: "Units: drop item". */
export function referencedBy(data, entity) {
	const groups = new Map();
	for (const { from, field } of entity.referencedBy) {
		const key = `${from.kind}.${field}`;
		if (!groups.has(key)) {
			const kind = data.kinds.find((k) => k.id === from.kind);
			groups.set(key, { key, label: `${kind.label.many}: ${label(field).toLowerCase()}`, entities: new Map() });
		}
		groups.get(key).entities.set(from.id, from);
	}
	return [...groups.values()].map((g) => ({ ...g, entities: [...g.entities.values()] }));
}

/**
 * Where the game's scripts name the entity (OME's export spec §6.7): its relations by name, each script once, with the
 * counts its calls set, as numbers given or taken (a taking relation's count is negative in the export).
 */
export function scriptRelations(entity) {
	const groups = new Map();
	for (const { relation, script, offset, count } of entity.relations) {
		if (!groups.has(relation)) groups.set(relation, { relation, label: label(relation), scripts: new Map() });
		const scripts = groups.get(relation).scripts;
		if (!scripts.has(script)) scripts.set(script, { script, calls: [] });
		scripts.get(script).calls.push({ offset, count: count === null ? null : Math.abs(count) });
	}
	return [...groups.values()].map((g) => ({ ...g, scripts: [...g.scripts.values()] }));
}
