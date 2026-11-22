// Tooltips for links to the database's entities (site design §8.5). Hovering or focusing a link to
// /<game>/<kind>/<id>/... on this site shows the entity's name, picture and a line of its text, from the kind's
// tooltip file, loaded once on the first hover over that kind. Where the file translates them (§8.6), the name and the
// line are in the language <html>'s data-ome-lang chooses, the first translation unless it is the game's own, and the
// name in the other language follows. Escape closes the tooltip. Its border and its background, a shade lighter than a
// dark page's, set it apart from the page in either theme (site plan §13, C8).
//
// It depends on nothing else, so another site can load it with a <script src> from this one and get the same tooltips
// on its links here. There it shows names and pictures only: the embedding site decides its own notice (§8.10).
(() => {
	const script = document.currentScript;
	const origin = new URL(script ? script.src : '/', location.href).origin;
	const foreign = origin !== location.origin;
	const files = new Map();
	let box;
	let current = null;

	const target = (link) => {
		const url = new URL(link.href, location.href);
		if (url.origin !== origin) return null;
		const match = url.pathname.match(/^\/([a-z0-9_-]+)\/([a-z0-9_-]+)\/(\d+)\//);
		return match && { game: match[1], kind: match[2], id: match[3] };
	};

	const load = (game, kind) => {
		const key = `${game}/${kind}`;
		if (!files.has(key))
			files.set(key, fetch(`${origin}/${game}/tooltips/${kind}.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null));
		return files.get(key);
	};

	const show = (link, file, entity) => {
		if (!box) {
			box = document.createElement('div');
			box.setAttribute('role', 'tooltip');
			Object.assign(box.style, {
				position: 'absolute', zIndex: 2000, maxWidth: '22rem', padding: '0.6rem 0.75rem', borderRadius: '0.4rem',
				background: '#24262c', color: '#f1f2f6', font: '14px/1.4 system-ui, sans-serif',
				border: '1px solid rgb(255 255 255 / 0.16)',
				boxShadow: '0 4px 16px rgb(0 0 0 / 0.35)', pointerEvents: 'none', display: 'flex', gap: '0.6rem',
			});
			document.body.append(box);
		}
		box.replaceChildren();
		if (entity.p) {
			const img = document.createElement('img');
			img.src = origin + entity.p;
			img.alt = '';
			Object.assign(img.style, { width: '48px', height: '48px', objectFit: 'contain', flex: 'none' });
			box.append(img);
		}
		const words = document.createElement('div');
		const chosen = document.documentElement.getAttribute('data-ome-lang');
		const translations = entity.tr ?? {};
		const tag = chosen === 'ja' ? null : chosen && translations[chosen] ? chosen : Object.keys(translations)[0] ?? null;
		const shown = tag ? translations[tag] : null;
		const name = document.createElement('strong');
		name.textContent = shown?.n ?? entity.n;
		if (shown?.n) name.lang = tag;
		const what = document.createElement('div');
		what.textContent = `${file.kind} · ${file.game}`;
		Object.assign(what.style, { fontSize: '12px', opacity: 0.7 });
		words.append(name);
		const other = shown?.n ? entity.n : tag === null && chosen === 'ja' ? Object.values(translations)[0]?.n : null;
		if (other) {
			const also = document.createElement('div');
			also.textContent = other;
			also.lang = shown?.n ? 'ja' : Object.keys(translations)[0];
			Object.assign(also.style, { fontSize: '12px' });
			words.append(also);
		}
		words.append(what);
		const line = shown?.t ?? entity.t;
		if (line && !foreign) {
			const text = document.createElement('div');
			text.textContent = line;
			text.lang = shown?.t ? tag : 'ja';
			text.style.marginTop = '0.3rem';
			words.append(text);
		}
		box.append(words);
		box.style.display = 'flex';
		const rect = link.getBoundingClientRect();
		const width = box.offsetWidth;
		const left = Math.max(8, Math.min(rect.left + scrollX, scrollX + document.documentElement.clientWidth - width - 8));
		box.style.left = `${left}px`;
		box.style.top = `${rect.bottom + scrollY + 6}px`;
	};

	const enter = (event) => {
		const link = event.target.closest?.('a[href]');
		if (!link || link === current) return;
		const key = target(link);
		if (!key) return;
		current = link;
		load(key.game, key.kind).then((file) => {
			const entity = file?.entities?.[key.id];
			if (current === link && entity) show(link, file, entity);
		});
	};
	const leave = (event) => {
		if (!current || (event.relatedTarget && current.contains(event.relatedTarget))) return;
		if (event.target.closest?.('a[href]') !== current) return;
		current = null;
		if (box) box.style.display = 'none';	// not `hidden`: the box's inline display would win over it
	};
	document.addEventListener('mouseover', enter);
	document.addEventListener('focusin', enter);
	document.addEventListener('mouseout', leave);
	document.addEventListener('focusout', leave);
	// Escape closes the tooltip; it opens again once the pointer or the focus has left the link and come back.
	document.addEventListener('keydown', (event) => {
		if (event.key === 'Escape' && box && box.style.display !== 'none') box.style.display = 'none';
	});
})();
