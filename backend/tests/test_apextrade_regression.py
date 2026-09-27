import os
import uuid
import requests

BASE = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://trader-daily-tracker.preview.emergentagent.com").rstrip("/")


def test_critical_authenticated_flows():
    session = requests.Session()
    login = session.post(f"{BASE}/api/auth/login", json={"email": "qa.apextrade@example.com", "password": "ApexTrade123"})
    assert login.status_code == 200
    token = login.json()["token"]
    session.headers["Authorization"] = f"Bearer {token}"
    account = session.get(f"{BASE}/api/accounts").json()[0]
    account_id = account["id"]
    suffix = uuid.uuid4().hex[:8]
    created_ids = []
    try:
        for result, pnl in (("win", 111.0), ("loss", -55.0)):
            response = session.post(f"{BASE}/api/trades", json={"account_id": account_id, "symbol": "TEST_XAUUSD", "side": "Compra", "result": result, "pnl": pnl, "entry_date": "2099-01-01", "review": "TEST_review"})
            assert response.status_code == 200
            created_ids.append(response.json()["id"])
        trades = session.get(f"{BASE}/api/trades", params={"account_id": account_id}).json()
        assert any(t["id"] == created_ids[0] and t["result"] == "win" for t in trades)
        updated = session.patch(f"{BASE}/api/trades/{created_ids[0]}", json={"account_id": account_id, "symbol": "TEST_XAUUSD", "side": "Venta", "result": "win", "pnl": 222.0, "entry_date": "2099-01-01", "review": "TEST_updated"})
        assert updated.status_code == 200 and updated.json()["pnl"] == 222.0
        note = session.post(f"{BASE}/api/notes", json={"account_id": account_id, "text": f"TEST_note_{suffix}", "mood": "neutral"})
        assert note.status_code == 200
        note_id = note.json()["id"]
        assert session.get(f"{BASE}/api/dashboard", params={"account_id": account_id}).status_code == 200
        for period in ("daily", "weekly", "monthly"):
            pdf = session.get(f"{BASE}/api/reports/pdf", params={"account_id": account_id, "period": period})
            assert pdf.status_code == 200 and pdf.headers["content-type"].startswith("application/pdf") and pdf.content.startswith(b"%PDF")
        assert session.delete(f"{BASE}/api/notes/{note_id}", params={"account_id": account_id}).status_code == 200
    finally:
        for trade_id in created_ids:
            session.delete(f"{BASE}/api/trades/{trade_id}", params={"account_id": account_id})


def test_ai_briefing_does_not_expose_key():
    session = requests.Session()
    login = session.post(f"{BASE}/api/auth/login", json={"email": "qa.apextrade@example.com", "password": "ApexTrade123"})
    assert login.status_code == 200
    session.headers["Authorization"] = f"Bearer {login.json()['token']}"
    account_id = session.get(f"{BASE}/api/accounts").json()[0]["id"]
    response = session.post(f"{BASE}/api/ai/briefing", json={"account_id": account_id, "question": "Dame un consejo educativo breve"}, timeout=45)
    assert response.status_code == 200
    assert "EMERGENT_LLM_KEY" not in response.text and "sk-" not in response.text
    assert isinstance(response.json().get("text"), str)