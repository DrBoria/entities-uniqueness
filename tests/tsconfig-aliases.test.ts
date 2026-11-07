import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { parseAndExtract, setTsConfig } = require("../normalizer");

// Entity property types come from the TYPE CHECKER (`getType()`), and a checker
// can only answer for files that are in the program. A project holding one file
// reads every imported value as `any`, and an unknown type degrades to
// `"object"` — so two entities whose members differ only by their imported types
// look identical, and the duplicate verdict is decided on a fact the tool got
// wrong. `tsconfig.json` here declares `paths`, which the program must know too.
let root: string;

beforeAll(() => {
	root = fs.mkdtempSync(path.join(os.tmpdir(), "eu-aliases-"));
	fs.mkdirSync(path.join(root, "src"), { recursive: true });
	fs.writeFileSync(
		path.join(root, "tsconfig.json"),
		JSON.stringify({ compilerOptions: { baseUrl: ".", paths: { "@app/*": ["src/*"] } } }, null, 2),
		"utf8",
	);
	fs.writeFileSync(
		path.join(root, "src", "types.ts"),
		"export interface Credentials {\n\tuser: string;\n\tpassword: string;\n}\n\nexport const credentials: Credentials = { user: \"x\", password: \"y\" };\n",
		"utf8",
	);
	fs.writeFileSync(
		path.join(root, "src", "alias.ts"),
		'import { credentials } from "@app/types";\n\nexport const card = { payload: credentials };\n',
		"utf8",
	);
	fs.writeFileSync(
		path.join(root, "src", "relative.ts"),
		'import { credentials } from "./types";\n\nexport const cardCopy = { payload: credentials };\n',
		"utf8",
	);
});

afterAll(() => {
	fs.rmSync(root, { recursive: true, force: true });
});

const memberType = (rel: string, entityName: string, memberName: string) => {
	const { entities } = parseAndExtract(path.join(root, rel));
	const entity = entities.find((e: { name: string }) => e.name === entityName);
	const member = entity?.properties.find((p: { name: string }) => p.name === memberName);
	return member?.type;
};

describe("tsconfig aliases", () => {
	it("a value imported through an alias keeps its declared type", () => {
		expect(memberType("src/alias.ts", "card", "payload")).toBe("Credentials");
	});

	it("a value imported through a relative path keeps its declared type", () => {
		// The same question, without an alias: it fails when the program holds only
		// the file being parsed, because `./types` is not in it.
		expect(memberType("src/relative.ts", "cardCopy", "payload")).toBe("Credentials");
	});

	it("takes the config path explicitly when the project keeps it elsewhere", () => {
		// Not every project names its config `tsconfig.json`; a walk up finds
		// nothing then, so the path has to be passable.
		const explicit = path.join(root, "tsconfig.app.json");
		fs.copyFileSync(path.join(root, "tsconfig.json"), explicit);
		fs.rmSync(path.join(root, "tsconfig.json"));
		try {
			setTsConfig(explicit);
			expect(memberType("src/alias.ts", "card", "payload")).toBe("Credentials");
		} finally {
			setTsConfig(null);
			fs.copyFileSync(explicit, path.join(root, "tsconfig.json"));
			fs.rmSync(explicit);
		}
	});
});
