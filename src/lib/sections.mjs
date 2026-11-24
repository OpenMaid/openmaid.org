// The site's two sections (site design §1.1): the modding guide, and a database for each game the build has an export
// of. The header shows them on a wide screen (SiteTitle.astro); below that the sidebar does, which is also the phone's
// menu (Sidebar.astro), and the home page links them too.
import ome from 'virtual:ome';

export const guide = { label: 'Modding guide', href: '/docs/' };

/** The page that lists the game databases (the user, 2026-11-24), which the home page's hero links. */
export const databasesPage = { label: 'Game databases', href: '/databases/' };

/** Each game database, in the config's order: its game's title and its front page. */
export function databases() {
	return ome.databases.map(({ game }) => ({
		game,
		label: ome.games.find((g) => g.id === game)?.title ?? game,
		href: `/${game}/`,
	}));
}

/** The sidebar of the page that lists the databases: that page, and each database's front page. */
export function databasesSidebar() {
	return [
		{
			label: databasesPage.label,
			items: [
				{ label: 'All databases', link: databasesPage.href },
				...databases().map(({ label, href }) => ({ label, link: href })),
			],
		},
	];
}
