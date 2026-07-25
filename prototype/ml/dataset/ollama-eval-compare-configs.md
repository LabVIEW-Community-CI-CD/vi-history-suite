### Grounded VI-change faithful summarization — 3-config eval

Schema `vi-history-suite/ollama-vichange-eval-compare@v1` · floor 1 · 28 items · host `http://localhost:11434`

| config | model | present | overall | standard | adversarial | guard |
|---|---|---|---|---|---|---|
| 8b-raw | `llama3.1:8b` | yes | 0.917 | 0.883 | 1 | PASS |
| 8b-fewshot | `vichange8b-fewshot` | yes | 0.946 | 0.925 | 1 | PASS |
| 14b | `qwen2.5:14b` | yes | 0.976 | 0.967 | 1 | PASS |
| 8b-2shot | `vichange8b-2shot` | yes | 0.946 | 0.942 | 0.958 | FAIL |

#### By task

| task | 8b-raw | 8b-fewshot | 14b | 8b-2shot |
|---|---|---|---|---|
| full-summary | 0.8 | 0.9 | 1 | 0.9 |
| count | 1 | 0.933 | 1 | 0.933 |
| kinds | 0.933 | 0.867 | 0.867 | 1 |
| cosmetic-split | 0.8 | 1 | 1 | 0.933 |
| adv-false-nochange | 1 | 1 | 1 | 0.917 |
| adv-cosmetic-only-trap | 1 | 1 | 1 | 1 |

