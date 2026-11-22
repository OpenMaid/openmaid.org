// How a search's words match an entry's name (site plan §9.2): the database's search and a list page's name box alike,
// so a list opened from the search's results holds the same entries. Shared by the build and the browser.
//
// A name and a search are compared folded: as NFKC has them (full-width letters and brackets as ASCII), in lower case,
// katakana as hiragana, so ユエラ and ゆえら match, and without spaces and punctuation, so "ウィルフレドディオン" finds
// "ウィルフレド・ディオン". A name matches when it holds every word of the search, in any order.

// What separates words, and is left out when a name and a search are compared.
const SEPARATORS = /[\s・･·\-‐–—'’"“”.,!?:;()[\]{}「」『』【】〈〉《》／/]+/g;

/** A text folded for comparing: NFKC, lower case, katakana as hiragana. */
export function fold(text) {
	return text
		.normalize('NFKC')
		.toLowerCase()
		.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
}

/** A search as `nameScore` takes it: its words, folded, and the whole of it without separators; null when empty. */
export function searchOf(text) {
	const folded = fold(text ?? '');
	const words = folded.split(SEPARATORS).filter(Boolean);
	return words.length ? { words, whole: words.join('') } : null;
}

/** A name as `nameScore` takes it: folded, its words, and the whole of it without separators. */
export function nameOf(text) {
	const folded = fold(text);
	const words = folded.split(SEPARATORS).filter(Boolean);
	return { words, whole: words.join('') };
}

/**
 * How well a name (`nameOf`) matches a search (`searchOf`), lower being better: 0 when it is the search, 1 when it
 * starts with it, 2 when one of its words starts with the search's first word, 3 when it holds every word somewhere;
 * null when it does not hold them all.
 */
export function nameScore(search, name) {
	if (!search.words.every((word) => name.whole.includes(word))) return null;
	if (name.whole === search.whole) return 0;
	if (name.whole.startsWith(search.whole)) return 1;
	if (name.words.some((word) => word.startsWith(search.words[0]))) return 2;
	return 3;
}

/** Whether any of an entry's names (strings) matches a search's text; an empty search matches every entry. */
export function namesMatch(text, names) {
	const search = searchOf(text);
	return !search || names.some((name) => nameScore(search, nameOf(name)) !== null);
}
