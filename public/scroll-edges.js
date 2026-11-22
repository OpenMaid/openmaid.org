// Tables that scroll sideways show that they do (site plan §10.3, usability finding 13). Every table in a page's
// content scrolls in its own box (Starlight's style). While a table has more past its end edge it carries
// `data-ome-more-end`, which fades that edge, and while it is scrolled from its start `data-ome-more-start`, which
// shadows the columns a database table keeps in place (src/styles/site.css).
(() => {
	const mark = (box) => {
		const max = box.scrollWidth - box.clientWidth;
		box.toggleAttribute('data-ome-more-end', max > 1 && box.scrollLeft < max - 1);
		box.toggleAttribute('data-ome-more-start', box.scrollLeft > 1);
	};
	const resized = new ResizeObserver((entries) => entries.forEach((entry) => mark(entry.target)));
	const watch = () => {
		for (const box of document.querySelectorAll('.sl-markdown-content table')) {
			mark(box);
			box.addEventListener('scroll', () => mark(box), { passive: true });
			resized.observe(box);
		}
	};
	if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watch);
	else watch();
})();
