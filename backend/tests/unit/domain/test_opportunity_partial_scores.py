"""A missing structure metric must not erase independently known evidence."""
from copy import deepcopy
from datetime import date

import pytest

from app.domain.scanning.opportunity_state import (
    evaluate_opportunity_state, parse_opportunity_projection, serialize_opportunity_projection,
)
from app.schemas.scanning import ScanResultItem
from app.schemas.user_watchlist import WatchlistStewardshipItem
from tests.unit.domain.test_opportunity_state import complete_inputs


CURRENT_POLICY = "correction-survivors-v1-partial-pillars"


@pytest.mark.parametrize("changes,state", [({"earnings_soon": True}, "event_risk"), ({"extended": True}, "extended")])
def test_missing_tight_closes_retains_other_pillars_and_risk_state(changes, state):
    result = evaluate_opportunity_state(complete_inputs(tight_closes_count=None, **changes))
    assert result.action_state.value == state
    assert result.resilience_score is None
    assert dict(result.score_pillars) == {
        "benchmark_leadership": 20.0, "multi_horizon_rs": 17.0,
        "trend_integrity": 20.0, "structure_tightness": None, "liquidity_freshness": 20.0,
    }
    assert result.metrics["score_missing_inputs"] == {"structure_tightness": ["tight_closes_count"]}


@pytest.mark.parametrize("changes,missing_pillar", [
    ({"benchmark_relative_return_65d": None}, "benchmark_leadership"),
    ({"rs_rating_1m": None}, "multi_horizon_rs"),
    ({"invalidation_evidence_available": False}, "trend_integrity"),
    ({"setup_payload_available": False}, "structure_tightness"),
    ({"liquidity_available": False}, "liquidity_freshness"),
])
def test_missing_input_blocks_only_its_own_pillar(changes, missing_pillar):
    result = evaluate_opportunity_state(complete_inputs(**changes))
    assert result.resilience_score is None
    assert [key for key, value in result.score_pillars.items() if value is None] == [missing_pillar]
    assert list(result.metrics["score_missing_inputs"]) == [missing_pillar]


def test_known_zero_and_false_inputs_remain_valid_scores():
    result = evaluate_opportunity_state(complete_inputs(
        benchmark_relative_return_65d=0, rs_line_new_high=False, rs_line_blue_dot=False,
        rs_rating_1m=0, rs_rating_3m=0, pattern_primary=None, squeeze=False,
        tight_closes_count=0, quiet_days_count=0, volume_vs_50d=1,
        liquidity_passes=False, feature_status="partial", is_scannable=False,
    ))
    assert result.score_pillars["structure_tightness"] == 0
    assert result.score_pillars["benchmark_leadership"] == 0
    assert result.score_pillars["multi_horizon_rs"] == 0
    assert result.score_pillars["liquidity_freshness"] == 0
    assert result.resilience_score == 20
    assert result.metrics["score_missing_inputs"] == {}


def test_future_benchmark_still_blocks_scores_with_an_explicit_reason():
    result = evaluate_opportunity_state(complete_inputs(benchmark_as_of_date=date(2026, 8, 22)))
    assert result.resilience_score is None
    assert all(value is None for value in result.score_pillars.values())
    assert all(reasons == ["future_benchmark_date"] for reasons in result.metrics["score_missing_inputs"].values())


@pytest.mark.parametrize("model,extras", [(ScanResultItem, {"rating": "Watch"}),
                                          (WatchlistStewardshipItem, {"status": "unchanged", "reasons": []})])
def test_partial_projection_survives_domain_and_http_boundaries(model, extras):
    projection = serialize_opportunity_projection(evaluate_opportunity_state(complete_inputs(tight_closes_count=None)))
    assert projection["opportunity_state"]["policy_version"] == CURRENT_POLICY
    assert serialize_opportunity_projection(parse_opportunity_projection(projection)) == projection
    response = model.model_validate({"symbol": "PARTIAL", **extras, **projection}).model_dump(mode="json")
    assert response["opportunity_state"]["score_pillars"]["multi_horizon_rs"] == 17
    assert response["opportunity_state"]["score_pillars"]["structure_tightness"] is None
    assert response["resilience_score"] is None


@pytest.mark.parametrize("scored", [True, False])
def test_legacy_projection_roundtrip_preserves_version_and_original_values(scored):
    projection = serialize_opportunity_projection(evaluate_opportunity_state(complete_inputs()))
    projection["opportunity_state"]["policy_version"] = "correction-survivors-v1"
    if not scored:
        projection["resilience_score"] = None
        projection["opportunity_state"]["score_pillars"] = dict.fromkeys(projection["opportunity_state"]["score_pillars"])
    original = deepcopy(projection)
    restored = parse_opportunity_projection(projection)
    assert serialize_opportunity_projection(restored) == original
    assert projection == original


def test_legacy_partial_pillars_still_rejected():
    projection = serialize_opportunity_projection(evaluate_opportunity_state(complete_inputs(tight_closes_count=None)))
    projection["opportunity_state"]["policy_version"] = "correction-survivors-v1"
    with pytest.raises(ValueError, match="all null"):
        parse_opportunity_projection(projection)


def test_complete_pillars_require_a_complete_total():
    projection = serialize_opportunity_projection(evaluate_opportunity_state(complete_inputs()))
    projection["resilience_score"] = None
    with pytest.raises(ValueError, match="total"):
        parse_opportunity_projection(projection)
