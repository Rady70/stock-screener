import json
import shutil
import subprocess
from pathlib import Path

import pytest

from stockscreen_mcp.screens import evaluate_condition


CASES = [
    (value, False) for value in ("n/a", "", " ", "NaN", "Infinity", "1e400", "1e-400", "0x50", "1_0", True, [], {})
] + [(0, True), ("0", True), (80, True), ("8e1", True), ("-1", False), (101, False)]


@pytest.mark.parametrize("value,expected", CASES)
def test_numeric_range_excludes_invalid_values_without_losing_zero(value, expected):
    assert evaluate_condition({"rs_rating": value}, {
        "field": "rs_rating", "kind": "range", "min": 0, "max": 100,
    }) is expected


def test_frontend_and_mcp_share_numeric_validation():
    node = shutil.which("node")
    if not node:
        pytest.skip("Node is required for the real frontend evaluator comparison")
    evaluator = Path(__file__).resolve().parents[2] / "frontend/src/features/scan/filterExpressionEvaluator.js"
    script = f"""
      import {{ evaluateCondition }} from {json.dumps(evaluator.as_uri())};
      const cases = {json.dumps(CASES)};
      const condition = {{field: 'rs_rating', kind: 'range', min: 0, max: 100}};
      console.log(JSON.stringify(cases.map(([value]) => evaluateCondition({{rs_rating: value}}, condition))));
    """
    output = subprocess.run([node, "--input-type=module", "-e", script], check=True, capture_output=True, text=True)
    assert json.loads(output.stdout) == [expected for _, expected in CASES]


@pytest.mark.parametrize("value", [float("nan"), float("inf"), -float("inf")])
def test_nonfinite_observations_never_pass_a_numeric_range(value):
    assert not evaluate_condition({"volume": value}, {"field": "volume", "kind": "range", "min": 0})


def test_listing_only_volume_sentinel_remains_an_explicit_exception():
    row = {"scan_mode": "listing_only"}
    assert evaluate_condition(row, {"field": "listing_aware_volume", "kind": "range", "min": 1e8})
    assert not evaluate_condition(row, {"field": "listing_aware_volume", "kind": "range", "max": 1e8})
