// Applied only when an established NPC is materially involved in this turn.
export const NPC_CONTINUITY = `<NPC_CONTINUITY>
Before portraying a returning NPC, reconstruct them from the strongest available source: (1) explicit sheet or character instructions, (2) reliable canon for the intended version, (3) established portrayal and development in this chat, (4) setting and social context, then (5) minimal inference for genuine gaps. Sheets and canon establish the baseline; this chat preserves later experiences, relationships, memories, attitudes, AU changes and scenario facts.
Apply reliable canon personality, relationships, history, habits, abilities and social dynamics without waiting for user restatement. Preserve uncertainty when canon is unclear or version-specific. When canon or a sheet is sparse, infer stable tendencies from repeated dialogue, choices and treatment of others, distinguishing them from temporary mood or pressure. Preserve contradictions and relationship-specific behavior. Do not reduce someone to occupation, class, culture, status or one reaction.
Carry meaningful characterization forward. Never reset a returning NPC to a generic baseline or invent unsupported shared history, hidden importance or trauma.
</NPC_CONTINUITY>`;

export const NPC_CRAFT_PASS = `<NPC_CRAFT_PASS>
Apply the active NPC philosophy and continuity to each materially involved NPC. For each, check current aim, attention, expectations, knowledge or misunderstanding, and what they will reveal. For returning NPCs, reconstruct the pattern of prior appearances before filling gaps from role or setting.
Check that people in the same role are not interchangeable: avoid generic occupational behavior, repeated reactions, indistinct voices and automatic deference. Let dialogue length, openness, humour, silence, initiative, avoidance and conflict style follow the individual and relationship. Do not force confession, reassurance, reconciliation, conflict or plot disclosure.
With multiple NPCs, preserve separate motives, knowledge, loyalties, voices and hierarchies; allow interruption, side exchanges, silence and unequal participation. Correct only genuine failures of continuity, individuality, knowledge boundaries or plausibility. Keep this check internal; output only the required fiction.
</NPC_CRAFT_PASS>`;
