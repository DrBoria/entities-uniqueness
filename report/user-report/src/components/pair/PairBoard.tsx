"use strict";

import React from "react";
import { CodeDiff } from "@md-code/code-diff/view";
import { adaptLegacyBoard, adaptLegacyTheme } from "@md-code/code-diff";
import { tones, boardTheme } from "../../domain/tones";
import { tokenizerFor } from "../../domain/syntax";

// ── THE BOARD ──────────────────────────────────────────────────────────────
//
// A thin adapter. The domain (domain/board.js) states the facts; code-diff's
// legacy adapter turns them into rows + ribbons, and the board draws them. Reveal
// is controlled through the events map, so the owner's chip and the board agree.

export const PairBoard = ({ board, corridor, reveal, onReveal }) => {
	if (!board) return null;
	const { columns, ribbons } = adaptLegacyBoard(board);
	const theme = adaptLegacyTheme(boardTheme, tones);
	const tokenize = (text, column) => tokenizerFor(board.columns[Number(column)]?.path)(text);

	return (
		<CodeDiff
			theme={theme}
			columns={columns}
			ribbons={ribbons}
			corridors={[corridor, undefined]}
			sync={[{ columns: ["0", "1"], axis: "xy" }]}
			fit="scroll"
			tokenize={tokenize}
			state={{ revealed: reveal }}
			events={onReveal === undefined ? undefined : { "board:revealChange": (p) => onReveal(p.revealed) }}
			config={{ boardHeight: "68vh", fullMount: 120 }}
		/>
	);
};

export default PairBoard;
