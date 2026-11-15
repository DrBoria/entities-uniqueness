"use strict";

import React, { useEffect, useState } from "react";
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

// The tab that best explains WHY the two entities are connected: the signal with
// the most semantic links (the ribbons), tie-broken by the applied signal score.
// An alias pair has only an inheritance link, so it opens on Inheritance — not on
// an empty Properties tab that shows "0%" and no ribbon.
const defaultSignal = (pair, decision) => {
	const signals = decision?.signals ?? [];
	const scoreOf = (key) => {
		const s = signals.find((item) => item.key === key);
		return s && s.applied !== false ? (s.score ?? 0) : 0;
	};
	let best = SIGNALS[0].key;
	let bestRank = -1;
	for (const item of SIGNALS) {
		const links = pair?.links?.[item.key]?.length ?? 0;
		const rank = links * 1000 + scoreOf(item.key);
		if (rank > bestRank) {
			bestRank = rank;
			best = item.key;
		}
	}

	return best;
};

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
	const [mode, setMode] = useState(() => defaultSignal(pair, decision));
	const [set, setSet] = useState(5);
	const [expanded, setExpanded] = useState(false);
	const board = usePairBoard(pair, mode);

	// A new pair opens on the tab that explains ITS connection, not the previous
	// pair's tab.
	const findingId = pair?.findingId;
	useEffect(() => {
		setMode(defaultSignal(pair, decision));
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [findingId]);

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
			{/* A tab is a DIFFERENT board. Keying by mode remounts it, so the new board
			    measures its own rows from a clean state instead of inheriting the previous
			    tab's layout — the roads always find their rows, on every tab. */}
			<PairBoard key={mode} board={board} corridor={gutter} reveal={expanded} onReveal={setExpanded} />
			<Detail pair={pair} />
		</Frame>
	);
};

export default PairView;
