"use strict";

import React from "react";
import { CodeDiff } from "@md-code/code-diff/view";
import { tones, boardTheme } from "../../domain/tones";
import { tokenizerFor } from "../../domain/syntax";

// ── THE BOARD ──────────────────────────────────────────────────────────────
//
// A thin adapter. code-diff already aligned the rows and resolved the lanes
// (domain/board.js); this only hands it the columns, the connections, the colours
// and a tokenizer. It draws nothing itself — no range, no ribbon, no hover math.

export const PairBoard = ({ board, corridor, reveal }) => {
	if (!board) return null;
	const tokenize = (text, column) => tokenizerFor(board.columns[Number(column)]?.path)(text);

	return (
		<CodeDiff
			theme={boardTheme}
			tones={tones}
			columns={board.columns}
			connections={board.connections}
			corridors={[corridor, undefined]}
			reveal={reveal}
			fit="scroll"
			tokenize={tokenize}
		/>
	);
};

export default PairBoard;
