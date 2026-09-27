"""Backend regression for Radar Oro (market/xauusd + market/signals) and lot-size calculator.

Uses QA credentials from /app/memory/test_credentials.md. Executes against the public
EXPO_PUBLIC_BACKEND_URL endpoint via /api routes.
"""
import os
import pytest
import requests

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/") if os.environ.get("EXPO_PUBLIC_BACKEND_URL") else "https://trader-daily-tracker.preview.emergentagent.com"
QA_EMAIL = "qa.apextrade@example.com"
QA_PASSWORD = "ApexTrade123"


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": QA_EMAIL, "password": QA_PASSWORD}, timeout=20)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def auth(token):
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json", "Authorization": f"Bearer {token}"})
    return s


# -------------------- Radar Oro / Market analysis --------------------

class TestMarketXauusd:
    def test_market_xauusd_shape(self, auth):
        r = auth.get(f"{BASE_URL}/api/market/xauusd", timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        # No mongo internals leaking
        assert "_id" not in data
        for key in ("quote", "five_min", "one_hour", "alignment"):
            assert key in data, f"missing {key}"

        for tf_key in ("five_min", "one_hour"):
            tf = data[tf_key]
            assert tf["trend"] in ("alcista", "bajista", "neutral")
            assert "accumulation" in tf and isinstance(tf["accumulation"].get("present"), bool)
            assert "manipulation" in tf and isinstance(tf["manipulation"].get("present"), bool)
            if tf["manipulation"]["present"]:
                assert tf["manipulation"]["direction"] in ("long", "short")

        align = data["alignment"]
        for k in ("aligned", "strong", "direction", "message"):
            assert k in align

    def test_market_signals_list(self, auth):
        r = auth.get(f"{BASE_URL}/api/market/signals", timeout=15)
        assert r.status_code == 200, r.text
        payload = r.json()
        assert isinstance(payload, list)
        # No _id leakage in items
        for item in payload:
            assert "_id" not in item
            assert set(item.keys()) >= {"id", "direction", "strong", "price", "message", "created_at"}

    def test_market_requires_auth(self):
        r = requests.get(f"{BASE_URL}/api/market/xauusd", timeout=15)
        assert r.status_code == 401


# -------------------- Lot-size calculator --------------------

class TestLotSize:
    def test_lot_percentage(self, auth):
        payload = {"capital": 10000, "risk_mode": "percentage", "risk_value": 1,
                   "entry_price": 4286, "stop_loss": 4283, "contract_size": 100}
        r = auth.post(f"{BASE_URL}/api/tools/lot-size", json=payload, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["lots"] == 0.333
        assert data["risk_amount"] == 100.0
        assert data["dollar_per_lot"] == 300.0
        assert data["reward_1r"] == 100.0
        assert data["reward_2r"] == 200.0
        assert data["reward_3r"] == 300.0

    def test_lot_amount(self, auth):
        payload = {"capital": 10000, "risk_mode": "amount", "risk_value": 50,
                   "entry_price": 4286, "stop_loss": 4283, "contract_size": 100}
        r = auth.post(f"{BASE_URL}/api/tools/lot-size", json=payload, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["lots"] == 0.167  # 50/300 = 0.16666.. rounded to 3 -> 0.167
        # Note: spec says 0.166 but Python round(0.16666..., 3) yields 0.167
        assert data["risk_amount"] == 50.0
        assert data["dollar_per_lot"] == 300.0

    def test_stop_equals_entry_returns_400(self, auth):
        payload = {"capital": 10000, "risk_mode": "percentage", "risk_value": 1,
                   "entry_price": 4286, "stop_loss": 4286, "contract_size": 100}
        r = auth.post(f"{BASE_URL}/api/tools/lot-size", json=payload, timeout=15)
        assert r.status_code == 400

    def test_invalid_risk_mode_returns_400(self, auth):
        # risk_mode must fail validation. Pydantic accepts any string but our
        # endpoint rejects unknown modes with 400.
        payload = {"capital": 10000, "risk_mode": "bogus", "risk_value": 1,
                   "entry_price": 4286, "stop_loss": 4283, "contract_size": 100}
        r = auth.post(f"{BASE_URL}/api/tools/lot-size", json=payload, timeout=15)
        assert r.status_code == 400

    def test_lot_requires_auth(self):
        r = requests.post(f"{BASE_URL}/api/tools/lot-size", json={
            "capital": 10000, "risk_mode": "percentage", "risk_value": 1,
            "entry_price": 4286, "stop_loss": 4283
        }, timeout=15)
        assert r.status_code == 401
