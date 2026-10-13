"use strict";

const fs = require("node:fs");
const path = require("node:path");

const state = {
	enabled: false,
	stream: null,
	file: null,
	dead: false,
};

const enabled = () => state.enabled;

// A single failed write (e.g. a transient `writev` error on Windows) must not
// crash the whole pipeline: reopen the stream once in append mode, then give
// up silently if it fails again.
const openStream = (abs, flags) => {
	const stream = fs.createWriteStream(abs, { flags });
	stream.on("error", () => {
		state.stream = null;
		if (state.dead) return;
		state.dead = true;
		try {
			openStream(abs, "a");
		} catch {
			state.enabled = false;
		}
	});
	state.stream = stream;
};

const enable = (file) => {
	if (!file) return;
	const abs = path.resolve(process.cwd(), file);
	fs.mkdirSync(path.dirname(abs), { recursive: true });
	if (state.stream) state.stream.end();
	state.file = abs;
	state.dead = false;
	openStream(abs, "w");
	state.enabled = true;
};

const disable = () => {
	if (state.stream) state.stream.end();
	state.stream = null;
	state.file = null;
	state.enabled = false;
};

const write = (entry) => {
	if (!state.enabled || !state.stream) return;
	state.stream.write(`${JSON.stringify(entry)}\n`);
};

const stage = (name, data) => {
	write({ ts: Date.now(), stage: name, ...data });
};

const flush = () => {
	if (state.stream) state.stream.end();
};

module.exports = { enable, disable, enabled, stage, write, flush };
