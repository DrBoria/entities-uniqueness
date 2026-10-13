// Same two-field body as TerminalSize (columns/rows). A tiny full-overlap pair:
// the extract score must be pulled below 1.00 by the small/tiny-shape discounts.
export interface TerminalDimensions {
	columns: number;
	rows: number;
}
