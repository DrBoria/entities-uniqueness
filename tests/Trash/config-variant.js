"use strict";

// Variant config for the manual config-variant run: heavier name signal,
// lighter properties, plus code/system ignored as noise members.
module.exports = {
	weights: { properties: 0.2, methods: 0.3, signature: 0.2, name: 0.25, inheritance: 0.05 },
	ignoredMembers: ["code", "system"],
};
