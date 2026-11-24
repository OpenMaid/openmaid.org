// Screenshots of the site's pages, to look at a change (docs/working-on-the-site.md §5): headless Chrome over its
// debugging protocol, the age notice answered first on the server's own origin, each page saved as a PNG.
//
//   node scripts/shots.mjs <folder> <page> [<page> ...]
//
// A page is a path from the site's root (`kamidori/item/`, `databases/`), with `#y=<pixels>` to scroll down first.
// The PNGs are <folder>/p1.png, p2.png, ... in the pages' order. BASE is the server (default
// http://localhost:4321), WIDTH and HEIGHT the window (default 1280 by 1000; 390 wide is a phone), THEME `light` or
// `dark` (default: the browser's), CHROME the browser (default: Chrome where Windows installs it, else
// google-chrome on the PATH). A preview has no slug redirects: give an entity's full address, slug included.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const [folder, ...pages] = process.argv.slice(2);
if (!folder || pages.length === 0) {
	console.error('usage: node scripts/shots.mjs <folder> <page> [<page> ...]');
	process.exit(2);
}
const out = path.resolve(folder);
fs.mkdirSync(out, { recursive: true });
const base = (process.env.BASE ?? 'http://localhost:4321').replace(/\/$/, '');
const width = Number(process.env.WIDTH ?? 1280);
const height = Number(process.env.HEIGHT ?? 1000);
const theme = process.env.THEME ?? '';
const windowsChrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const chrome = process.env.CHROME ?? (fs.existsSync(windowsChrome) ? windowsChrome : 'google-chrome');
const port = 9333;

// Chrome wants an absolute profile folder: given a relative one, it shows a dialog instead of starting.
const profile = path.join(out, '.chrome-profile');
const proc = spawn(chrome, [
	'--headless=new', '--disable-gpu', '--hide-scrollbars', `--remote-debugging-port=${port}`,
	`--user-data-dir=${profile}`, `--window-size=${width},${height}`, 'about:blank',
], { stdio: 'ignore' });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

try {
	let target;
	for (let i = 0; i < 50 && !target; i++) {
		await sleep(200);
		try {
			const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
			target = list.find((t) => t.type === 'page');
		} catch {}
	}
	if (!target) throw new Error(`${chrome} did not open its debugging port ${port}`);
	const ws = new WebSocket(target.webSocketDebuggerUrl);
	await new Promise((resolve) => ws.addEventListener('open', resolve, { once: true }));
	let id = 0;
	const waiting = new Map();
	ws.addEventListener('message', (event) => {
		const message = JSON.parse(event.data);
		if (message.id && waiting.has(message.id)) waiting.get(message.id)(message);
	});
	const send = (method, params = {}) =>
		new Promise((resolve) => {
			const n = ++id;
			waiting.set(n, resolve);
			ws.send(JSON.stringify({ id: n, method, params }));
		});
	await send('Page.enable');
	await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 600 });
	// The age notice and the theme are kept per origin, so they are set on the server's own.
	await send('Page.navigate', { url: `${base}/` });
	await sleep(1500);
	await send('Runtime.evaluate', {
		expression: `localStorage.setItem('ome-age-confirmed', '1'); localStorage.setItem('starlight-theme', ${JSON.stringify(theme)})`,
	});
	for (const [i, page] of pages.entries()) {
		const [address, scroll = '0'] = page.split('#y=');
		await send('Page.navigate', { url: `${base}/${address.replace(/^\//, '')}` });
		await sleep(2500);
		await send('Runtime.evaluate', { expression: `window.scrollTo(0, ${Number(scroll)})` });
		await sleep(400);
		const shot = await send('Page.captureScreenshot', { format: 'png' });
		const file = path.join(out, `p${i + 1}.png`);
		fs.writeFileSync(file, Buffer.from(shot.result.data, 'base64'));
		console.log(file, address);
	}
	ws.close();
} finally {
	proc.kill();
}
