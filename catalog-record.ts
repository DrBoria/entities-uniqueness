"use strict";

// The catalog's entity record, serialized once. Both the CLI catalog (main.ts
// writeCatalog) and the self-maintained catalog (self-catalog.ts) persist the
// SAME fields, so the shape is defined here once — a field added to the catalog
// is added in one place, and the two writers can never drift apart.
const serializeEntity = (e) => ({
	id: e.id,
	name: e.name,
	kind: e.kind,
	sourceFile: e.sourceFile,
	line: e.line,
	endLine: e.endLine,
	exported: e.exported,
	framework: e.framework,
	properties: e.properties,
	methods: e.methods,
	extends: e.extends,
	implements: e.implements,
	complexity: e.complexity,
	// The facts the values/inheritance signals and the live rule need.
	values: e.values,
	valueTree: e.valueTree,
	aliasOf: e.aliasOf,
	typeText: e.typeText,
	storeModel: e.storeModel,
	modelName: e.modelName,
});

// The catalog envelope shared by both writers: the run metadata plus the
// serialized entities. The CLI catalog (main.ts) extends it with matches,
// clusters, suggestions, …; the self-maintained catalog (self-catalog.ts) uses
// it as-is. The common shape lives here so the two can never drift apart.
const buildCatalogEnvelope = ({ root, weights, thresholds, files, entities }) => ({
	generatedAt: new Date().toISOString(),
	root,
	weights,
	thresholds,
	files,
	entityCount: entities.length,
	entities: entities.map(serializeEntity),
});

export { serializeEntity, buildCatalogEnvelope };