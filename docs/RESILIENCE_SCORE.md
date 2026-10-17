# Resilience score availability (local repair)

The local policy `correction-survivors-v1-partial-pillars` calculates each of
the five pillars only when that pillar's inputs are known. A missing
`tight_closes_count` withholds Structure/tightness, while independently known
leadership, relative-strength, trend and liquidity pillars remain visible.

The total is still null unless all five pillars are available. It is never a
sum of only the known pillars, and missing observations are never replaced by
zero. Known zero/false inputs remain valid. Complete-input formulas, weights,
rounding of the total and action-state precedence are unchanged. A future-dated
benchmark still withholds all scores.

The evidence includes:

- `score_pillars`: the five original nullable fields, now independently available.
- `metrics.score_missing_inputs`: a map from unavailable pillars to missing
  input names, or `future_benchmark_date` when dates invalidate the score.
- `data_availability.resilience_score`: `available` or `incomplete`.

The shared evidence drawer shows the available count, known pillar values and
missing-input explanations. Event Risk and Extended can still be known when
the total score is incomplete. Displayed pillar values use one decimal place
at most; stored values are unchanged.

The JSON shape retains schema version 1; its existing nullable pillar fields
can represent partial evidence. The new policy identifier distinguishes this
behavior from the old all-or-nothing calculation. Domain and HTTP readers
accept both policy versions and preserve the original identifier when reading
and reserializing old rows. Legacy `correction-survivors-v1` projections still
require all-null pillars when the total is null.

Previously published snapshots are not rewritten or rescored by the browser.
Old all-null rows remain readable and explain that a new scan is needed for
individual pillars. Deploying the updated backend and frontend and generating
new scan results is necessary to publish the new breakdown. Upstream's public
GitHub Pages site does not contain this local repair.

This repair does not define a new tight-closes metric, invent missing price
history, perform a database backfill or establish data-provider coverage.
