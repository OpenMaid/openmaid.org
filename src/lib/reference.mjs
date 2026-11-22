// The reference model of this build's bundle (src/lib/reference-model.mjs), read once per build.
import ome from 'virtual:ome';
import { openBundle } from './bundle.mjs';
import { referenceModel } from './reference-model.mjs';

let model;

export function reference() {
	model ??= referenceModel(openBundle(ome.bundle));
	return model;
}

/** One game's reference. */
export function referenceGame(id) {
	const game = reference().games.find((g) => g.id === id);
	if (!game) throw new Error(`the reference bundle has no game ${id}`);
	return game;
}
