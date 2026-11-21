// Reading a game's export (OME's export design §7) into the model the database pages render (site design §8). An export
// is the folder OME's `data-export` writes: <revision>.sqlite, pictures/<revision>/ and manifest.json.
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { kindLabel } from './labels.mjs';

/** The export format this site reads (the database's `format_version`). */
export const FORMAT_VERSION = 1;

/**
 * A game's export as the pages use it: its build facts, its kinds with their fields and entities, and its pictures.
 * Fails on what the site cannot show: a missing export, another format version, a picture file the export lacks.
 */
export function readExport({ game, revision, dir, thumbnails = {} }) {
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

		const all = (sql, ...args) => db.prepare(sql).all(...args).map((row) => ({ ...row }));
		const pictures = new Map(); // file name -> picture
		const byKey = new Map(); // "item:12" -> entity
		const kinds = all('SELECT id, table_name, title_field, aliases, entities FROM kind ORDER BY rowid').map((row) => ({
			id: row.id,
			table: row.table_name,
			titleField: row.title_field,
			aliases: JSON.parse(row.aliases),
			label: kindLabel(row.id),
			fields: all('SELECT * FROM field WHERE kind = ? ORDER BY rowid', row.id).map(fieldOf),
			scriptUse: all('SELECT script, reads, writes FROM script_use WHERE kind = ? ORDER BY script', row.id),
			entities: [],
		}));

		for (const kind of kinds) {
			const published = kind.fields.filter((field) => field.published);
			const grouped = (sql) => groupBy(all(sql, kind.id), (row) => row.id);
			const texts = grouped('SELECT id, field, idx, value FROM text WHERE kind = ? AND lang = \'ja\' ORDER BY id, field, idx');
			const refs = grouped('SELECT from_id AS id, field, idx, to_kind, to_id FROM ref WHERE from_kind = ? ORDER BY from_id, field, idx');
			const pics = grouped('SELECT id, name, file, explicit, width, height, hash FROM picture WHERE kind = ? ORDER BY id, name');
			const cells = grouped('SELECT id, field, idx, bank, address, raw, writer FROM cell WHERE kind = ? ORDER BY id, field, idx');
			const relations = grouped('SELECT id, relation, script, offset, count FROM relation WHERE kind = ? ORDER BY id, relation, script, offset');
			const snippets = new Map(all('SELECT id, text FROM snippet WHERE kind = ?', kind.id).map((r) => [r.id, r.text]));

			for (const row of all(`SELECT * FROM "${kind.id}" ORDER BY id`)) {
				const id = row.id;
				const text = {};
				for (const t of texts.get(id) ?? []) (text[t.field] ??= [])[t.idx] = t.value;
				const values = {};
				for (const field of published) {
					const raw = row[field.name];
					values[field.name] = field.isArray && typeof raw === 'string' ? JSON.parse(raw) : raw;
				}
				const entityPictures = (pics.get(id) ?? []).map((p) => {
					const name = path.posix.basename(p.file);
					if (!pictures.has(name)) {
						const source = path.join(dir, ...p.file.split('/'));
						if (!fs.existsSync(source)) throw new Error(`${file}: ${kind.id} ${id}'s picture ${p.file} is not in the export`);
						pictures.set(name, { file: name, source, explicit: Boolean(p.explicit), width: p.width, height: p.height, hash: p.hash });
					}
					return { name: p.name, ...pictures.get(name) };
				});
				const title = text[kind.titleField]?.[0]?.trim() || `${kind.label.one} ${id}`;
				const entity = {
					kind: kind.id,
					id,
					title,
					slug: slugify(title, kind.id),
					values,
					text,
					pictures: entityPictures,
					thumbnail: thumbnailOf(entityPictures, thumbnails[kind.id]),
					refs: (refs.get(id) ?? []).map((r) => ({ field: r.field, idx: r.idx, kind: r.to_kind, id: r.to_id })),
					referencedBy: [],
					relations: relations.get(id) ?? [],
					cells: cells.get(id) ?? [],
					snippet: snippets.get(id) ?? null,
					contentHash: row.content_hash,
				};
				entity.url = `/${game}/${kind.id}/${id}/${entity.slug}/`;
				kind.entities.push(entity);
				byKey.set(`${kind.id}:${id}`, entity);
			}
		}
		for (const entity of byKey.values())
			for (const ref of entity.refs) {
				ref.target = byKey.get(`${ref.kind}:${ref.id}`) ?? null;
				ref.target?.referencedBy.push({ from: entity, field: ref.field, idx: ref.idx });
			}
		return { game, revision, info, manifest, kinds, byKey, pictures };
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
