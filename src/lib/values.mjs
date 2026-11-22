// How an entity's published values read on its page (site design §8.2): each field becomes a row of the infobox, as
// plain values, links to other entities, or a list of an array's elements by name.
import { label } from './labels.mjs';
import { SOURCE_LANGUAGE } from './language.mjs';
import { flow, textShape } from './text-flow.mjs';
import { cellItems, defaultColumns } from './columns.mjs';
import { formatNumber, isChange, isNone, valueItems, valueText } from './format.mjs';

export { formatNumber, isChange, valueItems, valueText };

/**
 * One element of a field as a page shows it: `{ text }`, `{ title, names }` (a value the game names), `{ entity }` (a
 * link) or `{ missing }` (an id no entity has); a mask's element is several of them.
 */
function valueItem(entity, field, v, idx) {
	if (v === null || v === undefined) return [{ text: '—' }];
	if (!field.refKind) return valueItems(field, v);
	const ref = entity.refs.find((r) => r.field === field.name && r.idx === idx);
	return [ref?.target ? { entity: ref.target } : { missing: `${field.refKind} ${v}` }];
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
export function named(field) {
	if (field.columnEntities?.size || field.columnNames?.size) return true;
	return Boolean(field.columns) && !field.columns.every((name) => !name || GENERIC.test(name));
}

/**
 * The name of a row of cells' column `c`, as a table's row label: the entity it stands for (`{ entity }`, a link: an
 * item's condition levels name conditions), else the game's name for it in each language it has (`{ title, names }`:
 * an element), else OME's word as a label, else null.
 */
export function columnLabel(field, c) {
	const entity = field.columnEntities?.get(c);
	if (entity) return { entity };
	const names = field.columnNames?.get(c);
	if (names) return { title: names[SOURCE_LANGUAGE] ?? Object.values(names)[0], names };
	return field.columns?.[c] ? label(field.columns[c]) : null;
}

/**
 * A column's name followed by a value, as one item ("Fire +1"), in each language either has: a loaded table's named
 * row of cells shows each element so.
 */
export function labelled(head, items) {
	const tail = (tag) => items.map((item) => (tag && item.names?.[tag]) ?? item.title ?? item.text).join(', ');
	if (typeof head === 'string') return { text: `${head} ${tail(null)}` };
	const source = head.entity ?? head;
	const tags = new Set([...Object.keys(source.names ?? {}), ...items.flatMap((item) => Object.keys(item.names ?? {}))]);
	if (!tags.size) return { text: `${source.title} ${tail(null)}` };
	const names = Object.fromEntries([...tags].map((tag) => [tag, `${source.names?.[tag] ?? source.title} ${tail(tag)}`]));
	return { title: `${source.title} ${tail(SOURCE_LANGUAGE)}`, names };
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
	const fieldLabels = fields.length > 1 ? distinct(fields.map((field) => field.label ?? label(field.name))) : fields.map(() => null);
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
				names[c] && words(names[c]).length > shared ? label(words(names[c]).slice(shared).join('_')) : `${field.label ?? label(field.name)} ${c + 1}`,
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
		rowLabel = (r) => columnLabel(fields[0], r) ?? `#${r}`;
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
			cells: kept.map((col) =>
				col.field.refKind && none(col, r) ? [{ text: '—' }] : valueItem(entity, col.field, value(col, r), at(col, r)),
			),
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
			rows.push({ field, label: field.label, note, items: item(value, 0) });
			continue;
		}
		if (named(field)) {
			const table = cellTable(entity, [field]);
			if (table) rows.push({ field, label: field.label, note, table });
			continue;
		}
		const sparse = field.refKind || elements.filter(none).length * 2 > elements.length;
		const items = elements.map((v, idx) => ({ v, idx })).filter(({ v }) => !sparse || !none(v));
		rows.push({ field, label: field.label, note, items: items.flatMap(({ v, idx }) => item(v, idx)) });
	}
	return rows;
}

/**
 * The tables the game's loaders built for the entity (OME's export plan §4.2), each with its rows: a stage's enemies, a
 * unit's title changes, one row a record. A table with parts (§5) is shown as a table for its rows in no part, and one
 * for each part that has rows, with the part's note: a stage's enemies and its allies. Its text columns come first (a
 * title's name), then its references, since they name what the row is (an enemy's unit); a column that is 0 or none in
 * every row is left out. A cell's `items` are as an infobox row's; an array whose elements have names shows each that
 * is not 0 by its name ("Max HP +5"), one whose elements have none its elements that are not 0 when most are, and an
 * empty array cell shows nothing. Such a named array's items, and a list of references, stack one to a line. A table
 * whose text labels a group's rows is shown in that group, not here. A column's note is the export's for table.field.
 */
export function loadedTables(kind, entity) {
	const labelling = new Set(kind.groups.map((group) => group.labels?.split('.')[0]).filter(Boolean));
	return kind.loaded
		.filter((table) => !labelling.has(table.name))
		.flatMap((table) => {
			const all = entity.loaded[table.name] ?? [];
			return [
				{ part: null, label: table.label.many, note: null, rows: all.filter((row) => !row.part) },
				...(table.parts ?? []).map((part) => ({
					part,
					label: part.label.many,
					note: part.note,
					rows: all.filter((row) => row.part === part.name),
				})),
			].map((shown) => ({ table, ...shown }));
		})
		.map(({ table, part, label: heading, note: about, rows }) => {
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
			const cell = (field, row) => {
				const values = elements(field, row);
				// A change shows its sign (`isChange`): "Max HP +5", "Fire -1".
				if (named(field))
					return values
						.map((v, idx) => ({ v, idx }))
						.filter(({ v }) => v != null && !isNone(field, v))
						.map(({ v, idx }) => labelled(columnLabel(field, idx) ?? `#${idx}`, valueItems(field, v)));
				const item = (v, idx) => {
					if (v === null || v === undefined) return [{ text: '—' }];
					if (!field.refKind) return valueItems(field, v);
					const ref = refs.get(`${table.name}.${field.name}:${row.record * values.length + idx}`);
					return [ref?.target ? { entity: ref.target } : { missing: `${field.refKind} ${v}` }];
				};
				// A mask of 0 in a row shows as none (an enemy slot placed on no difficulty), not as an empty cell.
				const items = values.flatMap((v, idx) => item(v, idx).map((i) => ({ ...i, zero: isNone(field, v) && !field.format?.bits })));
				const zeros = items.filter((i) => i.zero).length;
				return zeros === items.length ? [] : field.refKind || zeros * 2 > items.length ? items.filter((i) => !i.zero) : items;
			};
			const note = (field) => kind.notes.get(`${table.name}.${field.name}`) ?? null;
			return {
				table,
				part,
				note: about,
				id: heading.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
				label: heading,
				columns: [
					...textColumns.map((field) => ({ label: field.label ?? label(field.name), note: note(field) })),
					...columns.map((field) => ({
						label: field.label ?? label(field.name),
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
 * each that translates it (§8.6), with the lines the game wrapped joined into paragraphs (text-flow.mjs); a field or
 * block with no line of text has no row. A field's note is on its first row.
 */
export function texts(kind, entity) {
	const shapes = textShapes(kind);
	return gameTexts(kind, entity).map((row) => ({
		...row,
		languages: row.languages.map(([tag, lines]) => [tag, flow(lines, tag, shapes.get(`${row.key}:${tag}`))]),
	}));
}

const shapesOf = new WeakMap();
/**
 * The shape of each of a kind's texts in each language (text-flow.mjs), by `field:block:language`, measured from every
 * entity's lines of it. The game's own language is measured first: a translation's width is never under it.
 */
function textShapes(kind) {
	if (!shapesOf.has(kind)) {
		const lists = new Map();
		for (const entity of kind.entities)
			for (const row of gameTexts(kind, entity))
				for (const [tag, lines] of row.languages) {
					const key = `${row.key}:${tag}`;
					if (!lists.has(key)) lists.set(key, { tag, base: `${row.key}:${SOURCE_LANGUAGE}`, lines: [] });
					lists.get(key).lines.push(lines);
				}
		const shapes = new Map();
		const source = [...lists].filter(([, list]) => list.tag === SOURCE_LANGUAGE);
		for (const [key, list] of source) shapes.set(key, textShape(list.lines, list.tag));
		for (const [key, list] of lists)
			if (!shapes.has(key)) shapes.set(key, textShape(list.lines, list.tag, shapes.get(list.base)?.width ?? 0));
		shapesOf.set(kind, shapes);
	}
	return shapesOf.get(kind);
}

/** The rows `texts` gives, with each text's lines as the game has them. */
function gameTexts(kind, entity) {
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
				key: `${field.name}:${block.name}`,
				label: kind.textBlocks.has(field.name) ? label(block.name) : field.label,
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

/** A field the kind's page shows, by its name; a loaded table's is `table.field`. */
function fieldNamed(kind, name) {
	const dot = name.indexOf('.');
	if (dot < 0) return { field: kind.fields.find((f) => f.name === name) ?? null, table: null };
	const table = kind.loaded.find((t) => t.name === name.slice(0, dot)) ?? null;
	return { field: table?.fields.find((f) => f.name === name.slice(dot + 1)) ?? null, table };
}

/**
 * A detail of a reference as items (OME's export plan §5): a field of the referring entity, one cell; the element of
 * its group beside the reference (a drop's chance beside the drop); or a field of the loaded table's row the reference
 * is in (an enemy's levels), the row being the reference's cell over its field's width.
 */
function detailItems(kind, by, detail) {
	const { field, table } = fieldNamed(kind, detail);
	const from = by.from;
	if (!field) return [{ text: '—' }];
	let at = field.isArray ? by.idx : 0;
	let v;
	if (table) {
		const refField = fieldNamed(kind, by.field).field;
		const record = Math.floor(by.idx / (refField?.width || 1));
		at = record * (field.width || 1);
		v = from.loaded[table.name]?.find((row) => row.record === record)?.values[field.name];
	} else {
		v = field.isArray ? from.values[detail]?.[at] : from.values[detail];
	}
	if (field.text) {
		const text = textItem(from, detail, at);
		return text ? [text] : [{ text: '—' }];
	}
	if (v === null || v === undefined || (field.refKind && isNone(field, v))) return [{ text: '—' }];
	if (!field.refKind) return valueItems(field, v);
	const ref = from.refs.find((r) => r.field === detail && r.idx === at);
	return [ref?.target ? { entity: ref.target } : { missing: `${field.refKind} ${v}` }];
}

const itemKey = (item) => item.text ?? item.title ?? item.entity?.url ?? item.missing;

/**
 * What refers to the entity (OME's export plan §5): a list for each referring kind and field, under the heading the
 * export gives it ("Dropped by"), else under the kind and field ("Units: drop item"). A reference from a loaded
 * table's row in a part has the part's heading ("Ally on stages"), else the part's name ("Stages: ally unit"). Each is
 * a `table` of the referring entities: each with its picture, then the details the export names beside it (a drop's
 * chance, a stage's labyrinth and floor), then the columns its kind's list shows first (lib/columns.mjs) but those the
 * details show, and a count where one refers so more than once (an enemy in several slots alike); its name leaves out
 * the qualifiers the details and columns show.
 */
export function referencedBy(data, entity) {
	const groups = new Map();
	for (const by of entity.referencedBy) {
		const key = `${by.from.kind}:${by.field}:${by.part ?? ''}`;
		if (!groups.has(key)) {
			const kind = data.kinds.find((k) => k.id === by.from.kind);
			const declared = kind.referencedAs.get(`${by.field}:${by.part ?? ''}`);
			const shown = by.part ? `${by.part}.${by.field.slice(by.field.indexOf('.') + 1)}` : by.field;
			groups.set(key, {
				key,
				kind,
				label: declared?.heading ?? `${kind.label.many}: ${label(shown).toLowerCase()}`,
				// A column reference (a skill's condition level) shows its cell beside each entry (site plan §13, C2).
				details: [...(by.column ? [by.field] : []), ...(declared?.details ?? [])],
				refs: [],
			});
		}
		groups.get(key).refs.push(by);
	}
	const ids = new Set();
	return [...groups.values()].map(({ key, kind, label: heading, details, refs }) => {
		// The columns the kind's list shows first (lib/columns.mjs), but those the reference's details show already.
		const listed = defaultColumns(kind).filter((column) => !details.includes(column.field.name));
		const rows = new Map();
		for (const by of refs) {
			const cells = details.map((detail) => detailItems(kind, by, detail));
			const id = JSON.stringify([by.from.id, cells.map((items) => items.map(itemKey))]);
			if (rows.has(id)) rows.get(id).count++;
			else rows.set(id, { from: by.from, cells, count: 1 });
		}
		const counted = [...rows.values()].some((row) => row.count > 1);
		// A kind whose entities have pictures shows each one's beside its name, an empty box where one has none.
		const pictured = [...rows.values()].some((row) => row.from.thumbnail);
		const omit = [...details, ...listed.map((column) => column.field.name)];
		const base = `related-${heading.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'entries'}`;
		let id = base;
		for (let n = 2; ids.has(id); n++) id = `${base}-${n}`;
		ids.add(id);
		return {
			key,
			id,
			label: heading,
			count: new Set(refs.map((by) => by.from.id)).size,
			table: {
				columns: [
					{ label: kind.label.one },
					...details.map((detail) => {
						const { field } = fieldNamed(kind, detail);
						return { label: field?.label ?? label(detail) };
					}),
					...listed.map((column) => ({
						label: column.label,
						group: column.group,
						note: column.note,
						wrap: column.type === 'entities' || column.type === 'list',
					})),
					...(counted ? [{ label: 'Count' }] : []),
				],
				rows: [...rows.values()].map((row) => ({
					label: null,
					cells: [
						[
							{
								entity: { ...row.from, ...nameWithout(row.from, omit) },
								...(pictured ? { thumb: row.from.thumbnail ?? null } : {}),
							},
						],
						...row.cells,
						...listed.map((column) => cellItems(column, row.from)),
						...(counted ? [[{ text: String(row.count) }]] : []),
					],
				})),
			},
		};
	});
}

/** The items' text in each language that names one of them, and in the game's own. */
function itemsText(items) {
	const tags = new Set([SOURCE_LANGUAGE, ...items.flatMap((item) => Object.keys(item.names ?? {}))]);
	return Object.fromEntries(
		[...tags].map((tag) => [tag, items.map((item) => item.names?.[tag] ?? item.title ?? item.text).join(', ')]),
	);
}

/**
 * A qualifier's text for an entity (OME's export plan §5), in each language it has one: a text's first line; the name
 * of the entity a reference names (a stage's labyrinth); a value's name, even 0's ("Innate attack"); or a number with
 * its label ("Floor 3"). Null where the entity has none: no text, a reference to none, or a 0 with no name.
 */
function qualifierText(kind, entity, name) {
	const field = kind.fields.find((f) => f.name === name);
	if (!field) return null;
	if (field.text) return textItem(entity, name, 0)?.names ?? null;
	const v = entity.values[name];
	if (v === null || v === undefined) return null;
	if (field.refKind) {
		const target = entity.refs.find((ref) => ref.field === name)?.target;
		if (!target) return null;
		return { ...(target.baseNames ?? target.names), [SOURCE_LANGUAGE]: target.baseTitle ?? target.title };
	}
	if (field.format?.bits) return v ? itemsText(valueItems(field, v)) : null;
	if (field.names?.has(v)) return itemsText(valueItems(field, v));
	return v === 0 ? null : { [SOURCE_LANGUAGE]: `${field.label} ${formatNumber(field, v)}` };
}

/** A name with the texts that tell it apart: "名前（武器）" in the game's own language, "Name (Weapon)" in another. */
function withParts(name, parts, tag) {
	if (!parts.length) return name;
	return tag === SOURCE_LANGUAGE ? `${name}（${parts.join('、')}）` : `${name} (${parts.join(', ')})`;
}

/**
 * The entity's names told apart (`qualify`), leaving out the qualifiers `omit` names: a table that shows a stage's
 * labyrinth and floor beside it leaves them out of its name.
 */
export function nameWithout(entity, omit = []) {
	const parts = (tag) =>
		(entity.qualifiers?.[tag] ?? []).filter((part) => !omit.includes(part.field)).map((part) => part.text);
	return {
		title: withParts(entity.baseTitle, parts(SOURCE_LANGUAGE), SOURCE_LANGUAGE),
		names: Object.fromEntries(Object.entries(entity.baseNames).map(([tag, name]) => [tag, withParts(name, parts(tag), tag)])),
	};
}

/**
 * Tells apart the entities of each kind that share a name (OME's export plan §5). Where entities share a name in a
 * language, it takes the kind's qualifiers whose text differs among them, in the kind's order, until each reads apart
 * ("Hammer (Weapon)" and "Hammer (Innate attack)"), and the id where none is left that does ("Bad craftsman A (#75)").
 * A name is told apart only in the languages it is shared in. Sets each entity's `title` and `names` so, keeping what
 * they were as `baseTitle` and `baseNames`, and its `qualifiers`, by language, for `nameWithout`.
 */
export function qualify(kinds) {
	for (const kind of kinds)
		for (const entity of kind.entities) {
			entity.baseTitle = entity.title;
			entity.baseNames = entity.names;
			entity.qualifiers = {};
		}
	for (const kind of kinds) {
		const tags = new Set([SOURCE_LANGUAGE, ...kind.entities.flatMap((entity) => Object.keys(entity.baseNames))]);
		const texts = new Map(kind.entities.map((e) => [e, kind.qualifiers.map((name) => qualifierText(kind, e, name))]));
		for (const tag of tags) {
			const text = (entity, q) => {
				const part = texts.get(entity)[q];
				return part ? (part[tag] ?? part[SOURCE_LANGUAGE] ?? '') : '';
			};
			const shared = new Map();
			for (const entity of kind.entities) {
				const name = entity.baseNames[tag] ?? entity.baseTitle;
				if (!shared.has(name)) shared.set(name, []);
				shared.get(name).push(entity);
			}
			for (const group of shared.values()) {
				if (group.length < 2) continue;
				const chosen = [];
				const key = (entity) => JSON.stringify(chosen.map((q) => text(entity, q)));
				const apart = () => new Set(group.map(key)).size === group.length;
				for (let q = 0; q < kind.qualifiers.length && !apart(); q++)
					if (new Set(group.map((entity) => text(entity, q))).size > 1) chosen.push(q);
				const counts = new Map();
				for (const entity of group) counts.set(key(entity), (counts.get(key(entity)) ?? 0) + 1);
				for (const entity of group) {
					const parts = chosen.filter((q) => text(entity, q)).map((q) => ({ field: kind.qualifiers[q], text: text(entity, q) }));
					if (counts.get(key(entity)) > 1) parts.push({ field: null, text: `#${entity.id}` });
					entity.qualifiers[tag] = parts;
				}
			}
		}
		for (const entity of kind.entities) Object.assign(entity, nameWithout(entity));
	}
}
