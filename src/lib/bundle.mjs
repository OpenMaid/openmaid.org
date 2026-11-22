// Reading OME's reference bundle (OME's export design §8; site design §7, §10.2): `OME-reference-<version>.zip`, which
// OME's `tools/reference_bundle.py` builds and each OME release publishes. Everything the site shows of OME comes from
// it: the guides, the games, and the registries the reference pages render.
//
// Where it comes from, first found first (site plan §6.1):
//   1. OME_BUNDLE: a zip, or a folder holding one;
//   2. OME_CHECKOUT: an OME checkout, whose own reference_bundle.py the build runs into bundle/checkout/;
//   3. a zip in bundle/, as the deploy downloads one;
//   4. the checkout site.config.mjs names, as in 2.
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { unzipSync } from 'fflate';

/** The bundle format this site reads (bundle.json's `format`). */
export const FORMAT_VERSION = 1;
const MANIFEST = 'bundle.json';
const ZIP = /^OME-reference-[0-9A-Za-z][0-9A-Za-z.+_-]*\.zip$/;

/**
 * Where this build's bundle is, building it from a checkout when that is the source. Returns the zip's path and, for a
 * checkout, its root (so a guide's link to another OME file can be checked).
 */
export function locateBundle({ siteRoot, bundleDir, checkout, environment = process.env, build = true }) {
	if (environment.OME_BUNDLE) return { zip: zipIn(path.resolve(siteRoot, environment.OME_BUNDLE)), checkout: null };
	if (environment.OME_CHECKOUT) return fromCheckout(path.resolve(siteRoot, environment.OME_CHECKOUT), bundleDir, environment, build);
	const downloaded = fs.existsSync(bundleDir) ? zipsIn(bundleDir) : [];
	if (downloaded.length > 0) return { zip: zipIn(bundleDir), checkout: null };
	return fromCheckout(path.resolve(siteRoot, checkout), bundleDir, environment, build);
}

function zipsIn(dir) {
	return fs.readdirSync(dir).filter((name) => ZIP.test(name) && fs.statSync(path.join(dir, name)).isFile());
}

function zipIn(file) {
	if (!fs.existsSync(file)) throw new Error(`no reference bundle at ${file}`);
	if (fs.statSync(file).isFile()) return file;
	const zips = zipsIn(file);
	if (zips.length !== 1)
		throw new Error(`${file} holds ${zips.length} reference bundles (OME-reference-<version>.zip); it must hold one`);
	return path.join(file, zips[0]);
}

/**
 * The bundle of an OME checkout, built by the checkout's own tool into bundle/checkout/, which is emptied first. With
 * `build` false (the site check, after the build) it is the one the build left there.
 */
function fromCheckout(root, bundleDir, environment, build) {
	const tool = path.join(root, 'tools', 'reference_bundle.py');
	if (!fs.existsSync(tool))
		throw new Error(`${root} is not an OME checkout with a reference bundle: it has no tools/reference_bundle.py (set OME_CHECKOUT, OME_BUNDLE or site.config.mjs)`);
	const out = path.join(bundleDir, 'checkout');
	if (build) {
		fs.rmSync(out, { recursive: true, force: true });
		const [command, ...prefix] = (environment.OME_PYTHON ?? (process.platform === 'win32' ? 'py -3.11' : 'python3')).split(/\s+/);
		execFileSync(command, [...prefix, '-X', 'utf8', tool, '--output', out], { cwd: root, stdio: ['ignore', 'ignore', 'inherit'] });
	}
	return { zip: zipIn(out), checkout: root };
}

/**
 * A bundle read into memory and checked: its bundle.json is format 1, names a version, a commit and the games, and
 * holds the hash of every other file in the zip, each of which matches.
 */
export function openBundle(zip) {
	const entries = unzipSync(fs.readFileSync(zip));
	const names = Object.keys(entries).filter((name) => !name.endsWith('/'));
	if (!names.includes(MANIFEST)) throw new Error(`${zip} has no ${MANIFEST}: it is not a reference bundle`);
	const manifest = JSON.parse(new TextDecoder().decode(entries[MANIFEST]));
	if (manifest.format !== FORMAT_VERSION)
		throw new Error(`${zip} is reference bundle format ${manifest.format}; this site reads ${FORMAT_VERSION}`);
	const listed = Object.keys(manifest.files ?? {});
	const present = names.filter((name) => name !== MANIFEST);
	const missing = listed.filter((name) => !entries[name]);
	const unlisted = present.filter((name) => !(name in manifest.files));
	if (missing.length || unlisted.length)
		throw new Error(`${zip}: ${MANIFEST} and the zip differ (missing ${missing.slice(0, 3)}, unlisted ${unlisted.slice(0, 3)})`);
	for (const name of listed) {
		const digest = 'sha256:' + crypto.createHash('sha256').update(entries[name]).digest('hex');
		if (digest !== manifest.files[name]) throw new Error(`${zip}: ${name} does not match its hash in ${MANIFEST}`);
	}
	const text = (name) => {
		if (!entries[name]) throw new Error(`the reference bundle has no ${name}`);
		return new TextDecoder().decode(entries[name]).replace(/\r\n/g, '\n');
	};
	return {
		zip,
		version: manifest.ome.version,
		commit: manifest.ome.commit,
		dirty: manifest.ome.dirty,
		games: manifest.games,
		names: listed.sort(),
		has: (name) => name in manifest.files,
		text,
		json: (name) => JSON.parse(text(name)),
	};
}
