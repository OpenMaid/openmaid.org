// Reading a game's export (OME's export design §7) into the model the database pages render (site design §8). An export
// is the folder OME's `data-export` writes: <revision>.sqlite, pictures/<revision>/ and manifest.json.
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { kindLabel, label } from './labels.mjs';
import { SOURCE_LANGUAGE } from './language.mjs';
import { isNone } from './format.mjs';
import { qualify } from './values.mjs';

/** The export format this site reads (the database's `format_version`). */
export const FORMAT_VERSION = 1;

/**
 * A game's export as the pages use it: its build facts, its kinds with their fields and entities, and its pictures.
 * Fails on what the site cannot show: a missing export, another format version, a picture file the export lacks.
 */
/**
 * The revision of the export in a game's folder, as its manifest.json names it (OME's export spec §6.5): the build
 * reads whichever revision the folder holds, so a new export needs no change to site.config.mjs.
 */
export function exportRevision(game, dir) {
	const file = path.join(dir, 'manifest.json');
	if (!fs.existsSync(file))
		throw new Error(`no export of ${game} at ${dir}: copy OME's export folder there, or leave the game out with OME_SITE_GAMES (README.md)`);
	const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
	if (manifest.game !== game) throw new Error(`${file} is an export of ${manifest.game}, not ${game}`);
	if (!manifest.revision) throw new Error(`${file} names no revision`);
	return manifest.revision;
}

export function readExport({ game, revision, dir, thumbnails = {}, cards = {}, columns = {}, linkIcons = [], darkPictures = {} }) {
	const file = path.join(dir, `${revision}.sqlite`);
	if (!fs.existsSync(file))
		throw new Error(`no export of ${game} revision ${revision} at ${file}: copy OME's export folder there (README.md)`);
	const db = new DatabaseSync(file, { readOnly: true });
	try {
		const info = Object.fromEntries(db.prepare('SELECT key, value FROM build_info').all().map((r) => [r.key, r.value]));
		if (Number(info.format_version) !== FORMAT_VERSION)
			throw new Error(`${file} is export format ${info.format_version}; this site reads ${FORMAT_VERSION}`);
		if (info.game !== game || info.revision !== revision)
			throw new Error(`${file} holds ${info.game} revision ${info.revision}, not ${game} ${revision}`);
		const manifestFile = path.join(dir, 'manifest.json');
		const manifest = fs.existsSync(manifestFile) ? JSON.parse(fs.readFileSync(manifestFile, 'utf8')) : {};
		// The languages the export translates the text into, and the packages each comes from (OME's export spec §6.4),
		// which the pages credit (site design §8.6).
		const languages = (info.languages ?? SOURCE_LANGUAGE).split(',').filter((tag) => tag !== SOURCE_LANGUAGE);
		const packages = info.language_packages ? JSON.parse(info.language_packages) : [];

		const all = (sql, ...args) => db.prepare(sql).all(...args).map((row) => ({ ...row }));
		// An export made before groups, notes or text blocks (OME's export plan §5) has no table of them.
		const has = (table) => Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table));
		const columnsOf = (table) => db.prepare(`PRAGMA table_info("${table}")`).all().map((column) => column.name);
		const hasGroups = has('field_group');
		// A group's row labels: a loaded table's text field, or a word that names row r with its number (an export
		// before OME's row words has no row_label column).
		const groupLabels = has('group_label')
			? all(
					columnsOf('group_label').includes('row_label')
						? 'SELECT kind, name, labels, row_label FROM group_label'
						: 'SELECT kind, name, labels, NULL AS row_label FROM group_label',
				)
			: [];
		// What a field reads as (OME's export plan §5): a reader's label, how its numbers read, and the words and the
		// game's names of its values, by language ('' is OME's word), each keyed kind:field (a loaded table's
		// table.field); and the parts of a loaded table that a page shows apart (a stage's allies).
		const byKindName = (rows, name) => new Map(rows.map((row) => [`${row.kind}:${row[name]}`, row]));
		const fieldLabels = byKindName(has('label') ? all('SELECT kind, name, text FROM label') : [], 'name');
		const formats = byKindName(has('value_format') ? all('SELECT * FROM value_format') : [], 'field');
		const valueNames = new Map();
		for (const row of has('value_name') ? all('SELECT kind, field, value, lang, text FROM value_name') : []) {
			const key = `${row.kind}:${row.field}`;
			if (!valueNames.has(key)) valueNames.set(key, new Map());
			const names = valueNames.get(key);
			if (!names.has(row.value)) names.set(row.value, {});
			names.get(row.value)[row.lang] = row.text;
		}
		// The game's names for a row of cells' columns (OME's `columns_from`): an element's resistances by the game's
		// element names, by language, keyed as the value names are.
		const columnNames = new Map();
		for (const row of has('column_name') ? all('SELECT kind, field, column_index, lang, text FROM column_name') : []) {
			const key = `${row.kind}:${row.field}`;
			if (!columnNames.has(key)) columnNames.set(key, new Map());
			const names = columnNames.get(key);
			if (!names.has(row.column_index)) names.set(row.column_index, {});
			names.get(row.column_index)[row.lang] = row.text;
		}
		const parts = has('loaded_part') ? all('SELECT * FROM loaded_part ORDER BY kind, loaded, position') : [];
		// The fields that tell apart a kind's entities with one name, and how its references read on their targets'
		// pages (OME's export plan §5): a heading and the details beside each referring entity, by field and part.
		const qualifiers = has('qualifier') ? all('SELECT kind, field FROM qualifier ORDER BY kind, position') : [];
		// The words shown beside a link to an entity whose field is not none (OME's export plan §5): a boss's "Boss".
		const marks = has('mark') ? all('SELECT kind, field, word FROM mark ORDER BY kind, position') : [];
		const headings = has('referenced_as') ? all('SELECT kind, field, part, heading, details FROM referenced_as') : [];
		const reads = (kindId, key, field) => {
			const format = formats.get(`${kindId}:${key}`);
			field.label = fieldLabels.get(`${kindId}:${key}`)?.text ?? label(field.name);
			field.format = format
				? {
						scale: format.scale,
						offset: format.offset,
						unit: format.unit,
						bits: Boolean(format.bits),
						none: format.none ?? null,
						// A 0 that is a value (OME's `zero`: an element's affinity of 0, immune); an older export has no column.
						zero: Boolean(format.zero),
					}
				: null;
			field.names = valueNames.get(`${kindId}:${key}`) ?? null;
			field.columnNames = columnNames.get(`${kindId}:${key}`) ?? null;
			return field;
		};
		const notes = has('note') ? all('SELECT kind, name, text FROM note') : [];
		const blocks = has('text_block') ? all('SELECT kind, field, name, first, last FROM text_block ORDER BY kind, field, position') : [];
		const pictures = new Map(); // file name -> picture
		const byKey = new Map(); // "item:12" -> entity
		const kinds = all('SELECT * FROM kind ORDER BY rowid').map((row) => ({
			id: row.id,
			table: row.table_name,
			titleField: row.title_field,
			// The fields that may name an entity, in turn (OME's export plan §5): the title field, then the references
			// it falls back on when it names no record (an Arterial recipe makes an item or a card).
			titleFields: [row.title_field, ...JSON.parse(row.title_fallbacks ?? '[]')].filter(Boolean),
			// OME's word for a record the game names none (OME's export plan §5, `titles`): Verita's element 0, Undefined.
			titles: JSON.parse(row.titles ?? '{}'),
			aliases: JSON.parse(row.aliases),
			label: kindLabel(row.id),
			// What its entities are, in one line (OME's declarations, `about`), which its card and its list show.
			about: row.about ?? null,
			// The columns its tables show first (site.config.mjs `columns`; lib/columns.mjs), else none chosen.
			defaultColumns: columns[row.id] ?? null,
			fields: all('SELECT * FROM field WHERE kind = ? ORDER BY rowid', row.id).map((f) => reads(row.id, f.name, fieldOf(f))),
			// The kind's groups (OME's export plan §5): published rows of cells of one width, shown as one table. A group's
			// labels name a loaded table's text field, table.field, whose record r names row r (a stage's objectives); its
			// row word names row r with its number ("Level 12").
			groups: hasGroups
				? [...groupBy(all('SELECT name, field FROM field_group WHERE kind = ? ORDER BY name, position', row.id), (g) => g.name)]
						.map(([name, members]) => ({
							name,
							label: fieldLabels.get(`${row.id}:${name}`)?.text ?? label(name),
							fieldNames: members.map((m) => m.field),
							labels: groupLabels.find((g) => g.kind === row.id && g.name === name)?.labels ?? null,
							rowLabel: groupLabels.find((g) => g.kind === row.id && g.name === name)?.row_label ?? null,
						}))
				: [],
			// A line that explains a detail (OME's export plan §5), by the field or group it explains; a loaded table's
			// field's is table.field.
			notes: new Map(notes.filter((n) => n.kind === row.id).map((n) => [n.name, n.text])),
			// The blocks a text field's lines are drawn in (OME's export plan §5), by the field: a quest's overview and its
			// clear and failure conditions.
			textBlocks: new Map(
				[...groupBy(blocks.filter((b) => b.kind === row.id), (b) => b.field)].map(([field, list]) => [
					field,
					list.map((b) => ({ name: b.name, first: b.first, last: b.last })),
				]),
			),
			// The scripts whose instructions read, write or index (take as an array's base) a cell of the table or of its
			// loaded tables (OME's export plan §4.3), most used first.
			scriptUse: all(
				'SELECT script, reads, writes, addresses FROM script_use WHERE kind = ? ORDER BY reads + writes + addresses DESC, script',
				row.id,
			),
			qualifiers: qualifiers.filter((q) => q.kind === row.id).map((q) => q.field),
			marks: marks.filter((m) => m.kind === row.id).map((m) => ({ field: m.field, word: m.word })),
			referencedAs: new Map(
				headings
					.filter((h) => h.kind === row.id)
					.map((h) => [`${h.field}:${h.part}`, { heading: h.heading, details: JSON.parse(h.details) }]),
			),
			// The tables the game's loaders build for each entity (OME's export plan §4.2): a stage's enemies.
			loaded: all('SELECT name, table_name, scope, records FROM loaded WHERE kind = ? ORDER BY rowid', row.id).map((t) => ({
				name: t.name,
				table: t.table_name,
				scope: t.scope,
				records: t.records,
				// OME's label for the table, where the kind gives one (a stage's map objects, shown as its dig sites).
				label: kindLabel(t.name, fieldLabels.get(`${row.id}:${t.name}`)?.text ?? null),
				fields: all('SELECT * FROM loaded_field WHERE kind = ? AND loaded = ? ORDER BY rowid', row.id, t.name).map((f) =>
					reads(row.id, `${t.name}.${f.name}`, fieldOf(f)),
				),
				parts: parts
					.filter((p) => p.kind === row.id && p.loaded === t.name)
					.map((p) => ({ name: p.name, label: kindLabel(p.name), note: p.note, field: p.field, global: p.global, sameAs: p.same_as })),
			})),
			entities: [],
		}));

		for (const kind of kinds) {
			for (const group of kind.groups) group.fields = group.fieldNames.map((name) => kind.fields.find((f) => f.name === name));
			const published = kind.fields.filter((field) => field.published);
			const grouped = (sql) => groupBy(all(sql, kind.id), (row) => row.id);
			const texts = grouped('SELECT id, field, idx, lang, value FROM text WHERE kind = ? ORDER BY id, field, idx, lang');
			const refs = grouped('SELECT from_id AS id, field, idx, to_kind, to_id FROM ref WHERE from_kind = ? ORDER BY from_id, field, idx');
			// A picture the game draws with its additive glow is marked (OME's export plan §5); an export before the
			// mark has no such column.
			const pics = grouped(
				`SELECT id, name, file, explicit, ${columnsOf('picture').includes('additive') ? 'additive' : '0 AS additive'}, width, height, hash FROM picture WHERE kind = ? ORDER BY id, name`,
			);
			const cells = grouped('SELECT id, field, idx, bank, address, raw, writer FROM cell WHERE kind = ? ORDER BY id, field, idx');
			const relations = grouped('SELECT id, relation, script, offset, count FROM relation WHERE kind = ? ORDER BY id, relation, script, offset');
			const snippets = new Map(all('SELECT id, text FROM snippet WHERE kind = ?', kind.id).map((r) => [r.id, r.text]));
			const loadedRows = kind.loaded.map((table) => {
				const published = table.fields.filter((field) => field.published);
				const rows = all(`SELECT * FROM "${kind.id}.${table.name}" ORDER BY id, record`).map((row) => ({
					id: row.id,
					record: row.record,
					part: row.part ?? null,
					values: Object.fromEntries(published.map((field) => {
						const raw = row[field.name];
						return [field.name, field.isArray && typeof raw === 'string' ? JSON.parse(raw) : raw];
					})),
				}));
				return [table.name, groupBy(rows, (row) => row.id)];
			});

			for (const row of all(`SELECT * FROM "${kind.id}" ORDER BY id`)) {
				const id = row.id;
				// The game's own text by field, and its translations by language and field; a text a language lacks has no
				// row there, and shows in the game's own language.
				const text = {};
				const translations = Object.fromEntries(languages.map((tag) => [tag, {}]));
				for (const t of texts.get(id) ?? []) {
					const into = t.lang === SOURCE_LANGUAGE ? text : translations[t.lang];
					if (into) (into[t.field] ??= [])[t.idx] = t.value;
				}
				const values = {};
				for (const field of published) {
					const raw = row[field.name];
					values[field.name] = field.isArray && typeof raw === 'string' ? JSON.parse(raw) : raw;
				}
				const entityPictures = (pics.get(id) ?? []).map((p) => {
					const name = path.posix.basename(p.file);
					// Light on nothing, so drawn on a dark tile: what the game draws with its additive glow, and what
					// site.config.mjs `darkPictures` names, light and half clear over the game's own ground.
					const darkTile = Boolean(p.additive) || (darkPictures[kind.id] ?? []).includes(p.name);
					if (!pictures.has(name)) {
						const source = path.join(dir, ...p.file.split('/'));
						if (!fs.existsSync(source)) throw new Error(`${file}: ${kind.id} ${id}'s picture ${p.file} is not in the export`);
						pictures.set(name, {
							file: name,
							source,
							explicit: Boolean(p.explicit),
							width: p.width,
							height: p.height,
							hash: p.hash,
						});
					}
					return { name: p.name, ...pictures.get(name), ...(darkTile ? { darkTile: true } : {}) };
				});
				const title = text[kind.titleField]?.[0]?.trim() || kind.titles[id] || `${kind.label.one} ${id}`;
				// The name in each language that has one; none when the title is not the game's text.
				const names = {};
				if (text[kind.titleField]?.[0]?.trim()) {
					names[SOURCE_LANGUAGE] = title;
					for (const tag of languages) {
						const name = translations[tag][kind.titleField]?.[0]?.trim();
						if (name) names[tag] = name;
					}
				}
				const entity = {
					kind: kind.id,
					id,
					title,
					names,
					slug: slugify(title, kind.id),
					values,
					text,
					translations,
					pictures: entityPictures,
					thumbnail: thumbnailOf(entityPictures, thumbnails[kind.id]),
					refs: (refs.get(id) ?? []).map((r) => ({ field: r.field, idx: r.idx, kind: r.to_kind, id: r.to_id })),
					referencedBy: [],
					relations: relations.get(id) ?? [],
					cells: cells.get(id) ?? [],
					snippet: snippets.get(id) ?? null,
					loaded: Object.fromEntries(loadedRows.map(([name, rows]) => [name, rows.get(id) ?? []])),
					contentHash: row.content_hash,
				};
				entity.url = `/${game}/${kind.id}/${id}/${entity.slug}/`;
				// Its marks, the words a link to it shows (a unit that is a boss), in the export's order.
				entity.marks = kind.marks
					.filter((mark) => {
						const field = kind.fields.find((f) => f.name === mark.field);
						return field && values[mark.field] != null && !isNone(field, values[mark.field]);
					})
					.map((mark) => mark.word);
				kind.entities.push(entity);
				byKey.set(`${kind.id}:${id}`, entity);
			}
		}
		// A reference from a loaded table's row names the row's part, if it has one (a stage's ally), by the row's record:
		// the cell's index over the field's width.
		const kindById = new Map(kinds.map((kind) => [kind.id, kind]));
		const partOf = (entity, field, idx) => {
			const dot = field.indexOf('.');
			if (dot < 0) return null;
			const table = kindById.get(entity.kind).loaded.find((t) => t.name === field.slice(0, dot));
			if (!table?.parts.length) return null;
			const width = table.fields.find((f) => f.name === field.slice(dot + 1))?.width || 1;
			return entity.loaded[table.name].find((row) => row.record === Math.floor(idx / width))?.part ?? null;
		};
		for (const entity of byKey.values())
			for (const ref of entity.refs) {
				ref.target = byKey.get(`${ref.kind}:${ref.id}`) ?? null;
				ref.target?.referencedBy.push({ from: entity, field: ref.field, idx: ref.idx, part: partOf(entity, ref.field, ref.idx) });
			}
		// A row of cells whose column k is entity k of a kind (OME's `columns_ref`: an item's condition levels, by
		// condition) names its columns by those entities, by column.
		for (const kind of kinds)
			for (const field of [...kind.fields, ...kind.loaded.flatMap((table) => table.fields)])
				if (field.columnKind)
					field.columnEntities = new Map(
						Array.from({ length: field.width }, (_, c) => [c, byKey.get(`${field.columnKind}:${c}`)]).filter(([, e]) => e),
					);
		// Such a row refers to the entity of each column whose cell is not none, for that entity's "Related" (site plan
		// §13, C2): a skill's condition levels list it on each condition it inflicts, its level beside it.
		for (const kind of kinds)
			for (const field of kind.fields)
				if (field.published && field.columnEntities?.size)
					for (const entity of kind.entities)
						(entity.values[field.name] ?? []).forEach((v, c) => {
							const target = field.columnEntities.get(c);
							if (target && v != null && !isNone(field, v))
								target.referencedBy.push({ from: entity, field: field.name, idx: c, part: null, column: true });
						});
		// The entry whose picture a kind's card shows (site.config.mjs `cards`), else none chosen.
		for (const kind of kinds) kind.card = cards[kind.id] === undefined ? null : (byKey.get(`${kind.id}:${cards[kind.id]}`) ?? null);
		// Entities of a kind that share a name are told apart (OME's export plan §5, `qualify`). A kind whose title is a
		// reference takes its target's title, told apart already (§4.1): a recipe is named by the item it makes, and is
		// told apart from another making it after. A title of several references takes the first that names a record. It
		// shows the target's thumbnail too when it has none of its own. A URL's slug is made from the name before it is
		// told apart.
		const titleRefs = (kind) =>
			kind.titleFields.map((name) => kind.fields.find((f) => f.name === name && f.refKind)).filter(Boolean);
		qualify(kinds.filter((kind) => !titleRefs(kind).length));
		for (const kind of kinds) {
			const fields = titleRefs(kind);
			if (!fields.length) continue;
			for (const entity of kind.entities) {
				const target = fields.map((field) => entity.refs.find((ref) => ref.field === field.name)?.target).find(Boolean);
				if (!target) continue;
				entity.title = target.title;
				entity.names = target.names;
				entity.slug = slugify(target.baseTitle, kind.id);
				entity.url = `/${game}/${kind.id}/${entity.id}/${entity.slug}/`;
				entity.thumbnail ??= target.thumbnail;
			}
		}
		qualify(kinds.filter((kind) => titleRefs(kind).length));
		// A link to an entry of these kinds shows its thumbnail before its name (site.config.mjs `linkIcons`).
		for (const kind of kinds.filter((kind) => linkIcons.includes(kind.id)))
			for (const entity of kind.entities) if (entity.thumbnail) entity.icon = entity.thumbnail;
		return { game, revision, info, manifest, languages, packages, kinds, byKey, pictures };
	} finally {
		db.close();
	}
}

function fieldOf(row) {
	return {
		name: row.name,
		type: row.type,
		published: Boolean(row.published),
		text: Boolean(row.text),
		filter: Boolean(row.filter),
		refTable: row.ref_table,
		refKind: row.ref_kind,
		picture: row.picture,
		bank: row.bank,
		address: row.address,
		width: row.width,
		column: row.column_index,
		columns: row.columns ? JSON.parse(row.columns) : null,
		columnKind: row.column_kind ?? null,
		isArray: /\[\d+\]$/.test(row.type),
	};
}

/**
 * The part of an entity's URL made from its name, only for people (site design §4): its letters and digits in any
 * script, joined by hyphens. Never only digits, so never `404`, which Starlight keeps out of search.
 */
export function slugify(text, fallback) {
	const words = text.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '');
	const slug = Array.from(words).slice(0, 60).join('').replace(/-+$/, '');
	if (!slug) return fallback;
	return /^\p{N}+$/u.test(slug) ? `${fallback}-${slug}` : slug;
}

/** The picture a list or a tooltip shows: the first the site's preference names, never an explicit one. */
function thumbnailOf(pictures, preference = []) {
	const shown = pictures.filter((picture) => !picture.explicit);
	for (const name of preference) {
		const found = shown.find((picture) => picture.name === name);
		if (found) return found;
	}
	return preference.length ? null : (shown[0] ?? null);
}

function groupBy(rows, key) {
	const map = new Map();
	for (const row of rows) {
		const k = key(row);
		if (!map.has(k)) map.set(k, []);
		map.get(k).push(row);
	}
	return map;
}
