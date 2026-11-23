// A check of the site's image as it serves (site plan §15), run by the deploy workflow before it pushes the image, and
// by hand against any copy of it:
//
//   node scripts/smoke-test.mjs http://localhost:8080
//
// It waits until the server takes connections (the container starting), then makes each request once: the home page,
// the reference, a 404, and for each game the build lists its front page, a kind's first entity, the redirects to
// that entity's page (no slug, a wrong slug, no slash; deploy/nginx.conf), its picture, and the cache headers.
import config from '../site.config.mjs';
import { listedGames } from '../src/lib/listed-games.mjs';

const base = new URL(process.argv[2] ?? 'http://localhost:8080');
const failures = [];
let checks = 0;

const get = (path) => fetch(new URL(path, base), { redirect: 'manual' });
const encodePath = (path) => path.split('/').map(encodeURIComponent).join('/');
const pathOf = (location) => decodeURIComponent(new URL(location, base).pathname);

function check(what, ok, detail = '') {
	checks++;
	if (!ok) failures.push(`${what}${detail ? `: ${detail}` : ''}`);
}

async function expectStatus(path, status, what) {
	const response = await get(path);
	check(what, response.status === status, `${path} answered ${response.status}, not ${status}`);
	return response;
}

async function expectRedirect(path, target, what) {
	const response = await get(path);
	const location = response.headers.get('location');
	check(what, response.status === 301 && location !== null && pathOf(location) === target, `${path} answered ${response.status} to ${location}, not 301 to ${target}`);
}

async function ready(timeoutMs = 30_000) {
	const end = Date.now() + timeoutMs;
	for (;;) {
		try {
			await get('/');
			return;
		} catch (error) {
			if (Date.now() > end) throw new Error(`${base} took no connection in ${timeoutMs / 1000} s: ${error.cause?.code ?? error.message}`);
			await new Promise((resolve) => setTimeout(resolve, 500));
		}
	}
}

await ready();

const home = await expectStatus('/', 200, 'the home page');
check('the home page is HTML', home.headers.get('content-type')?.startsWith('text/html'), home.headers.get('content-type'));
check('a page is checked each time', home.headers.get('cache-control') === 'no-cache', home.headers.get('cache-control'));
check('the headers say nosniff', home.headers.get('x-content-type-options') === 'nosniff');
const asset = (await home.text()).match(/\/_astro\/[^"']+\.(?:css|js)/)?.[0];
check('the home page links an Astro asset', Boolean(asset));
if (asset) {
	const response = await expectStatus(asset, 200, 'an Astro asset');
	check('an Astro asset is kept a year', response.headers.get('cache-control')?.includes('immutable'), response.headers.get('cache-control'));
}
await expectStatus('/docs/', 200, 'the reference');
await expectStatus('/pagefind/pagefind-entry.json', 200, 'the search index');
const missing = await expectStatus('/no-such-page/', 404, 'a page that does not exist');
check('a missing page shows the 404 page', (await missing.text()).includes('Page not found'));

for (const game of listedGames(config)) {
	const front = await expectStatus(`/${game}/`, 200, `${game}'s front page`);
	// The first kind it links, past the database's search, whose id OME reserves (no kind is named search).
	const kind = (await front.text()).match(new RegExp(`href="/${game}/(?!search/)([a-z0-9_-]+)/"`))?.[1];
	check(`${game}'s front page links a kind`, Boolean(kind));
	if (!kind) continue;
	await expectRedirect(`/${game}/${kind}`, `/${game}/${kind}/`, `${game}'s ${kind} list without its slash`);
	const tooltips = await expectStatus(`/${game}/tooltips/${kind}.json`, 200, `${game}'s ${kind} tooltips`);
	if (tooltips.status !== 200) continue;
	const [id, entity] = Object.entries((await tooltips.json()).entities)[0];
	const page = encodePath(entity.u);
	const shown = await expectStatus(page, 200, `${game} ${kind} ${id}'s page`);
	check(`${game} ${kind} ${id}'s page is compressed`, shown.headers.get('content-encoding') === 'gzip', shown.headers.get('content-encoding') ?? 'none');
	await expectRedirect(`/${game}/${kind}/${id}/`, entity.u, `${game} ${kind} ${id} without its slug`);
	await expectRedirect(`/${game}/${kind}/${id}`, `/${game}/${kind}/${id}/`, `${game} ${kind} ${id} without its slug or slash`);
	await expectRedirect(`/${game}/${kind}/${id}/wrong-slug/`, entity.u, `${game} ${kind} ${id} with a wrong slug`);
	await expectRedirect(page.slice(0, -1), entity.u, `${game} ${kind} ${id}'s page without its slash`);
	await expectStatus(`/${game}/${kind}/999999999/`, 404, `${game} ${kind} with no such id`);
	if (entity.p) {
		const picture = await expectStatus(encodePath(entity.p), 200, `${game} ${kind} ${id}'s picture`);
		check(`${game}'s pictures are kept a day`, picture.headers.get('cache-control') === 'public, max-age=86400', picture.headers.get('cache-control'));
	}
}

console.log(`smoke-test: ${checks - failures.length} of ${checks} checks passed against ${base}`);
for (const failure of failures) console.log(`  FAIL ${failure}`);
process.exitCode = failures.length ? 1 : 0;
