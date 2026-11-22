// How one value reads (site design §8.2): its name, or its number as the registry says it reads. Shared by the build's
// pages (values.mjs, columns.mjs) and the lists' script in the browser (src/pages/[game]/[kind]/index.astro), so a list
// draws a value as an entity's page does. A field here is what the export reader makes of one (export.mjs `fieldOf`):
// its `name`, `refKind`, `format` and `names` (a Map from a value to its names by language, '' being OME's word).
import { SOURCE_LANGUAGE } from './language.mjs';

/** Whether a field's value is the one its registry says means none (OME's `none`: a quest's deadline of 0). */
const meansNone = (field, v) => field.format?.none != null && v === field.format.none;

/**
 * Whether a value is none: 0, the value the registry says means none, and for a reference a negative value too (the
 * games write -1 for none as well).
 */
export const isNone = (field, v) => v === 0 || meansNone(field, v) || (Boolean(field.refKind) && v < 0);

/**
 * A value's name (OME's export plan §5): the game's own, in each language the export has it in, which `Name` draws
 * (`{ title, names }`), else OME's word (`{ text }`); null when the value has neither.
 */
export function nameOf(field, v) {
	const names = field.names?.get(v);
	if (!names) return null;
	const game = Object.entries(names).filter(([tag]) => tag !== '');
	if (game.length) return { title: names[SOURCE_LANGUAGE] ?? game[0][1], names: Object.fromEntries(game) };
	return names[''] ? { text: names[''] } : null;
}

/**
 * Whether a field's values are changes, which show their sign ("+5", "-1"): a field named for what it changes by (its
 * deltas, its modifiers, its bonus), so every page shows one alike (site plan §10.3, finding 14).
 */
export const isChange = (field) => /(^|_)(deltas?|modifiers|bonus)$/.test(field.name.slice(field.name.indexOf('.') + 1));

/** A number as it reads, without its unit: times its scale, plus its offset. A list's filters compare these. */
export function shownNumber(field, v) {
	const format = field.format;
	return format ? Number((v * (format.scale ?? 1) + (format.offset ?? 0)).toFixed(6)) : v;
}

/**
 * Whether a list's cell of a value is empty (src/lib/columns.mjs, of a column `type`): no value, a reference to none,
 * the value the registry says means none (a quest with no deadline; site plan §13, C3), and a 0 that says nothing: a
 * mask's, a change's, and a named field's where the game does not name 0.
 */
export function emptyValue(field, type, v) {
	if (v === null || v === undefined) return true;
	if (field.refKind) return isNone(field, v);
	if (meansNone(field, v)) return true;
	return v === 0 && (type === 'mask' || isChange(field) || (type === 'name' && !field.names?.has(0)));
}

// A number with its thousands grouped ("40,000"), as the site's English reads them (the user, 2026-11-22).
const grouped = new Intl.NumberFormat('en', { maximumFractionDigits: 6 });

/**
 * A number as the registry says it reads: times its scale, plus its offset, its thousands grouped, in its unit
 * ("40,000", "25%", "3 days", "1 turn").
 */
export function formatNumber(field, v, signed = isChange(field)) {
	const format = field.format;
	const shown = shownNumber(field, v);
	const sign = signed && shown > 0 ? '+' : '';
	const text = `${sign}${grouped.format(shown)}`;
	const unit = format?.unit;
	if (!unit) return text;
	if (unit === '%') return `${text}%`;
	return `${text} ${Math.abs(shown) === 1 && unit.endsWith('s') ? unit.slice(0, -1) : unit}`;
}

/**
 * The items a value that is not a reference shows as: its name, or for a mask the name of each value whose bit it has
 * set, or the number as it reads. A mask's bit for a value with no name is left out when it sets a named one: the
 * named values are those its global takes (a difficulty is 1 or 2, so bit 0 of the enemy difficulty mask never counts).
 */
export function valueItems(field, v, signed = isChange(field)) {
	if (v === null || v === undefined) return [{ text: '—' }];
	if (field.format?.bits) {
		const set = [];
		for (let k = 0; k < 31; k++) if (v & (1 << k)) set.push(k);
		const named = set.map((k) => nameOf(field, k)).filter(Boolean);
		return named.length ? named : set.length ? set.map((k) => ({ text: String(k) })) : [{ text: '—' }];
	}
	return [nameOf(field, v) ?? { text: formatNumber(field, v, signed) }];
}

/** A value as plain text, in the game's language where the game names it: a list page's column, a filter's option. */
export function valueText(field, v, signed = isChange(field)) {
	return valueItems(field, v, signed)
		.map((item) => item.text ?? item.title)
		.join(', ');
}
