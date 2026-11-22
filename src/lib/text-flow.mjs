// Game text as prose (site plan §10.3, usability finding 16). The game breaks a text into lines for the window it draws
// it in, so a paragraph reaches the export as several lines, and the page showed them as the game's window does: a
// column of short lines in a wide page, and Japanese words cut in two, which search could not find. `flow` joins a line
// that runs on into the next, and keeps every break an author chose: before and after a tag line ("[ Key Item ]",
// "【重要：銅の魔鍵】"), before a list item ("■針：…", "+1 to Maximum HP") and an indented paragraph, and around a
// blank line. It also collapses the runs of spaces that lay a line out in the window ("[ Special Skill ]      CP: 6").
// The export keeps the lines as the game has them.
//
// A text is one of two shapes in each language (`textShape`), measured from every entity's lines of it:
// - prose, whose texts end on a full stop (a glossary entry, a biography): a line that does not end a sentence runs on;
// - lines, whose texts do not (a unit's bestiary lines, a quest's clear conditions): each line is a statement of its
//   own, and only a sure sign joins two: the next line starting in lower case or with a closing bracket ("」の調査"), a
//   line ending on a comma or on a word that cannot end one ("the", "of"), or a line filled to the window's width,
//   where the game cut a word in two.

const WIDE = /[\u1100-\u115f\u2e80-\u303e\u3041-\u33ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\ufe30-\ufe4f\uff00-\uff60\uffe0-\uffe6]/u;
// Languages written without spaces between words: their lines join with nothing between them.
const UNSPACED = /^(ja|zh)\b/;
const TAG = /^[[【]/u;
const LIST = /^(?:[■□●○◆◇★☆・※→♪◎①-⑳]|[+\-−－＋]\s?[\d０-９])/u;
// What ends a sentence, a quotation or a title line ("『ディジェネール丘陵地』").
const END = /[.!?。！？」』）)…"'”’]$/u;
// What may not start a Japanese line: such a character starts one only where the game wrapped. (An ellipsis may: an
// author starts a line with one.)
const CLOSING = /^[」』）】〕、。，．！？ーぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮヵヶ]/u;
const LINKING =
	/(?:^|\s)(?:the|a|an|of|in|into|to|and|or|nor|but|from|with|for|at|on|by|as|its|their|his|her|your|my|our|is|are|was|were|be|that|which|who|whose|than|if|when|while|this|these|those|some|all|each|every|no|not|very|more|most|can|will|may|has|have|had)$/i;
const IDEOGRAPHIC_SPACE = '\u3000';

/** A line's width in the game window's columns: a full-width character takes two. */
export function textWidth(line) {
	let width = 0;
	for (const c of line) width += WIDE.test(c) ? 2 : 1;
	return width;
}

/** A line with its layout spaces collapsed: a run of spaces becomes its first, and the ends lose their plain spaces. */
function tidy(line) {
	return line.replace(/([ \u3000])[ \u3000]+/g, '$1').replace(/^ +| +$/g, '');
}

/**
 * The shape of one text in one language, from the lines of it every entity has (`lineLists`): the window's width, and
 * whether the text is prose (most of its texts end on a full stop, apart from a tag line). The game's own text fills
 * its wrapped lines to the window, so nearly all its long lines reach the width: a high percentile. A translation is
 * wrapped by hand, and some of its lines are not wrapped at all, so a lower one, and never under the game's own width
 * (`least`), since the window is the same.
 */
export function textShape(lineLists, tag, least = 0) {
	const widths = lineLists.flatMap((lines) => lines.map((line) => textWidth(tidy(line)))).sort((a, b) => a - b);
	const at = UNSPACED.test(tag) ? 0.97 : 0.9;
	const width = Math.max(least, widths.length ? widths[Math.min(widths.length - 1, Math.floor(widths.length * at))] : 0);
	const bodies = lineLists.map((lines) => lines.map(tidy).filter((line) => line && !TAG.test(line))).filter((body) => body.length);
	const ended = bodies.filter((body) => END.test(body.at(-1))).length;
	return { width, prose: bodies.length > 0 && ended / bodies.length >= 0.5 };
}

/** Whether `line` runs on into `next`, so that they are one paragraph, in a text of `shape`. */
function runsOn(line, next, unspaced, shape) {
	if (!line || !next || TAG.test(line) || TAG.test(next) || LIST.test(next)) return false;
	const prose = shape.prose && !LIST.test(line);
	if (unspaced) {
		if (next.startsWith(IDEOGRAPHIC_SPACE)) return false;
		if (CLOSING.test(next) || /[、，]$/u.test(line)) return true;
		if (prose && !END.test(line)) return true;
		// The game wraps at the window's width exactly, so a wrapped line had no room for the next character.
		return textWidth(line) + textWidth([...next][0]) > shape.width;
	}
	if (/[:：]$/u.test(line)) return false;
	if (/^[a-z]/.test(next) && !/^x\d/.test(next)) return true;
	if (/,$/.test(line) || LINKING.test(line)) return true;
	if (!prose) return false;
	if (!END.test(line)) return true;
	// A full line, though it ends a sentence: the next word would not have fitted on it.
	const used = textWidth(line);
	return used >= shape.width - 3 && used + 1 + textWidth(next.split(' ')[0]) > shape.width;
}

/** A text's lines (`lines`, in language `tag`, of `shape`) with each line that runs on joined to the next (see above). */
export function flow(lines, tag, shape) {
	const unspaced = UNSPACED.test(tag);
	const out = [];
	let previous = null;
	for (const raw of lines) {
		const line = tidy(raw);
		if (previous !== null && runsOn(previous, line, unspaced, shape)) out[out.length - 1] += unspaced ? line : ` ${line}`;
		else out.push(line);
		previous = line;
	}
	return out;
}
