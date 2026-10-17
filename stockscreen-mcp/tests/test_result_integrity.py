"""Regression cases for data context lost at the public MCP boundary."""
import copy

import pytest
from mcp import Client

from stockscreen_mcp import server
from stockscreen_mcp.data import MANIFEST_TTL_SECONDS

pytestmark = [pytest.mark.anyio, pytest.mark.usefixtures("use_fake_data")]


async def call(tool, **arguments):
    async with Client(server.mcp) as client:
        return await client.call_tool(tool, arguments)


@pytest.mark.parametrize("tool,arguments", [
    ("list_screens", {}),
    ("run_screen", {"screen": "minervini"}),
    ("get_stock", {"symbol": "AAA"}),
    ("market_overview", {}),
    ("group_rankings", {}),
])
async def test_each_result_carries_its_publication_status(fake_publish, tool, arguments):
    fake_publish.manifest["markets"]["US"]["publication"]["state"] = "stale"
    response = await call(tool, **arguments)
    assert not response.is_error
    result = response.structured_content
    assert result["status"] == "late"
    assert result["publication"]["state"] == "stale"
    assert result["snapshot_id"] == "g/1/"
    assert result["source"] == "https://example.test/static-data/"


async def test_stock_and_screen_keep_quality_fields_nulls_and_zero(fake_publish):
    row = fake_publish.files["g/1/markets/us/scan/chunks/chunk-0001.json"]["rows"][0]
    row.update({
        "eps_growth_qq": None, "eps_growth_yy": 0.0, "data_status": "complete",
        "growth_metric_basis": "unavailable", "growth_reporting_cadence": "insufficient_history",
        "market_rs_run_id": 9, "rs_formula_version": "test-formula", "rs_universe_size": 5,
        "screeners_run": ["minervini", "canslim"], "unavailable_screeners": ["ipo"],
    })
    expected = {key: copy.deepcopy(row[key]) for key in (
        "field_availability", "data_status", "growth_metric_basis", "growth_reporting_cadence",
        "market_rs_run_id", "rs_formula_version", "rs_universe_size", "screeners_run",
        "unavailable_screeners", "eps_growth_qq", "eps_growth_yy",
    )}
    stock = (await call("get_stock", symbol="AAA")).structured_content
    screen = (await call("run_screen", screen="minervini")).structured_content
    for result in (stock, screen["rows"][0]):
        assert {key: result[key] for key in expected} == expected
    assert stock["methodology"]["canslim"]["annual_earnings_basis"] == "year_over_year_proxy"


@pytest.mark.parametrize("publication", [None, {"state": "stale", "session_date": "2026-10-09"}])
async def test_fresh_only_screen_rejects_late_or_unknown_without_hiding_default_results(fake_publish, publication):
    fake_publish.manifest["markets"]["US"]["publication"] = publication
    response = await call("run_screen", screen="minervini", require_current=True)
    assert response.is_error
    assert "current publication" in response.content[0].text
    allowed = await call("run_screen", screen="minervini")
    assert not allowed.is_error
    assert allowed.structured_content["total_matches"] == 2
    assert allowed.structured_content["status"] in {"late", "unknown"}


async def test_mismatched_data_date_is_not_reported_as_current(fake_publish):
    fake_publish.files["g/1/markets/us/scan/manifest.json"]["as_of_date"] = "2026-10-08"
    result = (await call("run_screen", screen="minervini")).structured_content
    assert result["status"] == "unknown"
    assert result["date_coherence"] == "mismatch"


async def test_publication_date_disagreement_is_unknown(fake_publish):
    fake_publish.manifest["markets"]["US"]["publication"]["session_date"] = "2026-10-08"
    result = (await call("run_screen", screen="minervini")).structured_content
    assert result["status"] == "unknown" and result["date_coherence"] == "mismatch"


async def test_stock_preserves_raw_null_without_applying_screen_alias_fallback(fake_publish):
    row = fake_publish.files["g/1/markets/us/scan/chunks/chunk-0001.json"]["rows"][0]
    row.update({"market_cap_usd": None, "market_cap": 1000, "currency": "USD"})
    result = (await call("get_stock", symbol="AAA")).structured_content
    assert result["market_cap_usd"] is None
    assert result["market_cap"] == 1000


async def test_scan_metadata_stays_with_the_generation_loaded(fake_publish, clock):
    old_files = copy.deepcopy(fake_publish.files)

    def replace(url):
        if url.endswith("g/1/markets/us/scan/manifest.json"):
            fake_publish.on_fetch = None
            clock.now += MANIFEST_TTL_SECONDS + 1
            fake_publish.republish("g/2/")
            fake_publish.manifest["markets"]["US"]["publication"]["state"] = "stale"
            fake_publish.files.update(old_files)

    fake_publish.on_fetch = replace
    result = (await call("run_screen", screen="minervini")).structured_content
    assert result["snapshot_id"] == "g/1/"
    assert result["status"] == "current"


async def test_overview_does_not_mix_two_publications(fake_publish, clock):
    old_files = copy.deepcopy(fake_publish.files)

    def replace(url):
        if url.endswith("g/1/markets/us/home.json"):
            fake_publish.on_fetch = None
            clock.now += MANIFEST_TTL_SECONDS + 1
            fake_publish.republish("g/2/")
            fake_publish.files["g/2/markets/us/breadth.json"]["payload"]["current"]["stocks_up_4pct"] = 900
            fake_publish.files.update(old_files)

    fake_publish.on_fetch = replace
    result = (await call("market_overview")).structured_content
    assert result["breadth"]["latest"]["stocks_up_4pct"] == 29
    assert result["snapshot_id"] == "g/1/"
