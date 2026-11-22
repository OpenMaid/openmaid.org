// The reference pages' model (site design §7.2, site plan §6.1), made from a reference bundle (src/lib/bundle.mjs). It
// imports nothing of Astro, so scripts/check-site.mjs builds the same model to check that every entry has its page.
import { parse as parseToml } from 'smol-toml';

/** Where each reference page is (site design §4). */
export const href = {
	reference: () => '/docs/reference/',
	opcodes: () => '/docs/reference/opcodes/',
	opcode: (op) => `/docs/reference/opcodes/${op}/`,
	game: (game) => `/docs/${game}/`,
	globals: (game) => `/docs/${game}/globals/`,
	global: (game, name) => `/docs/${game}/globals/${name}/`,
	tables: (game) => `/docs/${game}/tables/`,
	table: (game, name) => `/docs/${game}/tables/${name}/`,
	points: (game) => `/docs/${game}/patch-points/`,
	point: (game, name) => `/docs/${game}/patch-points/${name}/`,
	events: (game) => `/docs/${game}/events/`,
	event: (game, name) => `/docs/${game}/events/${name}/`,
	scripts: (game) => `/docs/${game}/scripts/`,
	script: (game, key) => `/docs/${game}/scripts/${scriptName(key)}/`,
};

/** A script's name as its page and OME's notes write it: `ADDEXP.BIN` is `ADDEXP`. */
export const scriptName = (key) => key.replace(/\.BIN$/i, '');

/** The whole reference: the opcodes with each build's facts, and each game's registries. */
export function referenceModel(bundle) {
	const games = bundle.json('games.json').games;
	const builds = games
		.flatMap((game) => game.script_revisions.map((revision) => ({ revision, build: game.engine_build, game: game.id, title: game.title })))
		.sort((a, b) => a.build.localeCompare(b.build));
	return {
		version: bundle.version,
		commit: bundle.commit,
		builds,
		opcodes: opcodesOf(bundle.json('opcodes.json'), builds),
		games: games.map((game) => gameOf(bundle, game)),
	};
}

function opcodesOf(document, builds) {
	const dependents = document.dependents ?? {};
	return document.opcodes
		.map((op) => {
			const semantics = op.semantics ?? {};
			const evidence = semantics.evidence ?? [];
			return {
				op: op.op,
				number: parseInt(op.op, 16),
				label: op.label,
				name: semantics.name || op.label,
				category: semantics.category,
				summary: semantics.summary ?? '',
				details: semantics.details ?? '',
				status: op.semantic_status,
				confidence: semantics.confidence,
				source: semantics.source,
				confirmBy: semantics.confirm_by ?? '',
				argc: op.argc,
				args: semantics.args ?? [],
				waits: semantics.waits ?? null,
				leaves: semantics.leaves ?? null,
				dependsOn: semantics.depends_on ?? [],
				dependents: dependents[op.op] ?? [],
				evidence,
				builds: builds.map((build) => ({
					...build,
					used: (op.observed_revisions ?? []).includes(build.revision),
					evidence: evidence.filter((item) => (item.engine_revisions ?? []).includes(build.revision)).length,
				})),
			};
		})
		.sort((a, b) => a.number - b.number);
}

function gameOf(bundle, game) {
	const prefix = `games/${game.id}/`;
	const registry = bundle.json(`${prefix}globals.json`);
	const cells = Object.values(registry.cells);
	const globals = cells.filter((cell) => cell.name).sort((a, b) => a.name.localeCompare(b.name));
	const unnamed = cells.filter((cell) => !cell.name);
	const shape = bundle.json(`${prefix}shapes/tables.schema.json`).definitions ?? {};
	const exported = new Set(bundle.json(`${prefix}layout/globals.json`).globals.map((entry) => entry.name));
	const points = bundle.json(`${prefix}layout/points.json`).points;
	const events = bundle.names
		.filter((name) => name.startsWith(`${prefix}events/`) && name.endsWith('.toml'))
		.flatMap((name) => (parseToml(bundle.text(name)).event ?? []).map((event) => ({
			name: event.name,
			points: [event.point].flat().filter(Boolean),
			description: event.description ?? '',
			fields: event.field ?? [],
			file: name.slice(`${prefix}events/`.length),
		})));
	const scripts = bundle.has(`${prefix}scripts.json`) ? bundle.json(`${prefix}scripts.json`).scripts : null;

	const byName = new Map(globals.map((cell) => [cell.name, cell]));
	// The record tables each global is a field of, and the scripts that use it.
	const fieldOf = new Map();
	for (const table of registry.tables)
		for (const [field, global] of Object.entries(table.fields)) push(fieldOf, global, { table: table.name, field });
	const usedBy = new Map();
	if (scripts)
		for (const [key, script] of Object.entries(scripts))
			for (const [global, [reads, writes, indexes]] of Object.entries(script.globals ?? {}))
				push(usedBy, global, { script: key, reads, writes, indexes });
	for (const uses of usedBy.values()) uses.sort((a, b) => b.reads + b.writes + b.indexes - (a.reads + a.writes + a.indexes) || a.script.localeCompare(b.script));

	const tables = registry.tables.map((table) => {
		const record = shape[`record.${table.name}`]?.properties ?? {};
		return {
			name: table.name,
			records: table.records,
			builtBy: table.built_by,
			usage: table.usage ?? '',
			aliases: table.aliases ?? [],
			fieldAliases: table.field_aliases ?? {},
			scopes: registry.scopes.filter((scope) => Object.values(scope.tables).includes(table.name)),
			fields: Object.entries(table.fields).map(([field, global]) => ({
				name: field,
				global,
				type: byName.get(global)?.type ?? null,
				usage: byName.get(global)?.usage ?? '',
				ref: table.refs?.[field] ?? null,
				dataFile: dataFileOf(table.name, field, global, record[field]),
			})),
		};
	});

	return {
		id: game.id,
		title: game.title,
		titles: game.titles,
		engineBuild: game.engine_build,
		revisions: game.script_revisions,
		baseMod: game.base_mod,
		globals,
		unnamed,
		global: (name) => byName.get(name) ?? null,
		fieldOf: (name) => fieldOf.get(name) ?? [],
		usedBy: (name) => usedBy.get(name) ?? [],
		exported: (name) => exported.has(name),
		tables,
		table: (name) => tables.find((table) => table.name === name) ?? null,
		scopes: registry.scopes,
		points,
		point: (name) => points.find((point) => point.name === name) ?? null,
		eventsAt: (name) => events.filter((event) => event.points.includes(name)),
		events,
		event: (name) => events.find((event) => event.name === name) ?? null,
		scripts,
		script: (key) => (scripts && scripts[key]) ?? null,
		pointsIn: (key) => points.filter((point) => point.script === key),
	};
}

/**
 * What a data file may write to a field, from the base mod's shape (OME's base_mod_build.py): `settable`, and the
 * shape's words for it without the field's own name (`a whole number`; `saved state: a load brings the saved value
 * back, so a file does not set it`). A field the shape lacks is null.
 */
function dataFileOf(table, field, global, property) {
	if (!property) return null;
	const description = property.description ?? '';
	const settable = property.type !== 'null';
	const prefix = settable ? `${table}.${field}: ${global}, ` : `${table}.${field} is `;
	return { settable, text: description.startsWith(prefix) ? description.slice(prefix.length) : description };
}

function push(map, key, value) {
	if (!map.has(key)) map.set(key, []);
	map.get(key).push(value);
}

/** The sidebar's Reference group: the opcodes, and each game's registries (`games` as src/lib/ome.mjs lists them). */
export function referenceSidebar(games) {
	return {
		label: 'Reference',
		items: [
			{ label: 'Overview', link: href.reference() },
			{ label: 'Opcodes', link: href.opcodes() },
			...games.map((game) => ({
				label: game.title,
				collapsed: true,
				items: [
					{ label: 'Overview', link: href.game(game.id) },
					{ label: 'Globals', link: href.globals(game.id) },
					{ label: 'Record tables', link: href.tables(game.id) },
					{ label: 'Patch points', link: href.points(game.id) },
					{ label: 'Events', link: href.events(game.id) },
					...(game.scriptIndex ? [{ label: 'Scripts', link: href.scripts(game.id) }] : []),
				],
			})),
		],
	};
}
