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

/** The sidebar of a game's database pages: its front page and its kinds. */
export function databaseSidebar(data) {
	return [
		{
			label: data.title,
			items: [
				{ label: 'Overview', link: `/${data.game}/` },
				...data.kinds.map((kind) => ({ label: kind.label.many, link: `/${data.game}/${kind.id}/` })),
			],
		},
	];
}
