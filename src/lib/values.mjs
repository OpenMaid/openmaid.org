// How an entity's published values read on its page (site design §8.2): each field becomes a row of the infobox, as
// plain values, links to other entities, or a list of an array's elements by name.
import { label } from './labels.mjs';

/**
 * The infobox of an entity: a row for each published field, in the export's order, and the labels of the fields whose
 * value is 0 or none, which the page lists apart so the rows show what the entity has. A row's `items` are what it
 * shows: `{ text }`, `{ entity }` (a link) or `{ missing }` (an id no entity has), each with an optional element
 * `label`. An array whose elements are mostly 0 shows the others only.
 */
export function infobox(kind, entity) {
	const rows = [];
	const zero = [];
	for (const field of kind.fields) {
		if (!field.published) continue;
		const value = entity.values[field.name];
		const elements = field.isArray ? (value ?? []) : [value];
		// 0 is none, and for a reference so is a negative value (the games write -1 for none too).
		const none = (v) => v === 0 || (field.refKind && v < 0);
		if (elements.every(none)) {
			zero.push(label(field.name));
			continue;
		}
		const targets = new Map(entity.refs.filter((r) => r.field === field.name).map((r) => [r.idx, r]));
		const item = (v, idx) => {
			if (v === null || v === undefined) return { text: '—' };
			const ref = targets.get(idx);
			if (field.refKind) return ref?.target ? { entity: ref.target } : { missing: `${field.refKind} ${v}` };
			return { text: String(v) };
		};
		if (!field.isArray) {
			rows.push({ field, label: label(field.name), items: [item(value, 0)] });
			continue;
		}
		const items = elements.map((v, idx) => ({
			...item(v, idx),
			label: field.columns?.[idx] ? label(field.columns[idx]) : field.columns ? `#${idx}` : null,
			zero: none(v),
		}));
		const zeros = items.filter((i) => i.zero).length;
		const sparse = field.refKind || zeros * 2 > items.length;
		const shown = sparse ? items.filter((i) => !i.zero) : items;
		if (sparse && zeros && !field.refKind) shown.push({ text: `others 0`, label: null });
		rows.push({ field, label: label(field.name), list: true, items: shown });
	}
	return { rows, zero };
}

/**
 * The tables the game's loaders built for the entity (OME's export plan §4.2), each with its rows: a stage's enemies,
 * one row a record. A reference column comes first, since it names what the row is (an enemy's unit); a column
 * that is 0 or none in every row is left out and named in `zero`. A cell's `items` are as an
 * infobox row's; an array shows its elements that are not 0 when most are, and an empty array cell shows nothing.
 */
export function loadedTables(kind, entity) {
	return kind.loaded
		.map((table) => {
			const rows = entity.loaded[table.name] ?? [];
			const published = table.fields.filter((field) => field.published);
			const refs = new Map(
				entity.refs.filter((r) => r.field.startsWith(`${table.name}.`)).map((r) => [`${r.field}:${r.idx}`, r]),
			);
			const none = (field, v) => v === 0 || (field.refKind && v < 0);
			const elements = (field, row) => (field.isArray ? (row.values[field.name] ?? []) : [row.values[field.name]]);
			const columns = published
				.filter((field) => rows.some((row) => elements(field, row).some((v) => !none(field, v))))
				.sort((a, b) => Boolean(b.refKind) - Boolean(a.refKind));
			const cell = (field, row) => {
				const values = elements(field, row);
				const item = (v, idx) => {
					if (v === null || v === undefined) return { text: '—' };
					if (!field.refKind) return { text: String(v) };
					const ref = refs.get(`${table.name}.${field.name}:${row.record * values.length + idx}`);
					return ref?.target ? { entity: ref.target } : { missing: `${field.refKind} ${v}` };
				};
				const items = values.map((v, idx) => ({ ...item(v, idx), zero: none(field, v) }));
				const zeros = items.filter((i) => i.zero).length;
				return zeros === items.length ? [] : field.refKind || zeros * 2 > items.length ? items.filter((i) => !i.zero) : items;
			};
			return {
				table,
				id: table.label.many.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
				label: table.label.many,
				columns: columns.map((field) => ({ field, label: label(field.name) })),
				rows: rows.map((row) => ({ record: row.record, cells: columns.map((field) => cell(field, row)) })),
				zero: published.filter((field) => !columns.includes(field)).map((field) => label(field.name)),
			};
		})
		.filter((table) => table.rows.length > 0);
}

/**
 * The entity's text by field, apart from its title: each a list of lines (site design §8.2), with its lines in each
 * language that translates it (§8.6).
 */
export function texts(kind, entity) {
	const lines = (values) => values.filter((v) => v !== undefined).join('\n').split('\n');
	return kind.fields
		.filter((field) => field.text && field.name !== kind.titleField && entity.text[field.name])
		.map((field) => ({
			field,
			label: label(field.name),
			lines: lines(entity.text[field.name]),
			translations: Object.fromEntries(
				Object.entries(entity.translations)
					.filter(([, text]) => text[field.name])
					.map(([tag, text]) => [tag, lines(text[field.name])]),
			),
		}));
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
