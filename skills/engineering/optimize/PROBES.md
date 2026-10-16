# Numerical algorithm probes

This procedure serves two skills: `optimize` for an output-preserving optimization, and `tdd` for an intentional model or solver change. Read the project's current programme rulings before choosing gates, and preserve its format-version and state-ownership contracts; a generic workflow does not reactivate a deferred corpus or performance programme.

## Choose the contract

An output-preserving optimization must preserve the agreed observable outputs and beat measured cost noise. For a corrected implementation, compare against that corrected baseline. An intentional physics, calibration, or numerical-scheme change states its new physical or numerical contract before coding, then needs independently justified accuracy and invariant gates plus before/after measurements; matching the old output (a golden master) is not its acceptance criterion. Keep deterministic replay and checkpoint/resume guarantees separate from old-output equality. A requested model change is built test-first (the `tdd` skill) through this probe, not through `optimize`'s identical-output loop.

## Probe before promotion

1. Measure unchanged code on the actual source revision and host. Record inputs, seed, resolutions, workload, command, timing, and provenance before editing production.
2. Duplicate the algorithm in an isolated runnable probe using the real data structures. For output-preserving work, keep an unchanged test-only reference oracle and compare fresh inputs under the agreed equality contract, including floating-point bit patterns when exact equality is required.
3. Have the probe print a verdict for every design acceptance criterion: structure, conservation or closure, scaling, accuracy, determinism, and a separately stated cost budget. Derive tolerances independently of the state they validate.
4. Plant reversible broken variants that reach each gate and make it fail for the intended reason (a wrong predicate, missing evolution, a dropped guard, incorrect scaling), then undo every one. For physical models where resolution consistency is part of the contract, compare evolved results, inventories, and fluxes across at least two resolutions with the same physical geometry, forcing, and elapsed time; check refinement of separate solver and geometry grids separately.
5. Iterate in the duplicate. Record rejected schemes, unstable steps, biased initialization, and invalid gate assumptions as findings. Correct the design when evidence disproves it.
6. Promote only after the probe passes, then rerun it through production and follow the project's verification ladder from cheap gates to fixed panels/corpus and replay/resume checks. Preserve the probe as a reproducible instrument when it is standing evidence.

Record measurements, source revision, outcome, and ruling together, including negative results. Re-baselining an intentional behavior change records before/after pairs; widening an acceptance band to hide a downstream failure is not a repair. Validate paired artifact provenance before comparing baselines; regenerate both sides when the accepted baseline is incompatible with the candidate's base.
