// Fixture mirroring md-prettify/apps/backend/document/type.ts: a hand-written
// `type DocumentData = { ... }` copy of the state declared by the MST store
// model `t.model("DocumentStore", {...})`, plus an alias duplicate
// `type PrettyModelData = DocumentData` and the generated instance type
// `type DocumentStore = Instance<typeof DocumentStoreModel>`.
import { types as t } from "mobx-state-tree";

type DocumentView = {
	getText: (r: Range) => string;
	getLineCount: () => number;
};
type Range = { start: number; end: number };
type Host = { id: string };
type PrettySubstitution = { ugly: RegExp; pretty: string };
type DecorationCacheEntry = { decorationType: string; ranges: Range[]; pretty: string };
type OutputChannel = { appendLine(line: string): void };
type HideTextMethod = "hack-fontSize" | "hack-letterSpacing" | "none";
type UglyRevelation = "cursor" | "active-line" | "none";
type PrettyCursor = "boxed" | "none";
type UpdateDecorationEntry = { decoration: string; ranges: Range[] };
type DebounceFunction = (fn: () => void, ms: number) => void;
type Selection = { activeLine: number };
type TextEditor = { id: string };
type Disposable = { dispose(): void };
type PrettyModel = { dispose(): void };
type StateStack = { line: number; stack: number[] };

// The data fields of the document model plus its actions — a hand-written
// copy of the shape the store model below declares.
export type DocumentData = {
	// --- data ---
	document: DocumentView;
	host: Host;
	prettySubstitutions: Set<PrettySubstitution>;
	decorationCache: Map<string, DecorationCacheEntry>;
	hiddeDecorationsRanges: Set<Range>;
	lineIndex: Map<number, Range[]>;
	rangeKeyToCacheKey: Map<string, string>;
	changedUglies: boolean;
	hiddenDecoration: string | null;
	revealedUglyDecoration: string | null;
	boxedSymbolDecoration: string | null;
	debug: boolean;
	outputChannel: OutputChannel;
	defaultScope: string;
	excludedScopes: Set<string>;
	hideTextMethod: HideTextMethod;
	revealStrategy: UglyRevelation;
	prettyCursor: PrettyCursor;
	disabledLines: Set<number>;
	grammar: object | null;
	grammarState: StateStack[];

	// --- actions ---
	disposeModel(): void;
	unloadDecorations(): void;
	commitSelections(editor: TextEditor): Selection[] | null;
	disposeController(): void;
	getDecorationsList(): Set<UpdateDecorationEntry>;
	toggleLine(line: number): boolean;
	applyChanges(changes: { range: Range; text: string }[]): boolean;
	recomputeDecorations(): void;
	reparseViewport(viewportRange?: Range): Promise<void>;
	revealSelections(selections: Selection[]): UpdateDecorationEntry;
	findSymbolsOnLine(line: number): Range[];
	getPrettySubstitutionsRanges(): Range[];
	getDecoratedText(range: Range): string;
};

// Alias duplicate: the same shape under a second name.
export type PrettyModelData = DocumentData;

// The document feature store model.
export const DocumentStoreModel = t.model("DocumentStore", {
	document: t.frozen<DocumentView>(),
	textDocument: t.optional(t.frozen<object>(), null),
	host: t.frozen<Host>(),
	prettySubstitutions: t.frozen<Set<PrettySubstitution>>(),
	decorationCache: t.frozen<Map<string, DecorationCacheEntry>>(),
	hiddeDecorationsRanges: t.frozen<Set<Range>>(),
	lineIndex: t.frozen<Map<number, Range[]>>(),
	rangeKeyToCacheKey: t.frozen<Map<string, string>>(),
	changedUglies: t.boolean,
	hiddenDecoration: t.maybeNull(t.string()),
	revealedUglyDecoration: t.maybeNull(t.string()),
	boxedSymbolDecoration: t.maybeNull(t.string()),
	debug: t.boolean,
	outputChannel: t.frozen<OutputChannel>(),
	defaultScope: t.string,
	excludedScopes: t.frozen<Set<string>>(),
	hideTextMethod: t.enumeration<HideTextMethod>(["hack-fontSize", "hack-letterSpacing", "none"]),
	revealStrategy: t.enumeration<UglyRevelation>(["cursor", "active-line", "none"]),
	prettyCursor: t.enumeration<PrettyCursor>(["boxed", "none"]),
	disabledLines: t.frozen<Set<number>>(),
	prettyModel: t.maybeNull(t.frozen<PrettyModel>()),
	subscriptions: t.frozen<Disposable[]>(),
	currentDecorations: t.array(t.frozen<UpdateDecorationEntry>()),
	updateActiveEditor: t.frozen<DebounceFunction>(),
	updateSelection: t.frozen<DebounceFunction>(),
	adjustCursorMovement: t.boolean,
	lastSelections: t.frozen<Map<TextEditor, Selection[]>>(),
	revealedRanges: t.array(t.frozen<Range>()),
	cursorRanges: t.array(t.frozen<Range>()),
});

// A small sibling store model.
export const ResolveStoreModel = t.model("ResolveStore", {
	lastResolvedRange: t.maybeNull(t.frozen<Range>()),
	lastResolvedCacheKey: t.string,
});

// Generated instance type — the store's own output, must NOT be flagged.
export type DocumentStore = Instance<typeof DocumentStoreModel>;
export type ResolveStore = Instance<typeof ResolveStoreModel>;
