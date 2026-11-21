// What the build reads of OME (astro.config.mjs).
declare module 'virtual:ome' {
	const ome: {
		version: string;
		commit: string;
		repository: string;
		games: { id: string; title: string; play: string | null; modding: string | null; site: string | null }[];
	};
	export default ome;
}
