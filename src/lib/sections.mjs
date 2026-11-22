// The site's two sections (site design §1.1): the modding guide, and a database for each game the build has an export
// of. The header shows them on a wide screen (SiteTitle.astro); below that the sidebar does, which is also the phone's
// menu (Sidebar.astro), and the home page links them too.
import ome from 'virtual:ome';

export const guide = { label: 'Modding guide', href: '/docs/' };

/** Each game database, in the config's order: its game's title and its front page. */
export function databases() {
	return ome.databases.map(({ game }) => ({
		game,
		label: ome.games.find((g) => g.id === game)?.title ?? game,
		href: `/${game}/`,
	}));
}
