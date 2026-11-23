// Makes a game's export with an OME checkout (site plan §15), as the deploy does from the installs in its bucket:
//
//   node scripts/make-export.mjs --ome DIR --game GAME --install DIR [--translations DIR] --output DIR
//
// 1. In the OME checkout, OME's build tools write what the exporter reads (the opcode table, the game's registry view,
//    patch points and entity declarations), and the exporter is built. A tracked file the tools rewrite is restored
//    after them: in a checkout with no extracted scripts, the global reference comes out shorter. The exporter reads
//    only build/, and the export's OME version (`git describe --dirty`) then names the commit as it is.
// 2. Each translation site.config.mjs lists for the game is imported from its translated install, <translations>/
//    <language>/, with `omp text import-scripts` and its options, into a language package. The package's manifest is
//    written first from the config (its id, name and authors, which the site credits); the importer keeps it.
// 3. `data-export` exports the game with those packages into the output folder.
//
// Python is OME_PYTHON, else `py -3.11` on Windows and `python3` elsewhere, as for the bundle (src/lib/bundle.mjs).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import config from '../site.config.mjs';

const { values: options } = parseArgs({
	options: {
		ome: { type: 'string' },
		game: { type: 'string' },
		install: { type: 'string' },
		translations: { type: 'string' },
		output: { type: 'string' },
		'no-build': { type: 'boolean', default: false },
	},
});
for (const name of ['ome', 'game', 'install', 'output'])
	if (!options[name]) {
		console.error('usage: node scripts/make-export.mjs --ome DIR --game GAME --install DIR [--translations DIR] --output DIR [--no-build]');
		process.exit(2);
	}
const game = options.game;
const settings = config.games[game];
if (!settings) throw new Error(`site.config.mjs has no game ${game}`);
const ome = path.resolve(options.ome);
const install = path.resolve(options.install);
const output = path.resolve(options.output);
const translations = settings.translations ?? [];
if (translations.length > 0 && !options.translations)
	throw new Error(`${game} has translations in site.config.mjs: give --translations, the folder holding <language>/`);
if (!fs.existsSync(path.join(install, 'SYS4INI.BIN'))) throw new Error(`${install} is not an install: it has no SYS4INI.BIN`);

const [python, ...pythonPrefix] = (process.env.OME_PYTHON ?? (process.platform === 'win32' ? 'py -3.11' : 'python3')).split(/\s+/);
const run = (command, args) => {
	console.log(`> ${[command, ...args].join(' ')}`);
	execFileSync(command, args, { cwd: ome, stdio: 'inherit' });
};
const tool = (name, ...args) => run(python, [...pythonPrefix, '-X', 'utf8', `tools/${name}`, ...args]);
const cli = (...args) => run('dotnet', ['run', '--project', 'engine/Ome.Cli', '-c', 'Release', '--no-build', '--', ...args]);
// The checkout's changed tracked files, or null when it is not a git checkout.
const changedFiles = () => {
	try {
		const listed = execFileSync('git', ['diff', '--name-only', '-z', 'HEAD'], { cwd: ome, encoding: 'utf8' });
		return new Set(listed.split('\0').filter(Boolean));
	} catch {
		return null;
	}
};

// 1. What the exporter reads, and the exporter.
if (!options['no-build']) {
	const changedBefore = changedFiles();
	tool('opcodes_build.py', '--build');
	tool('globals_build.py', '--game', game, '--build');
	// Without the install's check of each point's site, which reads scripts unpacked from its archives: the export
	// itself stops at each point it reads, in the install's own catalog, and fails when the boot ends elsewhere.
	tool('patch_points_build.py', '--game', game, '--build', '--no-install');
	tool('entities_build.py', '--game', game, '--build');
	// Only what the tools changed: a change of the checkout's own stays.
	const rewritten = changedBefore && [...changedFiles()].filter((file) => !changedBefore.has(file));
	if (rewritten?.length > 0) run('git', ['checkout', 'HEAD', '--', ...rewritten.map((file) => `:(top)${file}`)]);
	run('dotnet', ['build', 'engine/Ome.Cli', '-c', 'Release', '-nologo', '-v', 'minimal']);
}

// 2. The language packages, beside the output.
const toml = (value) => JSON.stringify(value);
const packages = [];
for (const { language, import: importOptions = [], package: pkg } of translations) {
	const from = path.resolve(options.translations, language);
	if (!fs.existsSync(path.join(from, 'SYS4INI.BIN'))) throw new Error(`${from} is not a translated install: it has no SYS4INI.BIN`);
	const dir = `${output}.${language}`;
	fs.rmSync(dir, { recursive: true, force: true });
	fs.mkdirSync(dir, { recursive: true });
	fs.writeFileSync(
		path.join(dir, 'manifest.toml'),
		[
			'# Written by ome-site\'s scripts/make-export.mjs from site.config.mjs; omp text import-scripts keeps it.',
			'# The translated text belongs to its translators: this package is never committed or shipped.',
			'',
			'omp = 2',
			`id = ${toml(pkg.id)}`,
			`name = ${toml(pkg.name)}`,
			`version = ${toml(pkg.version ?? '0.1.0')}`,
			`authors = [${(pkg.authors ?? []).map(toml).join(', ')}]`,
			'',
			'[game]',
			`profile = ${toml(game)}`,
			'target = "native"',
			'',
			'[[language]]',
			`tag = ${toml(language)}`,
			`name = ${toml(pkg.languageName ?? new Intl.DisplayNames([language], { type: 'language' }).of(language))}`,
			'',
		].join('\n'),
	);
	cli('omp', 'text', 'import-scripts', '--game', game, '--game-root', install, '--from', from, '--language', language,
		...importOptions, '--package', '--output', dir);
	packages.push(dir);
}

// 3. The export.
fs.rmSync(output, { recursive: true, force: true });
cli('data-export', '--game', game, '--game-root', install, ...packages.flatMap((dir) => ['--language', dir]), '--output', output);
const manifest = JSON.parse(fs.readFileSync(path.join(output, 'manifest.json'), 'utf8'));
console.log(`make-export: ${game} revision ${manifest.revision}, by OME ${manifest.ome_version}, in ${output}`);
