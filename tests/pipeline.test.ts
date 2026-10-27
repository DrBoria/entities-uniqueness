import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const main = require("../main.js");

const pluginDir = path.resolve(__dirname, "..");
const ENTITIES_ROOT = "tests/entities";

const buildConfig = (overrides = {}) => {
	const root = pluginDir;
	const args = {
		roots: [ENTITIES_ROOT],
		thresholds: null,
		weights: null,
		verbose: false,
		out: null,
		requireExported: false,
		include: null,
		...overrides,
	};

	return main.buildConfig(root, null, args);
};

const pairNames = (m) => [m.a.name, m.b.name].sort().join("|");

describe("entities pipeline", () => {
	it("extracts entities from all kinds (classes, interfaces, zod schemas)", () => {
		const config = buildConfig();
		const result = main.run(config);

		const names = new Set(result.entities.map((e) => e.name));
		expect(names).toContain("UserService");
		expect(names).toContain("UserAccountService");
		expect(names).toContain("PatientProfile");
		expect(names).toContain("PaymentGateway");
		expect(names).toContain("userSchema");
		expect(names).toContain("accountSchema");

		const zod = result.entities.find((e) => e.name === "userSchema");
		expect(zod.kind).toBe("zod");
		expect(zod.framework).toBe("zod");
		const propNames = zod.properties.map((p) => p.name);
		expect(propNames).toEqual(["id", "name", "email", "age", "roles"]);
	});

	it("flags true duplicate classes as the duplicate tier", () => {
		const config = buildConfig();
		const result = main.run(config);

		const dup = result.matches.find((m) => pairNames(m) === "UserAccountService|UserService");
		expect(dup).toBeTruthy();
		expect(dup.tier).toBe("duplicate");
		expect(dup.decision.confidence).toBeGreaterThanOrEqual(0.85);
		// reason must expose every signal
		expect(dup.decision.reason).toMatch(/properties/);
		expect(dup.decision.reason).toMatch(/methods/);
		expect(dup.decision.reason).toMatch(/signature/);
		expect(dup.decision.reason).toMatch(/name/);
		expect(dup.decision.reason).toMatch(/inheritance/);
	});

	it("flags near-identical zod schemas as duplicates", () => {
		const config = buildConfig();
		const result = main.run(config);

		const dup = result.matches.find((m) => pairNames(m) === "accountSchema|userSchema");
		expect(dup).toBeTruthy();
		expect(dup.tier).toBe("duplicate");
	});

	it("clusters the three report services and suggests a shared base", () => {
		const config = buildConfig();
		const result = main.run(config);

		const cluster = result.clusters.find((c) =>
			c.members.some((m) => m.name === "ReportService") && c.members.some((m) => m.name === "InvoiceReportService"),
		);
		expect(cluster).toBeTruthy();
		expect(cluster.members.length).toBeGreaterThanOrEqual(3);

		const sharedBase = result.suggestions.find((s) => s.type === "shared-base");
		expect(sharedBase).toBeTruthy();
		expect(sharedBase.entities.length).toBeGreaterThanOrEqual(3);
	});

	it("suggests a shared type for property-only profile overlap", () => {
		const config = buildConfig();
		const result = main.run(config);

		const sharedType = result.suggestions.find(
			(s) => s.type === "shared-type" && s.entities.includes("PatientProfile") && s.entities.includes("ClientProfile"),
		);
		expect(sharedType).toBeTruthy();
	});

	it("does not report unrelated entities as duplicates", () => {
		const config = buildConfig();
		const result = main.run(config);

		const unrelated = result.matches.find((m) => pairNames(m) === "PaymentGateway|PatientProfile");
		expect(unrelated).toBeFalsy();
	});

	it("does not inflate unrelated data-only entities via empty-set neutral signals", () => {
		// Two data-only types that share no properties, no methods, and no heritage.
		// The methods/signature/inheritance signals carry NO discriminating evidence
		// for this pair, so they must not be counted as full similarity (1.0). The
		// pair's confidence should land far below the similar threshold.
		const geo = {
			name: "GeoPoint",
			kind: "interface",
			properties: [
				{ name: "latitude", type: "number" },
				{ name: "longitude", type: "number" },
				{ name: "altitude", type: "number?" },
			],
			methods: [],
			extends: [],
			implements: [],
		};
		const audit = {
			name: "AuditRecord",
			kind: "interface",
			properties: [
				{ name: "actor", type: "string" },
				{ name: "action", type: "string" },
				{ name: "occurredAt", type: "string" },
				{ name: "payload", type: "string?" },
			],
			methods: [],
			extends: [],
			implements: [],
		};

		const signals = main.matchSignals(geo, audit, {});
		const decision = main.decide(geo, audit, { signals, weights: null, thresholds: null });

		expect(decision.confidence).toBeLessThan(0.35);
		expect(decision.tier).toBeNull();
		// The empty-set signals must not report a full-similarity 1.0.
		expect(signals.methods.score).toBeLessThan(1);
		expect(signals.signature.score).toBeLessThan(1);
		expect(signals.inheritance.score).toBeLessThan(1);
	});

	it("extracts constructor parameter properties as properties", () => {
		// Isolated fixture root: these classes carry fields only via constructor
		// parameter properties, so they must not pollute the shared pipeline root.
		const config = buildConfig({ roots: ["tests/duplicates/ranges"] });
		const result = main.run(config);

		const dr = result.entities.find((e) => e.name === "DateRange");
		expect(dr).toBeTruthy();
		const propNames = dr.properties.map((p) => p.name);
		// `from` and `to` are declared only as constructor parameter properties
		// (readonly from: string) — they must surface as properties.
		expect(propNames).toContain("from");
		expect(propNames).toContain("to");

		// The near-identical pair must be recognized via those properties, not
		// only via its shared method.
		const pair = result.matches.find((m) => pairNames(m) === "DateRange|TimeRange");
		expect(pair).toBeTruthy();
		expect(pair.decision.signals.properties.score).toBeGreaterThan(0.9);
	});

	it("does not score unrelated record constants as duplicates via numeric keys", () => {
		// CATEGORIES and FLOW are two unrelated Record<number, ...> constants.
		// Their numeric keys (1,2,3) are not semantic properties — matching on
		// them must not push the pair into the duplicate tier.
		const config = buildConfig({ roots: ["tests/NOT_duplicates/records"] });
		const result = main.run(config);

		const pair = result.matches.find((m) => pairNames(m) === "CATEGORIES|FLOW");
		// Either not reported at all, or at most weakly similar.
		if (pair) expect(pair.tier).toBe("similar");
	});

	it("discounts the properties signal when shared keys have different value types", () => {
		// DISPLAY_UNIT and UNIT_RANGE share all three keys, but the values are
		// strings vs numbers — name-only overlap must not score a full 1.00.
		const config = buildConfig({ roots: ["tests/NOT_duplicates/maps"] });
		const result = main.run(config);

		const pair = result.matches.find((m) => pairNames(m) === "DISPLAY_UNIT|UNIT_RANGE");
		expect(pair).toBeTruthy();
		const props = pair.decision.signals.properties;
		expect(props.score).toBeGreaterThan(0);
		expect(props.score).toBeLessThan(1);
		// The evidence must expose the type disagreement.
		expect(props.evidence.typeAgreement).toBe(0);
	});

	it("uses the returned-object shape for objects whose members are factory functions", () => {
		// UNIT_DEFAULTS and CALLER each have a single `queryOptions` arrow function
		// that returns an object. The entity's real shape is the RETURNED object —
		// matching them on a single shared "queryOptions" property (props 1.00)
		// must not happen.
		const config = buildConfig({ roots: ["tests/NOT_duplicates/factories"] });
		const result = main.run(config);

		const a = result.entities.find((e) => e.name === "UNIT_DEFAULTS");
		const b = result.entities.find((e) => e.name === "CALLER");
		expect(a).toBeTruthy();
		expect(b).toBeTruthy();
		// The nested returned-object members must surface as properties.
		const aNames = a.properties.map((p) => p.name);
		expect(aNames).toContain("queryKey");
		expect(aNames).toContain("initialData");
		expect(b.properties.length).toBeGreaterThanOrEqual(2);

		const pair = result.matches.find((m) => pairNames(m) === "CALLER|UNIT_DEFAULTS");
		if (pair) expect(pair.decision.signals.properties.score).toBeLessThan(1);
	});

	it("does not score single-property seed records as duplicates of each other", () => {
		// CHEN and REYES are two unrelated seed records with the same two fields
		// (id, name). With only two properties each and full overlap, the Jaccard
		// blend saturates at 1.00 and the pair is flagged duplicate — but two
		// single-record fixtures sharing a generic {id, name} shape is not a
		// duplicate. The properties score must stay below 1.00.
		const config = buildConfig({ roots: ["tests/NOT_duplicates/singles"] });
		const result = main.run(config);

		const chen = result.entities.find((e) => e.name === "CHEN");
		const reyes = result.entities.find((e) => e.name === "REYES");
		expect(chen).toBeTruthy();
		expect(reyes).toBeTruthy();

		const pair = result.matches.find((m) => pairNames(m) === "CHEN|REYES");
		expect(pair).toBeTruthy();
		expect(pair.decision.signals.properties.score).toBeLessThan(1);
		expect(pair.tier).not.toBe("duplicate");
	});

	it("drops inheritance and usage pairs via filters", () => {
		const config = buildConfig();
		const result = main.run(config);

		// UserEventEmitter extends EventEmitter and re-declares the same methods —
		// the raw pair is a candidate but must be filtered out.
		const kept = result.matches.find((m) => pairNames(m) === "EventEmitter|UserEventEmitter");
		expect(kept).toBeFalsy();

		const dropped = result.dropped.find((d) => {
			const names = [d.a.name, d.b.name].sort().join("|");

			return names === "EventEmitter|UserEventEmitter";
		});
		expect(dropped).toBeTruthy();
	});

	it("honors thresholds override (very high threshold removes duplicates)", () => {
		const config = buildConfig({ thresholds: { duplicate: 0.99, extract: 0.98, similar: 0.97 } });
		const result = main.run(config);

		// Only the forced (fast-path) duplicates survive a 0.99 bar: alias,
		// store-model-copy, and identical-shape pairs are structural facts, not
		// heuristic scores.
		const dups = result.matches.filter((m) => m.tier === "duplicate");
		expect(dups.map(pairNames).sort()).toEqual([
			"DocumentData|DocumentStoreModel",
			"DocumentData|PrettyModelData",
			"TokenQuery|TokenQueryCopy",
		]);
	});

	it("honors ignoredMembers (ignoring shared members lowers similarity)", () => {
		// ClientProfile (id,name,dob,email,phone) and accountSchema (id,name,email,age,roles)
		// share exactly id/name/email. Ignoring those three shared members must make the
		// pair *less* similar, not more.
		const base = main.run(buildConfig());
		const withIgnored = main.run(buildConfig({ ignoredMembers: ["id", "name", "email"] }));

		const find = (r) => {
			const m = r.matches.find((x) => pairNames(x) === "ClientProfile|accountSchema");

			return m ? m.decision.confidence : 0;
		};

		expect(find(base)).toBeGreaterThan(0);
		expect(find(withIgnored)).toBeLessThan(find(base));
	});

	it("reads ignoredProperties (string[]) from rule options, no defaults", () => {
		// The consumer config (eslint.config.js) supplies the noise list under
		// `ignoredProperties`; the framework must accept that key and apply it
		// exactly as given — no invented defaults.
		const config = main.buildConfig(pluginDir, { options: { ignoredProperties: ["id", "name", "email"] } }, { roots: [ENTITIES_ROOT] });

		expect(config.ignoredMembers).toEqual(["id", "name", "email"]);

		// No rule options, no CLI override → empty list, never a default.
		const bare = main.buildConfig(pluginDir, null, { roots: [ENTITIES_ROOT] });
		expect(bare.ignoredMembers).toEqual([]);
	});

	it("honors ignoredProperties from rule options end-to-end", () => {
		const base = main.run(buildConfig());
		const withIgnored = main.run(
			main.buildConfig(pluginDir, { options: { ignoredProperties: ["id", "name", "email"] } }, { roots: [ENTITIES_ROOT] })
		);

		const find = (r) => {
			const m = r.matches.find((x) => pairNames(x) === "ClientProfile|accountSchema");

			return m ? m.decision.confidence : 0;
		};

		expect(find(base)).toBeGreaterThan(0);
		expect(find(withIgnored)).toBeLessThan(find(base));
	});

	it("reads roots from rule options when the CLI does not pass --roots", () => {
		const config = main.buildConfig(pluginDir, { options: { roots: [ENTITIES_ROOT] } }, {});

		expect(config.roots).toEqual([ENTITIES_ROOT]);
	});
});
