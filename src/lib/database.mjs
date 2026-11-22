// The games whose database this build makes, read once per build (site.config.mjs `games`).
import ome from 'virtual:ome';
import { readExport } from './export.mjs';

const cache = new Map();

/** Every game the build has an export of, in the config's order. */
export function games() {
	return ome.databases.map((database) => game(database.game));
}

/** One game's export, with its title from OME. */
export function game(id) {
	if (!cache.has(id)) {
		const database = ome.databases.find((d) => d.game === id);
		if (!database) throw new Error(`the build has no database for ${id}`);
		const data = readExport(database);
		data.title = ome.games.find((g) => g.id === id)?.title ?? data.info.title;
		cache.set(id, data);
	}
	return cache.get(id);
}

/** Where a picture of an export is served (site design §8.9), and its blurred stand-in (§8.11). */
export const pictureUrl = (data, picture) => `/pictures/${data.game}/${data.revision}/${picture.file}`;
export const standInUrl = (data, picture) => `/pictures/${data.game}/${data.revision}/standin/${picture.file}`;

/**
 * The sidebar of a game's database pages: its front page and its kinds. An entity's page marks its kind as where it is
 * (`aria-current="location"`; site plan §13, P5), its list being the page Starlight marks as current.
 */
export function databaseSidebar(data, current = null) {
	return [
		{
			label: data.title,
			items: [
				{ label: 'Overview', link: `/${data.game}/` },
				...data.kinds.map((kind) => ({
					label: kind.label.many,
					link: `/${data.game}/${kind.id}/`,
					...(kind.id === current ? { attrs: { 'aria-current': 'location' } } : {}),
				})),
			],
		},
	];
}

/**
 * The database's lists built from a record table (site design §7.2): the kinds whose table it is, and the kinds whose
 * loaders build it (a stage's enemies, listed on each stage's page). None when the build has no database of the game.
 */
export function kindsOfTable(gameId, table) {
	if (!ome.databases.some((database) => database.game === gameId)) return [];
	const data = game(gameId);
	return data.kinds.flatMap((kind) => [
		...(kind.table === table ? [{ link: `/${data.game}/${kind.id}/`, label: kind.label.many, loaded: null }] : []),
		...kind.loaded
			.filter((loaded) => loaded.table === table)
			.map((loaded) => ({ link: `/${data.game}/${kind.id}/`, label: kind.label.many, loaded: loaded.label.many })),
	]);
}
