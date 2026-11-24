// Each game's cover (site plan §15.4): the picture of its package the publisher shows, which OME's profile manifest
// names for its launcher (`launcher.cover`, the picture's address and SHA-256) and the reference bundle's games.json
// carries. The site serves its own copy, as the English wiki does (the user, 2026-11-24: "hotlinking tends to be looked
// down upon"). scripts/fetch-covers.mjs downloads it into data/covers/, which git ignores as it does the exports; a build
// never downloads, and shows a cover only where that copy's SHA-256 is the bundle's.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/** The pictures a cover may be, by its address's extension, with their content types. */
const TYPES = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png' };

/** Where a game's copy of its cover lives: data/covers/<game><extension>, the extension its address ends in. */
export function coverPath(siteRoot, game, cover) {
	const extension = path.extname(new URL(cover.url).pathname).toLowerCase();
	if (!TYPES[extension]) throw new Error(`${game}'s cover ${cover.url} is no JPEG or PNG`);
	return path.join(siteRoot, 'data', 'covers', `${game}${extension}`);
}

/** Whether bytes are the cover the bundle names: their SHA-256 is its `sha256`. */
export const matches = (bytes, cover) => crypto.createHash('sha256').update(bytes).digest('hex') === cover.sha256;

/**
 * The checked copy of a game's cover, `{ source, name, type, width, height }` (the file, the name the site serves it
 * by, its content type and size), or null when the bundle names none or there is no copy whose hash is the bundle's.
 */
export function localCover(siteRoot, game, cover) {
	if (!cover) return null;
	const source = coverPath(siteRoot, game, cover);
	if (!fs.existsSync(source)) return null;
	const bytes = fs.readFileSync(source);
	if (!matches(bytes, cover)) return null;
	const size = pictureSize(bytes);
	if (!size) return null;
	const extension = path.extname(source);
	return { source, name: path.basename(source), type: TYPES[extension], ...size };
}

/** A JPEG's or a PNG's width and height, from its header; null for anything else. */
export function pictureSize(bytes) {
	// PNG: the signature, then IHDR's width and height.
	if (bytes.length >= 24 && bytes.readUInt32BE(0) === 0x89504e47 && bytes.toString('latin1', 12, 16) === 'IHDR')
		return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
	// JPEG: the first frame header, SOF0 to SOF15 but DHT (C4), JPG (C8) and DAC (CC), past the segments before it.
	if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
	let at = 2;
	while (at + 9 < bytes.length) {
		if (bytes[at] !== 0xff) return null;
		const marker = bytes[at + 1];
		if (marker === 0xff) {
			at += 1;
			continue;
		}
		const length = bytes.readUInt16BE(at + 2);
		if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker))
			return { height: bytes.readUInt16BE(at + 5), width: bytes.readUInt16BE(at + 7) };
		at += 2 + length;
	}
	return null;
}
