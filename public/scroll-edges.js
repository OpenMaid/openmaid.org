// Tables that scroll sideways show that they do (site plan §10.3, usability finding 13). Every table in a page's
// content scrolls in its own box (Starlight's style), and a list's table in the box around it (`.ome-list-box`, which
// its script tells when the table changes with a scroll event). While a box has more past its end edge it carries
// `data-ome-more-end`, which fades that edge, and while it is scrolled from its start `data-ome-more-start`, which
// shadows the columns a database table keeps in place (src/styles/site.css). The fade is no wider than what is left to
// scroll (`--ome-fade`), so a table that nearly fits does not hide the values it shows (site plan §13, B4).
(() => {
	const mark = (box) => {
		const max = box.scrollWidth - box.clientWidth;
		box.toggleAttribute('data-ome-more-end', max > 1 && box.scrollLeft < max - 1);
		box.style.setProperty('--ome-fade', `${Math.min(48, Math.max(0, max - box.scrollLeft))}px`);
		box.toggleAttribute('data-ome-more-start', box.scrollLeft > 1);
	};
	const resized = new ResizeObserver((entries) => entries.forEach((entry) => mark(entry.target)));
	const watch = () => {
		for (const box of document.querySelectorAll('.sl-markdown-content table, .ome-list-box')) {
			mark(box);
			box.addEventListener('scroll', () => mark(box), { passive: true });
			resized.observe(box);
		}
	};
	if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watch);
	else watch();
})();
