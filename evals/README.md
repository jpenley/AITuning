# Optional evaluation toolkit

Use this toolkit to check skill structure, compare instructions and plan model evaluations. It is optional: the tools add no agent skills or description overhead. Use Node.js 24 or later. The runtime closure uses Node builtins and needs no npm packages. Native Git and Bash provide optional validation coverage. Model CLIs and services are optional. This toolkit does not install them.

Run commands from this `evals` folder beside the complete public skill collections. Keep the `lib/` modules and fixtures with the entrypoints.

## Run offline checks

```text
npm test
npm run ab:plan
npm run route:plan
npm run xreview:plan
npm run plugin:plan
npm run propose:plan
npm run trends:example
npm run micro:plan
```

`npm test` runs checker and harness selftests, then structural and lexical-routing checks. It has no global synchronization, installation hooks or provider-load check. Selftests use constructed inputs and fake process responses. They do not establish model quality. Default A/B, routing, cross-review, plugin and proposal commands plan without executing a model. Wording comparisons need `--plan` explicitly; the package's `micro:plan` includes it.

## Entrypoints

The toolkit provides these eleven CLIs:

| Entrypoint | Purpose and default |
|---|---|
| `validate.mjs` | Check public skill structure and toolkit constraints. |
| `triggers.mjs` | Check lexical trigger ranking and collisions. |
| `behave.mjs` | Plan behavior comparisons; `--run` requests execution. |
| `micro.mjs` | Sample wording variants. Use `--plan` for offline planning. |
| `ab.mjs` | Plan ten judgment moments against configured engines. |
| `route.mjs` | Plan classification of trigger prompts against skill descriptions. |
| `xreview.mjs` | Plan Claude-versus-Codex plan reviews and two-family judging. |
| `plugin-eval.mjs` | Plan a plugin evaluation. Live execution requires `--run`; publishing is forbidden. |
| `trends.mjs` | Analyze your saved results or an attempt table without model calls. |
| `propose.mjs` | Plan passage proposals, critiques and blind judging; writes variants only on `--run`. |
| `run-checks.mjs` | Execute an authorized argv request with durable receipts, or read a receipt with `status`. |

`run-checks.mjs` is a process runner, not a sandbox or an offline guarantee. A request can execute arbitrary authorized commands. Check its executable, arguments, environment and working directory before using `run`. `status` only reads the saved receipt; a completed receipt still needs code 0 to establish a passing check. Keep credentials out of arguments, requests and logs.

## Synthetic provenance and limits

The nine JSON datasets under `ab/data/` are newly generated, clearly synthetic contract demonstrations with benchmark identity `public-synthetic-v1`. They contain no copied postings, commit history, private benchmark excerpts or recorded model output. Routing is the tenth moment; it builds inputs from the shipped skill descriptions and trigger cases. Small synthetic examples exercise loaders and scorers, not representative benchmark difficulty.

The cross-review fixture, twelve plans and answer key are constructed experiment inputs. Its nested `fixture/package.json` preserves the CommonJS boundary. The exporter regenerates `xreview/freeze.json` against the final exported fixture, plans, schema, documentation and prompt bytes. Read the [cross-review design](xreview/README.md) before interpreting its statistical rule. Drift blocks live review and judging until you deliberately freeze your revised experiment.

This public benchmark has no result continuity with private evaluation runs. Historical freezes, recorded runs, transcripts, runtime data, judge caches and private provider settings are omitted. No model-performance or installed-publication acceptance claim follows from offline tests. Preserve raw replies and report unavailable judges as untested, not passing.

## Configure paid execution

Paid commands use your accounts and can incur charges. Authorize the exact provider, inputs and budget before enabling them. The generated [engine catalog](engines.json) contains disabled engines, an explicit empty decision chain and no endpoints, launch commands or credential names. It never consults a host instruction file to choose engines.

1. Copy [the engine example](examples/engines.local-example.json) to `engines.local.json`.
2. Choose explicit model and effort values for the candidate and baseline.
3. Enable only the engines you intend to run.
4. Run `npm run ab:run` or `npm run route:run` when you have authorized the calls.

Configure cross-review with [its local example](examples/xreview.local-example.json), copied to `xreview.local.json`. Keep the Claude reviewer and Codex reviewer roles. Both judges also retain those families. Explicitly select a model and effort for each role, then enable the roles you authorize. The config accepts only `claude` and `codex` objects, each with boolean `enabled`, string `model` and explicit `effort`. Only Codex accepts the optional boolean `writeBackAuth`; unknown keys fail before discovery.

`xreview:run` and `xreview:judge` are paid commands. Codex authentication is copied into a temporary home only for enabled live work. Refresh write-back is off unless you set `codex.writeBackAuth` to `true`. Judging requires successful reviews from both families for each selected plan. Analysis requires every requested review to succeed, at least two reviews per family for every plan, current finding packets and both judges' answers for every finding. Explicit schema-valid empty reviews can form a complete negative experiment without judge calls; missing or malformed replies cannot.

The result directory binds the review phase to its freeze, plan/family/run selection, explicit models, efforts and settings. Each review carries that phase identity. The judge phase records its own settings, which may differ from the review choices; each answer binds those settings to the exact packet SHA-256 and selected plan. Resume and offline analysis revalidate saved contracts, finding coverage and plan-specific flaw IDs. They reject stale or unbound evidence rather than silently relabeling or overwriting it. Changing inputs, selection or phase settings requires a new `--out`; freezing revised inputs does not make old results reusable. Offline analysis validates the saved phase settings without enabling a model or reading authentication.

Configure the plugin and proposal tools with [the plugin example](examples/plugin-eval.local-example.json) and [the proposal example](examples/propose.local-example.json). Copy each to the corresponding `plugin-eval.local.json` or `propose.local.json`, choose a Claude model and effort, then enable it. `plugin:run` stages a temporary plugin copy under results only after the guard passes. It forces `--no-publish`. Proposal plans do not discover executables on PATH.

Behavior and wording tools use [targets.json](targets.json), not the engine catalog. Copy it to `targets.local.json`, choose models and explicitly enable the targets you authorize. Pass `--targets targets.local.json` with `behave.mjs --run`. Enable its judge explicitly or retain `--no-judge` and report the missing coverage. For `micro.mjs`, removing `--plan` requests sampling. An empty `variant-none.md` supplies the no-guidance control.

Keep local configuration private. The publisher excludes private configs and recorded outputs rather than synchronizing them into public exports. Ignore your own additional `*.local.json` files before committing your experiments.

## Results and attribution

Behavior and advanced live outputs go under `results/`; wording replies go under the experiment's `out/`. Requested settings and response-observed model identity are different evidence. Read repeated controlled results before accepting an instruction change, as [tune's testing reference](../skills/productivity/tune/TESTING.md) describes.

The [toolkit constraints](CONSTRAINTS.md) and [metadata](public-toolkit.json) describe the public profile. Source adaptations are recorded in the publisher inventory. Retain [upstream notices](../THIRD_PARTY_NOTICES.md), copied source credits, and the Factory Floor credit on the native process helper.
