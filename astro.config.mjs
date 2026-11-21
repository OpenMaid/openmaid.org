// @ts-check
import { satteri } from '@astrojs/markdown-satteri';
import starlight from '@astrojs/starlight';
import { defineConfig } from 'astro/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import config from './site.config.mjs';
import { guideLinks } from './src/lib/guide-links.mjs';
import { games, openCheckout, syncGuides } from './src/lib/ome.mjs';

// The guides are copied in before Astro reads its content, so every build and dev server starts from the checkout.
const here = path.dirname(fileURLToPath(import.meta.url));
const checkout = openCheckout(path.resolve(here, config.ome.checkout));
const guides = syncGuides(checkout, new URL('./src/content/docs/docs/', import.meta.url));

// The games whose database the build makes (site.config.mjs `games`, or OME_SITE_GAMES).
const listed = process.env.OME_SITE_GAMES?.split(',').map((game) => game.trim()).filter(Boolean) ?? Object.keys(config.games);
for (const game of listed) if (!config.games[game]) throw new Error(`OME_SITE_GAMES names ${game}, which site.config.mjs does not`);
const databases = listed.map((game) => ({ game, dir: path.join(here, 'data', game), ...config.games[game] }));

// What the pages read of OME and the exports, as the module `virtual:ome` (typed in src/env.d.ts).
const ome = {
	version: checkout.version,
	commit: checkout.commit,
	repository: config.ome.repository,
	games: games(checkout),
	databases,
};

// Before the first paint: marks a visitor who confirmed the age notice (src/components/AgeNotice.astro), and restores
// the database's switches, modder mode and explicit pictures (src/components/DatabaseSwitches.astro).
const remembered = [
	['ome-age-confirmed', 'data-ome-age-confirmed'],
	['ome-modder-mode', 'data-ome-modder'],
	['ome-show-explicit', 'data-ome-explicit'],
];
const headScript = `try{${remembered
	.map(([key, attribute]) => `if(localStorage.getItem('${key}')==='1')document.documentElement.setAttribute('${attribute}','');`)
	.join('')}}catch{}`;

export default defineConfig({
	site: config.site,
	markdown: {
		processor: satteri({ mdastPlugins: [guideLinks(checkout, guides, config.ome.repository)] }),
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
			sidebar: guides.sidebar,
			social: [{ icon: 'github', label: 'GitHub', href: config.ome.repository }],
			head: [{ tag: 'script', content: headScript }],
			components: {
				SkipLink: './src/components/SkipLink.astro',
				SiteTitle: './src/components/SiteTitle.astro',
			},
			// src/pages/404.astro sends an entity's address without its slug, or with a wrong one, to the right page.
			disable404Route: true,
			customCss: ['./src/styles/site.css'],
		}),
	],
});
