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

The model consumes the vi-semantic-comparison@v1 model (changedSurfaces, detailSections, totals.detailItemCount = non-cosmetic count, attributes) and emits its narrative -- a closed loop inside the governed contract.

*Gap vs template:* The current MCP narrative is a deterministic template (renderViSemanticNarrative) that reports only the non-cosmetic detail count and DROPS cosmetic sections (verified: a report with 3 non-cosmetic + 2 cosmetic items yields narrative "The block diagram differs. 3 detailed changes..." with no mention of the 2 cosmetic changes). A grounded faithful-summarizer surfaces cosmetic-vs-structural, fabricates no counts, and never says "no changes" over real changes.

*Integration point:* src/semantic/viSemanticModel.ts: renderViSemanticNarrative(model) (defined ~line 309) is called at ~line 264 (`narrative: renderViSemanticNarrative(model)`). A model-backed narrative generator is a drop-in alternative at that swap site -- same input (the semantic model), richer grounded output, with the deterministic template retained as the ungrounded fallback. Surfaced identically in the Source Control hover, PR/CI comment, and MCP tool output.

*Quality gate:* The governed faithfulness scorer (statesStructuralCount / noFalseNoChange / mentionsCosmetic / noInventedNumbers) is the narrative-quality gate for the MCP surface.

## Recommendation

- **Local default:** 8b-2shot (vichange8b-2shot) -- cheapest local, adversarially robust (adv 1.0), most consistent 8b across the held-out VIs, within a small band of 14b on the leakage-free bar.
- **Larger model:** qwen2.5:14b when a larger model is acceptable -- top generalization on the held-out bar; verify its lone adversarial N=1 miss (MenuSelection(User)).
- **Not recommended:** 1-shot few-shot as the default -- on the wider honest bar (with genuine-no-change VIs) its assert-a-count bias drops it below raw; it is not the robust choice.
- **LoRA:** DEFERRED -- the leakage fix is the held-out split (already honored by raw/few-shot/2-shot); a LoRA is backend-orthogonal to the closed GPU divergence; and the torch/Blackwell-sm_120/gated-HF/disk fine-tune infra is not cheap. A future held-out-trained LoRA is compared to the leakage-free bar above, never to a single-split memorization ceiling.
- **Fallback:** Keep the deterministic template narrative as the ungrounded fallback when no model backend is available.
