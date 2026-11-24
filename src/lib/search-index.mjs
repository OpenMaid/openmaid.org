// A game database's search index (site plan §9.2): every entry's name in each language, its kind and its thumbnail,
// which the database's search box suggests from as one types and its results page finds entries in
// (src/scripts/search.ts). Names only: an entry's text is in Pagefind's index, which the results page's "Full text"
// tab asks.
import { pictureTuple } from './format.mjs';
import { SOURCE_LANGUAGE } from './language.mjs';

/**
 * The index of a game's export: its kinds (`id`, `one`, `many`), the folder of its pictures, and an entry for each
 * entity, `[kind, id, slug, title, names, picture]`: the kind's index in `kinds`; the entity's id and its URL's slug
 * (its address is `/<game>/<kind>/<id>/<slug>/`); its name in the game's language, told apart from others; its names
 * in the other languages (`{ en: … }`, 0 when it has none: a title that is not the game's text); and its thumbnail,
 * `[file, width, height]` with a 1 after them where it is additive (`pictureTuple`), or 0.
 */
export function searchData(data) {
	return {
		game: data.game,
		title: data.title,
		pictures: `/pictures/${data.game}/${data.revision}/`,
		kinds: data.kinds.map((kind) => ({ id: kind.id, one: kind.label.one, many: kind.label.many })),
		entries: data.kinds.flatMap((kind, k) =>
			kind.entities.map((entity) => {
				const others = Object.fromEntries(Object.entries(entity.names).filter(([tag]) => tag !== SOURCE_LANGUAGE));
				const picture = entity.thumbnail;
				return [
					k,
					entity.id,
					entity.slug,
					entity.title,
					Object.keys(others).length ? others : 0,
					picture ? pictureTuple(picture) : 0,
				];
			}),
		),
	};
}
