### Grounded VI-change faithful summarization — 3-config eval

Schema `vi-history-suite/ollama-vichange-eval-compare@v1` · floor 1 · 12 items · host `http://localhost:11434`

| config | model | present | overall | standard | adversarial | guard |
|---|---|---|---|---|---|---|
| 8b-raw | `llama3.1:8b` | yes | 0.931 | 0.896 | 1 | PASS |
| 8b-fewshot | `vichange8b-fewshot` | yes | 1 | 1 | 1 | PASS |
| 14b | `qwen2.5:14b` | no | – | – | – | – |

#### By task

| task | 8b-raw | 8b-fewshot |
|---|---|---|
| full-summary | 0.75 | 1 |
| count | 1 | 1 |
| kinds | 0.834 | 1 |
| cosmetic-split | 1 | 1 |
| adv-false-nochange | 1 | 1 |
| adv-cosmetic-only-trap | 1 | 1 |

