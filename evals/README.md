# Optional evaluation toolkit

Use this toolkit to check skill structure and routing, compare instructions with and without guidance, and test selective skill removal. It ships source tools, prompts, graders and synthetic fixtures. Recorded runs, transcripts, caches, the rejection ledger and owner configuration are omitted.

## Contents

- [Requirements](#requirements)
- [Run offline checks](#run-offline-checks)
- [Plan behavior comparisons](#plan-behavior-comparisons)
- [Plan wording comparisons](#plan-wording-comparisons)
- [Configure model execution](#configure-model-execution)
- [Read results and limits](#read-results-and-limits)
- [Toolkit contents](#toolkit-contents)

## Requirements

Use Node.js 24 or later and native Git. The toolkit needs no npm packages. Bash is optional for checking bundled shell syntax; without it, the validator reports that coverage as unrun.

Run commands from this `evals` folder. The toolkit belongs beside the complete public skill collections; copying only the four entry points leaves their libraries and fixtures behind.

## Run offline checks

```text
npm test
```

This runs checker selftests, synthetic harness tests, skill structure checks and lexical routing checks. Synthetic reference directories named `refs/good` and `refs/bad` are test inputs. Command graders run the bundled fixture checks. Model judges stay unrun, and the output names undecided references.

The generated [target configuration](targets.json) disables every target and the judge. Offline tests use synthetic subprocess replies, and do not require provider credentials or a model service. Run these commands independently when diagnosing a check:

```text
node validate.mjs --selftest
node micro.mjs --selftest
node behave.mjs --selftest --no-judge
node validate.mjs
node triggers.mjs --min-rank1 85
```

The validator checks the public catalog, [toolkit constraints](CONSTRAINTS.md), trigger coverage and the generated public size baseline. It scans files in this copy without consulting a parent repository's history. The private development landing page and machine policies are omitted.

## Plan behavior comparisons

```text
node behave.mjs --case trace-order-flow --no-judge
node behave.mjs --case trace-order-flow --ablate trace --no-judge
```

Both commands plan without `--run`. Disabled targets produce zero executable sessions. Selective removal retains neighboring skill files in both arms and removes only named skills from the without arm. The plan records content inventories and hashes. An invalid selector fails before a harness starts.

Cases under `plugin/` and `family/` contain prompts, graders, synthetic workspaces and references. Add cases in that format for your own changes. Read the existing task and graders before using a case as evidence for a different claim.

## Plan wording comparisons

The [example task](examples/wording/task.md) and two variants illustrate the file format. `variant-none.md` is the empty no-guidance control.

```text
node micro.mjs examples/wording 5 --plan
```

This counts planned samples across variants and configured targets, including disabled targets. It starts no executable, contacts no provider and writes no replies. The example has two variants and two disabled targets, so five repetitions plan 20 samples. It is an illustrative experiment, with no model results supplied.

## Configure model execution

Model execution uses your accounts and may incur charges. Run it only when the provider, inputs and budget are authorized.

Copy `targets.json` to ignored `targets.local.json`. Choose available models and enable only the targets you intend to use. Set credentials locally through the relevant harness or an environment variable. The toolkit contains no owner endpoint, launch script or credentials.

For behavior runs, pass `--targets targets.local.json` and add `--run`. Enable the judge explicitly for model grading, or pass `--no-judge` and retain that missing coverage in the report. A default disabled configuration refuses execution. Model availability, account access and harness support must be verified separately before a live run.

For wording samples, pass your experiment folder and `--targets targets.local.json` to `micro.mjs`, without `--plan`. Removing `--plan` requests execution; retain an empty variant as the control. HTTP wording targets use the runner's `microTransport: openai` configuration with your own endpoint, model and optional `apiKeyEnv` name. No HTTP endpoint is configured in this distribution.

## Read results and limits

Behavior outputs are created in ignored `results/`; wording outputs go under the experiment's ignored `out/`. Preserve raw replies, inventories, receipts and grading failures for your own runs. Requested model settings and response-observed identity are separate evidence.

Checker selftests and lexical routing establish mechanical coverage. They establish no model behavior improvement. A skipped judge or unavailable target remains untested. An actual failed runner remains a failure. Read repeated, controlled results before accepting an instruction change, as [tune's testing reference](../skills/productivity/tune/TESTING.md) describes.

## Toolkit contents

- `validate.mjs`, `triggers.mjs`, `behave.mjs`, `micro.mjs` and their required `lib/` modules.
- Trigger cases, behavior cases, graders, synthetic workspaces and reference inputs.
- Synthetic regression tests for routing, selective removal and the public command interface.
- Disabled example targets, public constraints and a size baseline generated from this export.

The [toolkit metadata](public-toolkit.json) identifies this optional profile. Sources and export adaptations are recorded in the separate publisher inventory. The public distribution retains the [upstream attribution](../THIRD_PARTY_NOTICES.md).
