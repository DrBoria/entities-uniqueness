"use strict";

import React from "react";
import styled from "styled-components";
import { signalOf } from "../../../../errorTypes/vocabulary/labels";
import { percentOf } from "../../../../../evidence";
import { pairTheme } from "./theme";

// The legend under the tabs: what the colours mean, and the selected signal's
// score × weight. The name tab also shows the shared name tokens. Reads only the
// decision and the analysis scores — no ranges, no rows.

const Legend = styled.div`
	display: flex;
	flex-wrap: wrap;
	gap: 16px;
	align-items: center;
	padding: 5px 10px;
	border-bottom: 1px solid ${pairTheme.chrome.border};
	background: ${pairTheme.chrome.panel};
	font-family: ${pairTheme.font.sans};
	font-size: 11.5px;
	color: ${pairTheme.chrome.dim};
`;

const Dot = styled.span`
	display: inline-block;
	width: 8px;
	height: 8px;
	border-radius: 50%;
	background: ${(p) => p.$c};
	margin-right: 5px;
`;

const percent = (value) => `${Math.round((value ?? 0) * 100)}%`;

export const PairLegend = ({ mode, pair, decision }) => {
	const group = signalOf(mode);
	const signal = (decision?.signals ?? []).find((item) => item.key === mode) ?? null;
	const name = mode === "name" ? pair.analysis?.name ?? null : null;

	return (
		<Legend>
			<span>
				<Dot $c={pairTheme.band.same} /> red = the two lines are character-for-character identical
			</span>
			<span>
				<Dot $c={pairTheme.band.diff} /> green = the members correspond, their text differs
			</span>
			<span>no ribbon = one side only, or nothing compared here</span>
			{name ? (
				<span title="tokens both names share" style={{ color: pairTheme.chrome.text }}>
					name {percent(name.score)}
					{name.common?.length ? ` (${name.common.join(" + ")})` : ""}
				</span>
			) : null}
			{signal ? (
				<span style={{ marginLeft: "auto", color: pairTheme.chrome.faint }}>
					{group.label} {percentOf(signal.score)}% × {signal.weight.toFixed(2)} = {(signal.score * signal.weight).toFixed(2)}
				</span>
			) : null}
		</Legend>
	);
};

export default PairLegend;