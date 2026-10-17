"""Exercise both supported feature-store writers; SQLite is not PostgreSQL index proof."""
import copy
import importlib.util
from datetime import date
from pathlib import Path

import pytest

from app.domain.feature_store.models import FeatureRowWrite
from app.infra.db.models.feature_store import FeatureRun, StockFeatureDaily, NUMERIC_DETAILS_FIELDS
from app.infra.db.repositories.feature_store_repo import SqlFeatureStoreRepository


@pytest.mark.parametrize("writer", ["orm", "core"])
@pytest.mark.parametrize("field", ["rs_rating", "stage", "ipo_score"])
@pytest.mark.parametrize("value", ["n/a", "", "1e400", "1e-400", True])
def test_invalid_numeric_detail_is_missing_with_original_evidence(db_session, writer, field, value):
    details = {field: value, "rs_rating_1m": 0, "company_name": "Example",
               "setup_engine": {"explain": {"source": "kept"}}}
    original = copy.deepcopy(details)
    db_session.add(FeatureRun(id=1, as_of_date=date(2026, 10, 16), run_type="daily_snapshot", status="completed"))
    db_session.flush()
    if writer == "orm":
        db_session.add(StockFeatureDaily(run_id=1, symbol="TEST", as_of_date=date(2026, 10, 16), details_json=details))
        db_session.flush()
    else:
        SqlFeatureStoreRepository(db_session).upsert_snapshot_rows(1, [FeatureRowWrite(
            symbol="TEST", as_of_date=date(2026, 10, 16), composite_score=50,
            overall_rating=2, passes_count=1, details=details,
        )])
    db_session.expire_all()
    row = db_session.query(StockFeatureDaily).one()
    assert row.details_json[field] is None
    assert row.table_details_json[field] is None
    assert row.details_json["numeric_input_errors"][field]["value_repr"] == repr(value)
    assert row.details_json["field_availability"][field]["reason_code"] == "invalid_numeric_value"
    assert row.details_json["rs_rating_1m"] == 0
    assert row.details_json["setup_engine"]["explain"] == {"source": "kept"}
    assert details == original


def test_corrected_value_clears_current_error_without_mutating_input(db_session):
    db_session.add(FeatureRun(id=1, as_of_date=date(2026, 10, 16), run_type="daily_snapshot", status="completed"))
    row = StockFeatureDaily(run_id=1, symbol="TEST", as_of_date=date(2026, 10, 16), details_json={"rs_rating": "n/a"})
    db_session.add(row)
    db_session.flush()
    row.details_json = {**row.details_json, "rs_rating": "80"}
    db_session.flush()
    assert row.rs_rating == 80
    assert "rs_rating" not in row.details_json.get("numeric_input_errors", {})
    assert "rs_rating" not in row.details_json.get("field_availability", {})


def test_numeric_write_guard_covers_every_table_details_float_index():
    migration = Path(__file__).parents[2] / "alembic/versions/20261011_0064_feature_table_details.py"
    spec = importlib.util.spec_from_file_location("numeric_index_contract", migration)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    assert set(module._NUMERIC_FIELDS) <= NUMERIC_DETAILS_FIELDS
