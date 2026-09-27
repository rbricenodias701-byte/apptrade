"""
Tests for the PnL sign normalization bug fix.

Covers:
  - POST /api/trades normalizes pnl by result (win=+abs, loss=-abs, breakeven=0)
  - PATCH /api/trades/{id} flips sign when result changes
  - GET /api/dashboard reflects normalized totals
  - Startup migration for legacy trades (pnl_normalized!=True) — verified indirectly
    by ensuring no loss trade exists with positive pnl for the QA account after boot.
"""

import os
import time
import uuid
import requests
import pytest

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://trader-daily-tracker.preview.emergentagent.com").rstrip("/")
QA_EMAIL = "qa.apextrade@example.com"
QA_PASSWORD = "ApexTrade123"


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": QA_EMAIL, "password": QA_PASSWORD}, timeout=15)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    data = r.json()
    s.headers.update({"Authorization": f"Bearer {data['token']}"})
    s.account_id = data["account"]["id"]  # type: ignore[attr-defined]
    return s


# --- Helpers ---
def _create_trade(session, *, result: str, pnl: float, review: str = "TEST_pnl_norm"):
    r = session.post(f"{BASE_URL}/api/trades", json={
        "account_id": session.account_id,
        "symbol": "XAUUSD",
        "side": "Compra",
        "result": result,
        "pnl": pnl,
        "entry_date": "2026-01-15",
        "review": review,
    }, timeout=15)
    assert r.status_code == 200, f"create_trade failed: {r.status_code} {r.text}"
    return r.json()


def _delete_trade(session, trade_id):
    session.delete(f"{BASE_URL}/api/trades/{trade_id}", params={"account_id": session.account_id}, timeout=10)


# --- POST normalization ---
class TestCreateNormalization:
    def test_win_positive_input_stays_positive(self, session):
        t = _create_trade(session, result="win", pnl=50)
        try:
            assert t["pnl"] == 50.0
            assert t["result"] == "win"
        finally:
            _delete_trade(session, t["id"])

    def test_loss_positive_input_becomes_negative(self, session):
        t = _create_trade(session, result="loss", pnl=30)
        try:
            assert t["pnl"] == -30.0, f"expected -30.0, got {t['pnl']}"
            assert t["result"] == "loss"
        finally:
            _delete_trade(session, t["id"])

    def test_loss_already_negative_stays_negative(self, session):
        t = _create_trade(session, result="loss", pnl=-42.5)
        try:
            assert t["pnl"] == -42.5
        finally:
            _delete_trade(session, t["id"])

    def test_breakeven_forced_to_zero(self, session):
        t = _create_trade(session, result="breakeven", pnl=10)
        try:
            assert t["pnl"] == 0.0
        finally:
            _delete_trade(session, t["id"])

    def test_reported_bug_case_10_76(self, session):
        """Exact reported case: loss with pnl=10.76 → must persist as -10.76."""
        t = _create_trade(session, result="loss", pnl=10.76)
        try:
            assert t["pnl"] == -10.76

            # Verify persistence via GET
            r = session.get(f"{BASE_URL}/api/trades", params={"account_id": session.account_id}, timeout=10)
            assert r.status_code == 200
            found = next((x for x in r.json() if x["id"] == t["id"]), None)
            assert found is not None
            assert found["pnl"] == -10.76
        finally:
            _delete_trade(session, t["id"])


# --- PATCH normalization ---
class TestUpdateNormalization:
    def test_change_win_to_loss_inverts_sign(self, session):
        t = _create_trade(session, result="win", pnl=100)
        try:
            assert t["pnl"] == 100.0
            r = session.patch(f"{BASE_URL}/api/trades/{t['id']}", json={
                "account_id": session.account_id,
                "symbol": t["symbol"],
                "side": t["side"],
                "result": "loss",
                "pnl": 100,  # user provides positive
                "entry_date": t["entry_date"],
                "review": t["review"],
            }, timeout=15)
            assert r.status_code == 200
            updated = r.json()
            assert updated["pnl"] == -100.0
            assert updated["result"] == "loss"
        finally:
            _delete_trade(session, t["id"])

    def test_change_loss_to_win_inverts_sign(self, session):
        t = _create_trade(session, result="loss", pnl=75)
        try:
            assert t["pnl"] == -75.0
            r = session.patch(f"{BASE_URL}/api/trades/{t['id']}", json={
                "account_id": session.account_id,
                "symbol": t["symbol"],
                "side": t["side"],
                "result": "win",
                "pnl": 75,
                "entry_date": t["entry_date"],
                "review": t["review"],
            }, timeout=15)
            assert r.status_code == 200
            assert r.json()["pnl"] == 75.0
        finally:
            _delete_trade(session, t["id"])

    def test_change_to_breakeven_zeroes_out(self, session):
        t = _create_trade(session, result="win", pnl=200)
        try:
            r = session.patch(f"{BASE_URL}/api/trades/{t['id']}", json={
                "account_id": session.account_id,
                "symbol": t["symbol"],
                "side": t["side"],
                "result": "breakeven",
                "pnl": 200,
                "entry_date": t["entry_date"],
                "review": t["review"],
            }, timeout=15)
            assert r.status_code == 200
            assert r.json()["pnl"] == 0.0
        finally:
            _delete_trade(session, t["id"])


# --- Dashboard totals reflect normalized pnl ---
class TestDashboardTotals:
    def test_dashboard_subtracts_losses(self, session):
        w = _create_trade(session, result="win", pnl=50)
        l_ = _create_trade(session, result="loss", pnl=30)
        b = _create_trade(session, result="breakeven", pnl=10)
        try:
            # Baseline sanity: individual trade stored values
            assert w["pnl"] == 50.0
            assert l_["pnl"] == -30.0
            assert b["pnl"] == 0.0

            r = session.get(f"{BASE_URL}/api/dashboard", params={"account_id": session.account_id}, timeout=10)
            assert r.status_code == 200
            d = r.json()

            # Sum over ALL trades in account (there may be pre-existing ones), but the DELTA
            # contributed by our 3 test trades must be exactly 20 (50 - 30 + 0).
            # Re-list trades and recompute expected total for a stronger assertion.
            r2 = session.get(f"{BASE_URL}/api/trades", params={"account_id": session.account_id}, timeout=10)
            assert r2.status_code == 200
            expected_total = round(sum(float(t["pnl"]) for t in r2.json()), 2)
            assert round(d["total_pnl"], 2) == expected_total

            # Extra: no trade with result=loss should have pnl > 0
            for t in r2.json():
                if t["result"] == "loss":
                    assert t["pnl"] <= 0, f"Loss trade with positive pnl still present: {t}"
                if t["result"] == "breakeven":
                    assert t["pnl"] == 0.0
        finally:
            for tid in (w["id"], l_["id"], b["id"]):
                _delete_trade(session, tid)


# --- Startup migration verification ---
class TestStartupMigration:
    def test_no_loss_trade_has_positive_pnl(self, session):
        """After the startup migration ran, no historical loss trade may still have pnl>0."""
        r = session.get(f"{BASE_URL}/api/trades", params={"account_id": session.account_id}, timeout=10)
        assert r.status_code == 200
        bad = [t for t in r.json() if t["result"] == "loss" and t["pnl"] > 0]
        assert bad == [], f"Loss trades with positive pnl still exist (migration failed): {bad}"

    def test_no_breakeven_trade_has_nonzero_pnl(self, session):
        r = session.get(f"{BASE_URL}/api/trades", params={"account_id": session.account_id}, timeout=10)
        assert r.status_code == 200
        bad = [t for t in r.json() if t["result"] == "breakeven" and t["pnl"] != 0]
        assert bad == [], f"Breakeven trades with non-zero pnl still exist: {bad}"

    def test_no_win_trade_has_negative_pnl(self, session):
        r = session.get(f"{BASE_URL}/api/trades", params={"account_id": session.account_id}, timeout=10)
        assert r.status_code == 200
        bad = [t for t in r.json() if t["result"] == "win" and t["pnl"] < 0]
        assert bad == [], f"Win trades with negative pnl still exist: {bad}"
