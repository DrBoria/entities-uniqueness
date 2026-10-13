// Tiny shape: exactly two fields, no methods. Shares its whole body with
// TerminalDimensions — a full-overlap intersection that must NOT score 1.00.
export interface TerminalSize {
	columns: number;
	rows: number;
}
