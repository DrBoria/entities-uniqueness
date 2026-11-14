"use strict";

import React, { useState } from "react";
import styled from "styled-components";
import { SIGNALS } from "../../../../errorTypes/vocabulary/labels";
import { usePairBoard } from "../../hooks/usePairBoard";
import { PairTabs } from "./PairTabs";
import { PairLegend } from "./PairLegend";
import { PairBoard } from "./PairBoard";
import { Detail } from "./Detail";
import { pairTheme } from "./theme";

// ── THE PAIR VIEW ─────────────────────────────────────────────────────────
//
// Composition only. The board model (rows + lanes) is built by code-diff through
// the usePairBoard hook; this view owns the selected signal tab, the gutter width
// and the show-all toggle, and hands the result to the board. It draws no code,
// no rectangle, no ribbon itself.

const GUTTERS = { 3: 220, 4: 300, 5: 380 };

const Frame = styled.div`
	border: 1px solid ${pairTheme.chrome.border};
	border-radius: ${pairTheme.radius.md};
	overflow: hidden;
	background: ${pairTheme.chrome.panelAlt};
`;

const Head = styled.div`
	display: grid;
	grid-template-columns: minmax(0, 1fr) ${(p) => p.$gutter}px minmax(0, 1fr);
	background: ${pairTheme.chrome.panelAlt};
	border-bottom: 1px solid ${pairTheme.chrome.border};
	font-family: ${pairTheme.font.sans};
	font-size: 11px;
	color: ${pairTheme.chrome.dim};
	& > div { padding: 4px 6px; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
`;

export const PairView = ({ pair, decision }) => {
	const [mode, setMode] = useState(SIGNALS[0].key);
	const [set, setSet] = useState(5);
	const [expanded, setExpanded] = useState(false);
	const board = usePairBoard(pair, mode);

	if (!pair) return null;
	const gutter = GUTTERS[set];
	const columns = pair.columns ?? [];

	return (
		<Frame>
			<PairTabs
				mode={mode}
				onMode={setMode}
				expanded={expanded}
				onExpanded={() => setExpanded(!expanded)}
				gutters={GUTTERS}
				set={set}
				onSet={setSet}
			/>
			<PairLegend mode={mode} pair={pair} decision={decision} />
			<Head $gutter={gutter}>
				{columns.map((column, index) => (
					<React.Fragment key={index}>
						<div>{column.path ?? ""}</div>
						{index < columns.length - 1 ? <div /> : null}
					</React.Fragment>
				))}
			</Head>
			<PairBoard board={board} corridor={gutter} reveal={expanded} />
			<Detail pair={pair} />
		</Frame>
	);
};

export default PairView;