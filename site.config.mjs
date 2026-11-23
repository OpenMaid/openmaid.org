// What a build of the site reads (site design §10.1, §11).
//
// Everything of OME comes from its reference bundle, OME-reference-<version>.zip (src/lib/bundle.mjs, site plan §6.1):
// OME_BUNDLE (a zip, or a folder holding one); else OME_CHECKOUT, an OME checkout whose tools/reference_bundle.py the
// build runs into bundle/checkout/ (Python from OME_PYTHON); else a zip in bundle/; else the checkout below.
export default {
	// The project's name, which every page's title ends with, and the site's address (the user, 2026-11-22; site plan
	// §11): the project is Open Maid, and Open Maid Engine (OME) is its engine.
	title: 'Open Maid',
	site: 'https://openmaid.org',
	ome: {
		// The OME checkout a bundle is built from when no other source is given, relative to this file.
		checkout: '../age-reimpl',
		// OME's repository. A guide's link to an OME file outside the guides goes to that file here, at the bundle's
		// commit; the home page links its releases.
		repository: 'https://github.com/concopuffs/OpenMaidEngine',
	},
	// The games whose database the build makes (site design §8, §10.1), each from one export: the folder OME's
	// `data-export` writes, copied to data/<game>/. The OME_SITE_GAMES environment variable overrides which are built,
	// as a comma-separated list; empty builds the site without a database.
	games: {
		kamidori: {
			revision: '0294c8eafacf',
			// The picture a kind's lists and tooltips show, by the export's picture names, first found first. An explicit
			// picture is never shown there (site design §8.11).
			// A kind titled by a reference (a recipe, by the item it makes) shows its target's when it has none.
			thumbnails: {
				item: ['icon'],
				skill: ['icon'],
				unit: ['battle_face', 'face', 'sprite'],
				quest: ['journal_icon'],
				condition: ['icon'],
				world_area: ['picture'],
			},
			// The entry whose picture a kind's card on the game's front page shows, by id (site plan §10.3, finding 18),
			// where the first entry with a picture says less of the kind; a kind with no picture shows its initial.
			cards: { item: 250, condition: 9 },
			// The columns a kind's list shows before a visitor chooses others, and a "Related" table of its entries beside
			// each name (site plan §9.1), by the list's keys: a field's name, and an array's element by the field's name and
			// OME's word for the element (`stats.max_hp`). A kind not named shows the fields OME's declarations filter on.
			columns: {
				item: ['category', 'rank', 'attack_element', 'price.buy'],
				unit: [
					'race',
					'sex',
					'starting_level',
					'stats.max_hp',
					'stats.physical_attack',
					'stats.physical_defense',
					'stats.magic_attack',
					'stats.magic_defense',
					'stats.agility',
				],
				skill: ['category', 'equip_cost', 'attack_element_encoded'],
				quest: ['difficulty_stars', 'deadline_days', 'reward_money', 'reward_item_ids'],
				recipe: ['unlock_craftsman_rank', 'unlock_synthesis_rank', 'ingredient_item_ids'],
				stage: ['labyrinth_id', 'floor_number', 'recommended_level', 'boss_flag'],
				world_area: ['area_type', 'travel_days'],
			},
		},
		arterial: {
			revision: '433790e6b0cc',
			thumbnails: {
				card: ['art'],
				item: ['icon'],
				ultimate: ['art'],
				character: ['portrait'],
				character_profile: ['portrait'],
				glossary_entry: ['picture'],
				tip: ['picture'],
			},
			columns: {
				card: ['rarity', 'race_flags', 'cost', 'control', 'attack', 'hp', 'price.buy'],
				item: ['kind', 'rarity', 'price.buy'],
				condition: ['kind', 'attack_change', 'hp_change', 'turn_hp_change'],
				skill: ['kind', 'amount'],
				recipe: ['ingredient_item', 'points', 'least_rank'],
				shop_entry: ['least_chapter', 'least_rank', 'party_character'],
				battle: ['rule', 'opponent_ultimate', 'opponent_ultimate_level'],
				battle_rule: ['turn_limit', 'hand_size', 'deck_size'],
				opponent: ['arena', 'battle', 'reward_item', 'reward_card_row'],
				goal: ['kind', 'reward_item', 'reward_card_row', 'reward_money'],
				area: ['place', 'battle_rule'],
			},
		},
		// As large as OME's understood tables (the user, 2026-11-22), and growing with them.
		himegari: {
			revision: 'd8fe6068a5a5',
			// An icon numbered from 501 is the append's sheet's (OME's declarations), so each kind lists both.
			thumbnails: {
				unit: ['icon', 'icon_append', 'face', 'sprite'],
				item: ['icon', 'icon_append'],
				skill: ['icon'],
				condition: ['icon'],
				magic_action: ['icon'],
				character_profile: ['portrait'],
			},
			columns: {
				unit: [
					'species_category',
					'sex_category',
					'starting_level',
					'stats.max_hp',
					'stats.physical_attack',
					'stats.physical_defense',
					'stats.magic_attack',
					'stats.magic_defense',
					'stats.speed',
				],
				item: ['category', 'attack_element', 'defense_element'],
				skill: ['category', 'attack_element', 'max_range_encoded'],
				stage: ['number_major', 'number_minor', 'clear_base_spendable_point_reward', 'extra_dungeon_flag'],
				recipe: ['minimum_level', 'point_cost', 'ingredient_item_ids'],
				condition: ['resisted_as', 'can_affect_bosses', 'cleared_by_recover'],
				terrain: ['layout_class', 'required_skill_id'],
				map_object: ['use_limit', 'required_skill_id', 'immunity_skill_id'],
				card: ['type_id', 'awarded_item_id', 'clear_point_bonus', 'condition_id'],
				training_action: ['spirit_delta', 'awarded_skill_id', 'awarded_item_id', 'minimum_progress'],
				magic_action: ['menu_kind', 'cost', 'required_magic_facility_level'],
				character_profile: ['unit_id'],
			},
		},
	},
};
