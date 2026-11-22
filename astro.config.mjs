// @ts-check
import { satteri } from '@astrojs/markdown-satteri';
import starlight from '@astrojs/starlight';
import { defineConfig } from 'astro/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import config from './site.config.mjs';
import { locateBundle, openBundle } from './src/lib/bundle.mjs';
import { guideLinkKey, guideLinks, referenceTargets } from './src/lib/guide-links.mjs';
import { games, syncGuides } from './src/lib/ome.mjs';
import { referenceSidebar } from './src/lib/reference-model.mjs';

// The reference bundle is the one source of what the site shows of OME (site plan §6.1). The guides are copied from it
// before Astro reads its content, so every build and dev server starts from it.
const here = path.dirname(fileURLToPath(import.meta.url));
const located = locateBundle({ siteRoot: here, bundleDir: path.join(here, 'bundle'), checkout: config.ome.checkout });
const bundle = openBundle(located.zip);
console.log(`[ome] reference bundle ${bundle.version} (${bundle.commit.slice(0, 12)}${bundle.dirty ? ', with changes' : ''}) from ${located.checkout ?? located.zip}`);
const linkSource = { commit: bundle.commit, checkout: located.checkout, references: referenceTargets(bundle.json('games.json').games) };
const guideNames = bundle.names.filter((name) => name.startsWith('docs/modding/'));
const guides = syncGuides(
	bundle,
	new URL('./src/content/docs/docs/', import.meta.url),
	guideLinkKey(linkSource, guideNames, config.ome.repository),
);
const omeGames = games(bundle);

// The games whose database the build makes (site.config.mjs `games`, or OME_SITE_GAMES).
const listed = process.env.OME_SITE_GAMES?.split(',').map((game) => game.trim()).filter(Boolean) ?? Object.keys(config.games);
for (const game of listed) if (!config.games[game]) throw new Error(`OME_SITE_GAMES names ${game}, which site.config.mjs does not`);
const databases = listed.map((game) => ({ game, dir: path.join(here, 'data', game), ...config.games[game] }));

// What the pages read of OME and the exports, as the module `virtual:ome` (typed in src/env.d.ts).
const ome = {
	version: bundle.version,
	commit: bundle.commit,
	repository: config.ome.repository,
	games: omeGames,
	databases,
	bundle: located.zip,
};

// Before the first paint: marks a visitor who confirmed the age notice (src/components/AgeNotice.astro), and restores
// the database's switches, modder mode, explicit pictures and the game text's language
// (src/components/DatabaseSwitches.astro).
const remembered = [
	['ome-age-confirmed', 'data-ome-age-confirmed'],
	['ome-modder-mode', 'data-ome-modder'],
	['ome-show-explicit', 'data-ome-explicit'],
];
const headScript = `try{${remembered
	.map(([key, attribute]) => `if(localStorage.getItem('${key}')==='1')document.documentElement.setAttribute('${attribute}','');`)
	.join('')}const l=localStorage.getItem('ome-game-language');if(l)document.documentElement.setAttribute('data-ome-lang',l);}catch{}`;

export default defineConfig({
	site: config.site,
	markdown: {
		processor: satteri({
			mdastPlugins: [
				guideLinks(linkSource, guides, config.ome.repository),
			],
		}),
	},
	vite: {
		plugins: [
			{
				name: 'ome-data',
				resolveId: (id) => (id === 'virtual:ome' ? '\0virtual:ome' : undefined),
				load: (id) => (id === '\0virtual:ome' ? `export default ${JSON.stringify(ome)};` : undefined),
			},
		],
	},
	integrations: [
		starlight({
			title: 'Open Maid Engine',
			sidebar: [...guides.sidebar, referenceSidebar(omeGames)],
			social: [{ icon: 'github', label: 'GitHub', href: config.ome.repository }],
			head: [{ tag: 'script', content: headScript }],
			components: {
				SkipLink: './src/components/SkipLink.astro',
				SiteTitle: './src/components/SiteTitle.astro',
				Sidebar: './src/components/Sidebar.astro',
				PageTitle: './src/components/PageTitle.astro',
			},
			// src/pages/404.astro sends an entity's address without its slug, or with a wrong one, to the right page.
			disable404Route: true,
			customCss: ['./src/styles/site.css'],
		}),
	],
});
