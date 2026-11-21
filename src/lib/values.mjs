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
		if (elements.every((v) => v === 0)) {
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
			zero: v === 0,
		}));
		const zeros = items.filter((i) => i.zero).length;
		const sparse = field.refKind || zeros * 2 > items.length;
		const shown = sparse ? items.filter((i) => !i.zero) : items;
		if (sparse && zeros && !field.refKind) shown.push({ text: `others 0`, label: null });
		rows.push({ field, label: label(field.name), list: true, items: shown });
	}
	return { rows, zero };
}

/** The entity's text by field, apart from its title: each a list of lines (site design §8.2). */
export function texts(kind, entity) {
	return kind.fields
		.filter((field) => field.text && field.name !== kind.titleField && entity.text[field.name])
		.map((field) => ({
			field,
			label: label(field.name),
			lines: entity.text[field.name].filter((v) => v !== undefined).join('\n').split('\n'),
		}));
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
