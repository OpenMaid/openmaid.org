// How a search's words match an entry's name (site plan §9.2): the database's search and a list page's name box alike,
// so a list opened from the search's results holds the same entries. Shared by the build and the browser.
//
// A name and a search are compared folded: as NFKC has them (full-width letters and brackets as ASCII), in lower case,
// katakana as hiragana, so ユエラ and ゆえら match, and without spaces and punctuation, so "ウィルフレドディオン" finds
// "ウィルフレド・ディオン". A name matches when it holds every word of the search, in any order. A comma separates names to
// find any of them: "yuela, emelita" (site plan §13, C5).

// What separates words, and is left out when a name and a search are compared.
const SEPARATORS = /[\s・･·\-‐–—'’"“”.,!?:;()[\]{}「」『』【】〈〉《》／/]+/g;

/** A text folded for comparing: NFKC, lower case, katakana as hiragana. */
export function fold(text) {
	return text
		.normalize('NFKC')
		.toLowerCase()
		.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
}

// What separates the names of a search that finds any of them (NFKC makes a full-width comma ASCII).
const ALTERNATIVES = /[,、]/;
// A name's qualifier, the part in brackets at its end that tells it apart ("Sword (Sword)", "アイアンワーム（砂鉄蟲）").
const QUALIFIER = /\s*\([^()]*\)\s*$/;

/** One name's words, folded, and the whole of it without separators. */
const wordsOf = (folded) => {
	const words = folded.split(SEPARATORS).filter(Boolean);
	return { words, whole: words.join('') };
};

/**
 * A search as `nameScore` takes it: each of the names it looks for (`any`), as its words, folded, and the whole of it
 * without separators; null when empty.
 */
export function searchOf(text) {
	const any = fold(text ?? '')
		.split(ALTERNATIVES)
		.map(wordsOf)
		.filter((name) => name.words.length);
	return any.length ? { any } : null;
}

/**
 * A name as `nameScore` takes it: folded, its words, and the whole of it without separators; and `base`, the whole of
 * it without its qualifier at its end, if it has one.
 */
export function nameOf(text) {
	const folded = fold(text);
	const base = folded.replace(QUALIFIER, '');
	return { ...wordsOf(folded), base: base && base !== folded ? wordsOf(base).whole : null };
}

/**
 * How well a name (`nameOf`) matches a search (`searchOf`), lower being better, by the best of the names it looks for:
 * 0 when it is the search, or is without its qualifier (the item "Sword (Sword)" for "sword"; site plan §13, C4), 1
 * when it starts with it, 2 when one of its words starts with the search's first word, 3 when it holds every word
 * somewhere; null when it does not hold them all.
 */
export function nameScore(search, name) {
	let best = null;
	for (const one of search.any) {
		if (!one.words.every((word) => name.whole.includes(word))) continue;
		const score =
			name.whole === one.whole || name.base === one.whole
				? 0
				: name.whole.startsWith(one.whole)
					? 1
					: name.words.some((word) => word.startsWith(one.words[0]))
						? 2
						: 3;
		if (best === null || score < best) best = score;
	}
	return best;
}

/** Whether any of an entry's names (strings) matches a search's text; an empty search matches every entry. */
export function namesMatch(text, names) {
	const search = searchOf(text);
	return !search || names.some((name) => nameScore(search, nameOf(name)) !== null);
}
