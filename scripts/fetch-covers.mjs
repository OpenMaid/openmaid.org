// Downloads the cover of each game the build makes a database for (src/lib/covers.mjs, site plan §15.4) into
// data/covers/, from the address the reference bundle's games.json gives, and keeps it only if its SHA-256 is the
// bundle's. A copy already there with that hash is kept as it is. The deploy puts the bucket's copies there first,
// runs it, and keeps what it downloaded in the bucket (site plan §15.7); the image's build runs it again, and a build
// by hand runs it once:
//
//   node scripts/fetch-covers.mjs
//
// It reads the bundle as the build does (src/lib/bundle.mjs: OME_BUNDLE, OME_CHECKOUT, bundle/, site.config.mjs). A
// cover it cannot get is reported, and the build shows that game without one: the deploy does not stop for a picture.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import config from '../site.config.mjs';
import { locateBundle, openBundle } from '../src/lib/bundle.mjs';
import { coverPath, matches } from '../src/lib/covers.mjs';
import { listedGames } from '../src/lib/listed-games.mjs';

const siteRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const located = locateBundle({ siteRoot, bundleDir: path.join(siteRoot, 'bundle'), checkout: config.ome.checkout });
const games = openBundle(located.zip).json('games.json').games;

let missing = 0;
for (const game of listedGames(config)) {
	const cover = games.find((g) => g.id === game)?.cover;
	if (!cover) {
		console.log(`${game}: the bundle names no cover`);
		continue;
	}
	const file = coverPath(siteRoot, game, cover);
	if (fs.existsSync(file) && matches(fs.readFileSync(file), cover)) {
		console.log(`${game}: ${path.relative(siteRoot, file)} is the cover`);
		continue;
	}
	try {
		// A plain client name, as a browser's address bar would fetch it; the publisher's server is not told more.
		const response = await fetch(cover.url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; OpenMaidSite)' } });
		if (!response.ok) throw new Error(`HTTP ${response.status}`);
		const bytes = Buffer.from(await response.arrayBuffer());
		if (!matches(bytes, cover)) throw new Error('its SHA-256 is not the one OME names');
		fs.mkdirSync(path.dirname(file), { recursive: true });
		fs.writeFileSync(file, bytes);
		console.log(`${game}: downloaded ${cover.url} to ${path.relative(siteRoot, file)}`);
	} catch (error) {
		missing += 1;
		console.warn(`${game}: no cover: ${cover.url}: ${error.message}`);
	}
}
if (missing > 0) console.warn(`${missing} cover(s) missing: the databases page shows those games without one`);
