import { defineCollection } from 'astro:content';
import { docsLoader } from '@astrojs/starlight/loaders';
import { docsSchema } from '@astrojs/starlight/schema';

// The reference section's pages: OME's guides, which the build copies into src/content/docs/docs/ (src/lib/ome.mjs).
export const collections = {
	docs: defineCollection({ loader: docsLoader(), schema: docsSchema() }),
};
