# #2381 Shippable Conclusion -- Grounded VI-change Faithful Summarization

## Eval tiers (canonical multi-config)

| config | overall | adversarial | guard |
|---|---|---|---|
| 8b-raw | 0.917 | 1 | true |
| 8b-fewshot | 0.946 | 1 | true |
| 14b | 0.976 | 1 | true |
| 8b-2shot | 0.946 | 0.958 | false |

## Leakage-free held-out bar (leave-one-VI-out)

- **GPU** (LINUX/gpu): 14b=0.961 > 8b-2shot=0.924 > 8b-raw=0.904 > 8b-fewshot=0.897
- **WIN CPU** (WIN/cpu): 14b=0.954 > 8b-2shot=0.942 > 8b-raw=0.929 > 8b-fewshot=0.897

- **Backend agreement:** exactOrderMatch=true, spearman=1, maxAbsDelta=0.025

## Divergence finding

The 8b-2shot adversarial statesStructuralCount gap on one borderline VI (lv_icon, N=6) is a GPU-offload-config-dependent numerics artifact: seed-invariant within one model load (seedDivergenceCheck.mjs, temp 0, seeds none/0/1/42/123) but run-context-variant across loads (isolated load -> MISS; loaded right after another 8b -> PASS). Independently corroborated by the WIN CPU backend, which holds adversarialMean=1.0 on all configs (crossBackendCheck.mjs). Not sampling noise, not a fixable model/prompt content gap; a ~0.012 band on 8b-2shot macro-overall, ranking robust.

## MCP product home

The model consumes the vi-semantic-comparison@v1 model (changedSurfaces, detailSections, totals.detailItemCount = non-cosmetic count, attributes), enriched with the LabVIEW cosmetic tally (labviewDiffReportParser) the model currently drops, and emits its narrative -- a closed loop inside the governed contract.

*Gap vs template:* A real-data PoC (mcpNarrativePoc.mjs over 8 real NI comparison reports) scored the shipped template vs a grounded 8b-2shot narrator with the shared faithfulness scorer: grounded 1.0 vs template 0.906, grounded selected by the fallback gate on all 8 VIs. The real template weakness is NUMBER HYGIENE, not cosmetic omission: it enumerates the NI report diff-block ordinal indices verbatim (e.g. "4. Block Diagram objects, 14. ..., 18. ...", "51.", "53."), which the scorer flags as invented numbers on the 3 high-section VIs (lv_icon / mousedown / picturecontrol_mouseup -> 0.75, noInventedNumbers=false). This CORRECTS an earlier synthetic-probe claim that the template drops cosmetic: on real reports the template surfaces "Block Diagram Cosmetic" via the compared-attribute list, so mentionsCosmetic=8/8. The grounded summarizer states only the meaningful counts -- the non-cosmetic structural count plus the cosmetic count as an explicit plain-language split ("N structural, M cosmetic that can be ignored for review") -- fabricating no ordinal indices and never saying "no changes" over real changes.

*Integration point:* src/semantic/viSemanticModel.ts: renderViSemanticNarrative(model) (defined ~line 309) is called at ~line 264 (`narrative: renderViSemanticNarrative(model)`). A model-backed narrative generator is a drop-in alternative at that swap site -- same input (the semantic model, cosmetic-enriched), richer grounded output, with the deterministic template retained as the ungrounded fallback. Surfaced identically in the Source Control hover, PR/CI comment, and MCP tool output.

*Quality gate:* The governed faithfulness scorer (statesStructuralCount / noFalseNoChange / mentionsCosmetic / noInventedNumbers) is the narrative-quality gate for the MCP surface.

*PoC evidence:* prototype/ml/mcpNarrativePoc.mjs -> prototype/ml/dataset/mcp-narrative-poc.json (schema vi-history-suite/mcp-narrative-poc@v1): 8 real fixtures, meanTemplate 0.906, meanGrounded 1.0, template mentionsCosmetic 8/8, grounded selected 8/8. Runs anywhere (template-only fallback when no ollama backend).

*Cost decomposition:* Cost decomposition (mcpNarrativePoc.mjs template-v2 / template-min): a cheap DETERMINISTIC template fix scores 1.0 on all 8 VIs, EQUAL to the grounded model (template 0.906 -> template-v2 1.0 = grounded 1.0). The MINIMAL variant (template-min: strip the NI ordinal prefix from each section heading, section.heading.replace(/^\d+\.\s*/, "")) ALSO scores 1.0 -- so ordinal-stripping ALONE closes the entire scored gap (the only failing part was noInventedNumbers). Caveat: stripping ordinals collapses the heading list to duplicates ("Block Diagram objects, Block Diagram objects, and Block Diagram objects"), so the fix must also DEDUPE the heading list (or drop the parenthetical when headings repeat) -- which is why template-v2's count-only phrasing reads cleaner. Either way the grounded 8b-2shot adds no scored-faithfulness value here, only qualitative readability.

## Recommendation

- **Local default:** 8b-2shot (vichange8b-2shot) -- cheapest local, adversarially robust (adv 1.0), most consistent 8b across the held-out VIs, within a small band of 14b on the leakage-free bar.
- **Larger model:** qwen2.5:14b when a larger model is acceptable -- top generalization on the held-out bar; verify its lone adversarial N=1 miss (MenuSelection(User)).
- **Not recommended:** 1-shot few-shot as the default -- on the wider honest bar (with genuine-no-change VIs) its assert-a-count bias drops it below raw; it is not the robust choice.
- **LoRA:** DEFERRED -- the leakage fix is the held-out split (already honored by raw/few-shot/2-shot); a LoRA is backend-orthogonal to the closed GPU divergence; and the torch/Blackwell-sm_120/gated-HF/disk fine-tune infra is not cheap. A future held-out-trained LoRA is compared to the leakage-free bar above, never to a single-split memorization ceiling.
- **MCP narrative:** MCP narrative surface: ship the DETERMINISTIC template fix as the primary faithfulness improvement -- concretely, in renderViSemanticNarrative strip the NI ordinal prefix from each section heading (section.heading.replace(/^\\d+\\.\\s*/, "")) AND dedupe the resulting heading list (or drop the parenthetical when headings repeat). That one change closes the governed-scorer gap on all 8 real fixtures with zero latency/dependency. Treat the grounded 8b-2shot narrator as an OPTIONAL readability layer gated by the same faithfulness scorer, NOT a faithfulness requirement. The durable ML contribution to the MCP surface is the governed faithfulness SCORER as the narrative-quality gate. Blast radius (turnkey for a develop PR): the change is in src/semantic/viSemanticModel.ts (~line 332, the joinHumanList(model.detailSections.map((s) => s.heading)) call); the only exact-string test to update is tests/unit/viSemanticModel.test.ts (the "(1. VI Attribute - Miscellaneous)" assertion). multiReportDashboard.test.ts / viSemanticReviewMarkdown.test.ts assert counts without the heading list and are unaffected.
- **Fallback:** Keep the deterministic template narrative as the ungrounded fallback when no model backend is available.
- **Shipped:** SHIPPED to develop -- the deterministic strip+dedupe fix was opened as issue #2382 -> PR #2383 (feature/2382-narrative-ordinal-hygiene) and squash-merged to develop @9f5f4c9d on 2026-07-25, issue #2382 closed COMPLETED. renderViSemanticNarrative now strips the NI ordinal prefix and dedupes the heading list, so every MCP narrative, Source Control hover, and PR/CI comment reflects it. Co-signed by the GPU/ollama agent, whose held-out fit-numbers folded in and who independently verified the blast-radius against the shipped source.

## Optional grounded provider (#2381 next thread)

- **Status:** prototyped + validated cross-backend (#2381 next thread)
- **Design:** groundedNarrativeProvider.selectMcpNarrative is the WIN-owned FLOW (build cosmetic-enriched facts -> injected ollama backend -> hard-safety floor -> deterministic template fallback) on top of narrativeQualityGate.scoreNarrative, the LINUX-owned shared SCORING PRIMITIVE. One scorer, two complementary layers: the hard-safety floor (statesStructuralCount / noFalseNoChange / noInventedNumbers) rejects an unsafe candidate even on a score tie; mentionsCosmetic is a quality lift.
- **Accept-rate:** Baseline SYSTEM, per config over the 8 real fixtures, backend-robust (GPU == CPU): 8b-raw 1.0, 8b-fewshot 1.0, 8b-2shot 1.0, 14b 0.875. 14b fails the safety gate on visibletextmarker by inventing a per-object sub-count (over-elaboration); reproducible on both backends, not an offload-divergence artifact.
- **Strict SYSTEM (rejected):** A stricter SYSTEM (report ONLY the two tallies, no per-object breakdown) is a BACKEND-DEPENDENT tradeoff and is NOT adopted: on CPU it lifts 14b 0.875->1.0 but drops 8b-fewshot 1.0->0.875; on GPU it additionally drops 8b-2shot to 0.75 on the lvkit=0 no-change VIs (loadtemplates, process template graphics), stable across 2 GPU runs. Keep the BASELINE shared SYSTEM.
- **Recommendation:** If the optional grounded layer is enabled, 8b-2shot is the default: highest accept-rate under the baseline SYSTEM on BOTH backends, cheapest local. The gate guarantees it is never less faithful than the shipped deterministic template (the fallback) -- it can only improve readability.
- **Surface generalization:** Beyond single-comparison, the grounded 8b-2shot layer was evaluated on the two CROSS-ITEM narrative surfaces (baseline SYSTEM, GPU): PR-REVIEW AGGREGATE -- stably faithful, invented=[], names the high-risk VIs and cites real per-VI counts with NO fabricated cross-VI sum, and the gate PREFERS grounded over the terse template (real readability). HISTORY TIMELINE (tiny headline N) -- invented=[] on all runs (no invented cross-revision number), but statesStructuralCount is nondeterministic when the model spells the count as a word ("one") instead of the digit; on those runs the gate CORRECTLY falls back to the deterministic template. So the optional layer GENERALIZES with no invented-number hazard on either cross-item surface, and the gated design absorbs the small-N digit-vs-word flakiness.
- **Deterministic audit:** mcpNarrativeSurfaceAudit.mjs asserts the I1/I2/I3 invariants across ALL 5 MCP narrative surfaces (comparison over 8 real fixtures, history, repo-index, pr-review aggregate, correlation) -- all clean (totalFailing=0). A repeatable, fail-closed governed guard: any future narrative change or optional grounded layer that invents a number, falsely claims no-change, or drops the headline count fails it.
