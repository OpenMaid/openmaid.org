// The key of a game's export in the deploy's bucket (site plan §15): exports/<game>/<key>/ holds the export made from
// these inputs, so a deploy makes it only when one of them changed:
//
// - the OME commit whose exporter makes it;
// - the game's install in the bucket (installs/<game>/) and each translated install (translations/<game>/<language>/),
//   by their listings: every object's name, ETag and size, so a file uploaded again changes the key;
// - how the export is made: scripts/make-export.mjs, and the game's translations and game version in site.config.mjs.
//
//   node scripts/export-key.mjs <game> <ome-commit> <listings>
//
// <listings> is a folder holding install.json and translation-<language>.json, each the bucket's listing of the prefix
// as `aws s3api list-objects-v2 --query 'Contents[].[Key,ETag,Size]' --output json` prints it. Prints the key: 16 hex
// digits.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import config from '../site.config.mjs';

const [game, omeCommit, listings] = process.argv.slice(2);
if (!game || !omeCommit || !listings) {
	console.error('usage: node scripts/export-key.mjs <game> <ome-commit> <listings>');
	process.exit(2);
}
const settings = config.games[game];
if (!settings) throw new Error(`site.config.mjs has no game ${game}`);
if (!/^[0-9a-f]{40}$/.test(omeCommit)) throw new Error(`${omeCommit} is not a full commit hash`);

/** A listing, prefix stripped and in name order; refused when the bucket holds nothing under the prefix. */
function listing(file, prefix) {
	const rows = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
	if (!Array.isArray(rows) || rows.length === 0) throw new Error(`the bucket holds nothing under ${prefix}`);
	return rows
		.map(([key, etag, size]) => {
			if (!key.startsWith(prefix)) throw new Error(`${file} lists ${key}, outside ${prefix}`);
			return [key.slice(prefix.length), etag, size];
		})
		.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
}

const translations = settings.translations ?? [];
const here = path.dirname(fileURLToPath(import.meta.url));
const inputs = {
	format: 1,
	game,
	ome: omeCommit,
	maker: crypto.createHash('sha256').update(fs.readFileSync(path.join(here, 'make-export.mjs'))).digest('hex'),
	translations,
	gameVersion: settings.gameVersion ?? null,
	install: listing(path.join(listings, 'install.json'), `installs/${game}/`),
	translated: Object.fromEntries(
		translations.map(({ language }) => [
			language,
			listing(path.join(listings, `translation-${language}.json`), `translations/${game}/${language}/`),
		]),
	),
};
console.log(crypto.createHash('sha256').update(JSON.stringify(inputs)).digest('hex').slice(0, 16));
