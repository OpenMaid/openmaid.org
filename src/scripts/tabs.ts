// Tabs over panels (site plan §9): `Tabs.astro` draws them for an entity's "Related" tables, and the search's results
// page builds them in the browser (§9.2, src/scripts/search.ts). A box holds a tablist of tabs, each naming its panel
// (`aria-controls`). A tab is chosen by a click, by the arrow keys, Home and End, or by the address's hash naming its
// panel (on load, or a link within the page), which a choice writes, so a link opens on it.

type Options = {
	/** The tab chosen when the hash names none. */
	initial?: number;
	/** Called with a tab's index whenever it is chosen, the first time included. */
	onChoose?: (index: number) => void;
};

export function tabs(box: HTMLElement, { initial = 0, onChoose }: Options = {}) {
	const list = box.querySelector<HTMLElement>('[role="tablist"]')!;
	const tabs = [...list.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
	const panels = tabs.map((tab) => document.getElementById(tab.getAttribute('aria-controls')!)!);
	panels.forEach((panel, i) => {
		panel.setAttribute('role', 'tabpanel');
		panel.setAttribute('aria-labelledby', tabs[i].id);
		panel.tabIndex = 0;
	});
	const choose = (chosen: number, { focus = false, remember = false } = {}) => {
		tabs.forEach((tab, i) => {
			tab.setAttribute('aria-selected', String(i === chosen));
			tab.tabIndex = i === chosen ? 0 : -1;
			panels[i].hidden = i !== chosen;
		});
		if (focus) tabs[chosen].focus();
		if (remember) history.replaceState(history.state, '', `${location.pathname}${location.search}#${panels[chosen].id}`);
		onChoose?.(chosen);
	};
	const named = () => panels.findIndex((panel) => `#${panel.id}` === decodeURIComponent(location.hash));
	choose(named() >= 0 ? named() : initial);
	// A link within the page to a panel chooses its tab too.
	addEventListener('hashchange', () => {
		if (named() >= 0) choose(named());
	});
	list.hidden = false;
	box.setAttribute('data-ome-tabbed', '');
	tabs.forEach((tab, i) => {
		tab.addEventListener('click', () => choose(i, { remember: true }));
		tab.addEventListener('keydown', (event) => {
			const to = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[event.key];
			if (to === undefined) return;
			event.preventDefault();
			choose((to + tabs.length) % tabs.length, { focus: true, remember: true });
		});
	});
}
