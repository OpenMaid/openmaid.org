// What the build reads of OME (astro.config.mjs).
declare module 'virtual:ome' {
	const ome: {
		version: string;
		commit: string;
		repository: string;
		games: {
			id: string;
			title: string;
			titles: string[];
			engineBuild: string;
			scriptRevisions: string[];
			play: string | null;
			modding: string | null;
			site: string | null;
			baseMod: { id: string; version: string };
			scriptIndex: boolean;
		}[];
		databases: { game: string; revision: string; dir: string; thumbnails: Record<string, string[]> }[];
		// The reference bundle's zip (src/lib/bundle.mjs), which src/lib/reference.mjs reads.
		bundle: string;
	};
	export default ome;
}

declare namespace App {
	interface Locals {
		// An entity page's name in each language it has one, by tag (src/components/PageTitle.astro).
		omeNames?: Record<string, string>;
	}
}
