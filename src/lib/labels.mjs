// Labels made from the export's names: `granted_skill_id` reads "Granted skill", `max_hp` "Max HP". The export gives
// names, not words for people; until it gives those (or a language package does), the site makes them here.
const UPPER = new Set(['hp', 'sp', 'fs', 'id', 'ids', 'exp', 'npc']);

/** A field's or an element's name as words: `drop_chance` is "Drop chance". */
export function label(name) {
	const words = name.split(/[_.\s]+/).filter(Boolean);
	if (words.length > 1 && (words.at(-1) === 'id' || words.at(-1) === 'ids')) words.pop();
	return words
		.map((word, i) => (UPPER.has(word) ? word.toUpperCase() : i === 0 ? word[0].toUpperCase() + word.slice(1) : word))
		.join(' ');
}

/** A kind's name, one and many: `item` is "Item" and "Items". */
export function kindLabel(id) {
	const one = label(id);
	const many = /[^aeiou]y$/.test(one) ? `${one.slice(0, -1)}ies` : /(s|x|ch|sh)$/.test(one) ? `${one}es` : `${one}s`;
	return { one, many };
}
