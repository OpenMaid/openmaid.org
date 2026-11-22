import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { docsLoader } from '@astrojs/starlight/loaders';
import { docsSchema } from '@astrojs/starlight/schema';

// The reference section's pages: OME's guides, which the build copies into src/content/docs/docs/ (src/lib/ome.mjs).
// `omeLinks` is the key over what a guide's links map to (src/lib/guide-links.mjs `guideLinkKey`); no page shows it.
export const collections = {
	docs: defineCollection({
		loader: docsLoader(),
		schema: docsSchema({ extend: z.object({ omeLinks: z.string().optional() }) }),
	}),
};
