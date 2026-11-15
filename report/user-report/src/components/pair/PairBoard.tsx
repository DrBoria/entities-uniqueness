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

export const PairBoard = ({ board, corridor, reveal, onReveal }) => {
	if (!board) return null;
	const tokenize = (text, column) => tokenizerFor(board.columns[Number(column)]?.path)(text);

	return (
		<CodeDiff
			theme={boardTheme}
			tones={tones}
			columns={board.columns}
			connections={board.connections}
			blocks={board.blocks}
			corridors={[corridor, undefined]}
			reveal={reveal}
			sync={[{ columns: ["0", "1"], axis: "xy" }]}
			fit="scroll"
			tokenize={tokenize}
			// The owner's chip OWNS reveal: the board shows exactly this state and reports
			// fold-button toggles back, so "only blocks / show all" always recomputes.
			controller={onReveal === undefined ? undefined : { reveal, onReveal }}
			options={{ boardHeight: "68vh", fullMount: 120 }}
		/>
	);
};

export default PairBoard;
