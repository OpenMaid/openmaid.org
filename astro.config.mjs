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

// What the pages read of OME, as the module `virtual:ome` (typed in src/env.d.ts).
const ome = {
	version: checkout.version,
	commit: checkout.commit,
	repository: config.ome.repository,
	games: games(checkout),
};

// Marks a visitor who confirmed the age notice before the first paint (src/components/AgeNotice.astro).
const ageConfirmed =
	"try{if(localStorage.getItem('ome-age-confirmed')==='1')document.documentElement.setAttribute('data-ome-age-confirmed','')}catch{}";

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
			head: [{ tag: 'script', content: ageConfirmed }],
			components: { SkipLink: './src/components/SkipLink.astro' },
			customCss: ['./src/styles/site.css'],
		}),
	],
});
