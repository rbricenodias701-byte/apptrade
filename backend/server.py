from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional
import logging
import os
import uuid

import bcrypt
import jwt
import requests
from dotenv import load_dotenv
from emergentintegrations.llm.chat import LlmChat, TextDelta, StreamDone, UserMessage
from fastapi import APIRouter, Depends, FastAPI, Header, HTTPException, Query, Response
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, EmailStr, Field
from starlette.middleware.cors import CORSMiddleware

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]
JWT_SECRET = os.environ.get("JWT_SECRET", "change-this-trading-journal-secret")

app = FastAPI(title="ApexTrade Journal API")
api_router = APIRouter(prefix="/api")
logger = logging.getLogger(__name__)


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def make_id() -> str:
    return str(uuid.uuid4())


class RegisterBody(BaseModel):
    name: str = Field(min_length=2, max_length=60)
    email: EmailStr
    password: str = Field(min_length=6, max_length=120)


class LoginBody(BaseModel):
    email: EmailStr
    password: str


class AccountBody(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    initial_capital: float = Field(ge=0)
    currency: str = Field(default="USD", min_length=1, max_length=8)
    target_mode: str = Field(default="amount")
    daily_target: float = Field(default=100, ge=0)
    monthly_target: float = Field(default=1000, ge=0)
    stop_after_losses: int = Field(default=2, ge=1, le=10)


class AccountUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=60)
    initial_capital: Optional[float] = Field(default=None, ge=0)
    currency: Optional[str] = Field(default=None, min_length=1, max_length=8)
    target_mode: Optional[str] = None
    daily_target: Optional[float] = Field(default=None, ge=0)
    monthly_target: Optional[float] = Field(default=None, ge=0)
    stop_after_losses: Optional[int] = Field(default=None, ge=1, le=10)


class TradeBody(BaseModel):
    account_id: str
    symbol: str = Field(default="XAUUSD", min_length=1, max_length=20)
    side: str = Field(default="Compra")
    result: str = Field(default="win")
    pnl: float
    entry_date: str
    review: str = Field(default="", max_length=1000)


class NoteBody(BaseModel):
    account_id: str
    text: str = Field(min_length=1, max_length=1000)
    mood: str = Field(default="neutral")


class AiRequest(BaseModel):
    account_id: str
    question: str = Field(default="Dame un consejo práctico para mi disciplina de trading.", max_length=600)


def token_for(user_id: str) -> str:
    return jwt.encode({"sub": user_id, "exp": datetime.now(timezone.utc) + timedelta(days=30)}, JWT_SECRET, algorithm="HS256")


async def current_user(authorization: Optional[str] = Header(default=None)) -> Dict[str, Any]:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Sesión requerida")
    try:
        payload = jwt.decode(authorization.split(" ", 1)[1], JWT_SECRET, algorithms=["HS256"])
        user_id = payload.get("sub")
    except jwt.PyJWTError as exc:
        raise HTTPException(status_code=401, detail="Sesión inválida") from exc
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(status_code=401, detail="Usuario no encontrado")
    return user


async def owned_account(account_id: str, user: Dict[str, Any]) -> Dict[str, Any]:
    account = await db.accounts.find_one({"id": account_id, "user_id": user["id"]}, {"_id": 0})
    if not account:
        raise HTTPException(status_code=404, detail="Cuenta no encontrada")
    return account


@api_router.get("/health")
async def health() -> Dict[str, str]:
    return {"status": "ok"}


@api_router.post("/auth/register")
async def register(body: RegisterBody) -> Dict[str, Any]:
    email = body.email.lower()
    if await db.users.find_one({"email": email}, {"_id": 0, "id": 1}):
        raise HTTPException(status_code=409, detail="Ese correo ya está registrado")
    user_id = make_id()
    user = {
        "id": user_id,
        "name": body.name.strip(),
        "email": email,
        "password_hash": bcrypt.hashpw(body.password.encode(), bcrypt.gensalt()).decode(),
        "created_at": now_iso(),
    }
    await db.users.insert_one(dict(user))
    account = {
        "id": make_id(),
        "user_id": user_id,
        "name": "Cuenta principal",
        "initial_capital": 10000.0,
        "currency": "USD",
        "target_mode": "amount",
        "daily_target": 100.0,
        "monthly_target": 1000.0,
        "stop_after_losses": 2,
        "created_at": now_iso(),
    }
    await db.accounts.insert_one(dict(account))
    return {"token": token_for(user_id), "user": {"id": user_id, "name": user["name"], "email": email}, "account": account}


@api_router.post("/auth/login")
async def login(body: LoginBody) -> Dict[str, Any]:
    user = await db.users.find_one({"email": body.email.lower()}, {"_id": 0})
    if not user or not bcrypt.checkpw(body.password.encode(), user["password_hash"].encode()):
        raise HTTPException(status_code=401, detail="Correo o contraseña incorrectos")
    account = await db.accounts.find_one({"user_id": user["id"]}, {"_id": 0})
    return {"token": token_for(user["id"]), "user": {"id": user["id"], "name": user["name"], "email": user["email"]}, "account": account}


@api_router.get("/me")
async def me(user: Dict[str, Any] = Depends(current_user)) -> Dict[str, Any]:
    return user


@api_router.get("/accounts")
async def list_accounts(user: Dict[str, Any] = Depends(current_user)) -> List[Dict[str, Any]]:
    return await db.accounts.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", 1).to_list(100)


@api_router.post("/accounts")
async def create_account(body: AccountBody, user: Dict[str, Any] = Depends(current_user)) -> Dict[str, Any]:
    if body.target_mode not in {"amount", "percentage"}:
        raise HTTPException(status_code=400, detail="Modo de meta inválido")
    account = {"id": make_id(), "user_id": user["id"], **body.model_dump(), "created_at": now_iso()}
    await db.accounts.insert_one(dict(account))
    return account


@api_router.patch("/accounts/{account_id}")
async def update_account(account_id: str, body: AccountUpdate, user: Dict[str, Any] = Depends(current_user)) -> Dict[str, Any]:
    await owned_account(account_id, user)
    changes = {k: v for k, v in body.model_dump().items() if v is not None}
    if changes.get("target_mode") and changes["target_mode"] not in {"amount", "percentage"}:
        raise HTTPException(status_code=400, detail="Modo de meta inválido")
    if changes:
        await db.accounts.update_one({"id": account_id}, {"$set": changes})
    return await owned_account(account_id, user)


@api_router.delete("/accounts/{account_id}")
async def delete_account(account_id: str, user: Dict[str, Any] = Depends(current_user)) -> Dict[str, bool]:
    accounts = await db.accounts.count_documents({"user_id": user["id"]})
    if accounts <= 1:
        raise HTTPException(status_code=400, detail="Debes conservar al menos una cuenta")
    await owned_account(account_id, user)
    await db.accounts.delete_one({"id": account_id})
    await db.trades.delete_many({"account_id": account_id})
    await db.notes.delete_many({"account_id": account_id})
    return {"ok": True}


@api_router.get("/trades")
async def list_trades(account_id: str, user: Dict[str, Any] = Depends(current_user)) -> List[Dict[str, Any]]:
    await owned_account(account_id, user)
    return await db.trades.find({"account_id": account_id}, {"_id": 0}).sort([("entry_date", -1), ("created_at", -1)]).to_list(500)


@api_router.post("/trades")
async def create_trade(body: TradeBody, user: Dict[str, Any] = Depends(current_user)) -> Dict[str, Any]:
    await owned_account(body.account_id, user)
    if body.result not in {"win", "loss", "breakeven"}:
        raise HTTPException(status_code=400, detail="Resultado inválido")
    trade = {"id": make_id(), **body.model_dump(), "created_at": now_iso()}
    await db.trades.insert_one(dict(trade))
    return trade


@api_router.patch("/trades/{trade_id}")
async def update_trade(trade_id: str, body: TradeBody, user: Dict[str, Any] = Depends(current_user)) -> Dict[str, Any]:
    await owned_account(body.account_id, user)
    changes = body.model_dump()
    await db.trades.update_one({"id": trade_id, "account_id": body.account_id}, {"$set": changes})
    result = await db.trades.find_one({"id": trade_id, "account_id": body.account_id}, {"_id": 0})
    if not result:
        raise HTTPException(status_code=404, detail="Operación no encontrada")
    return result


@api_router.delete("/trades/{trade_id}")
async def delete_trade(trade_id: str, account_id: str, user: Dict[str, Any] = Depends(current_user)) -> Dict[str, bool]:
    await owned_account(account_id, user)
    result = await db.trades.delete_one({"id": trade_id, "account_id": account_id})
    if not result.deleted_count:
        raise HTTPException(status_code=404, detail="Operación no encontrada")
    return {"ok": True}


@api_router.get("/dashboard")
async def dashboard(account_id: str, user: Dict[str, Any] = Depends(current_user)) -> Dict[str, Any]:
    account = await owned_account(account_id, user)
    trades = await db.trades.find({"account_id": account_id}, {"_id": 0}).sort("entry_date", -1).to_list(500)
    today = date.today().isoformat()
    month_prefix = today[:7]
    daily = [t for t in trades if t["entry_date"].startswith(today)]
    monthly = [t for t in trades if t["entry_date"].startswith(month_prefix)]
    total_pnl = sum(float(t["pnl"]) for t in trades)
    daily_pnl = sum(float(t["pnl"]) for t in daily)
    monthly_pnl = sum(float(t["pnl"]) for t in monthly)
    losses = 0
    for trade in trades:
        if trade["result"] == "loss":
            losses += 1
        else:
            break
    target_daily = account["daily_target"] if account["target_mode"] == "amount" else account["initial_capital"] * account["daily_target"] / 100
    target_monthly = account["monthly_target"] if account["target_mode"] == "amount" else account["initial_capital"] * account["monthly_target"] / 100
    return {
        "account": account,
        "capital": float(account["initial_capital"]) + total_pnl,
        "total_pnl": total_pnl,
        "daily_pnl": daily_pnl,
        "monthly_pnl": monthly_pnl,
        "daily_target": target_daily,
        "monthly_target": target_monthly,
        "daily_progress": round((daily_pnl / target_daily) * 100, 1) if target_daily else 0,
        "monthly_progress": round((monthly_pnl / target_monthly) * 100, 1) if target_monthly else 0,
        "trades_count": len(trades),
        "today_trades": len(daily),
        "consecutive_losses": losses,
        "should_stop": losses >= account["stop_after_losses"],
        "recent_trades": trades[:5],
    }


@api_router.get("/notes")
async def list_notes(account_id: str, user: Dict[str, Any] = Depends(current_user)) -> List[Dict[str, Any]]:
    await owned_account(account_id, user)
    return await db.notes.find({"account_id": account_id}, {"_id": 0}).sort("created_at", -1).to_list(100)


@api_router.post("/notes")
async def create_note(body: NoteBody, user: Dict[str, Any] = Depends(current_user)) -> Dict[str, Any]:
    await owned_account(body.account_id, user)
    note = {"id": make_id(), **body.model_dump(), "created_at": now_iso()}
    await db.notes.insert_one(dict(note))
    return note


@api_router.delete("/notes/{note_id}")
async def delete_note(note_id: str, account_id: str, user: Dict[str, Any] = Depends(current_user)) -> Dict[str, bool]:
    await owned_account(account_id, user)
    result = await db.notes.delete_one({"id": note_id, "account_id": account_id})
    if not result.deleted_count:
        raise HTTPException(status_code=404, detail="Nota no encontrada")
    return {"ok": True}


def gold_context() -> Dict[str, Any]:
    try:
        response = requests.get("https://query1.finance.yahoo.com/v8/finance/chart/GC=F?range=1d&interval=5m", timeout=8)
        response.raise_for_status()
        result = response.json()["chart"]["result"][0]
        meta = result["meta"]
        price = float(meta.get("regularMarketPrice") or 0)
        previous = float(meta.get("previousClose") or 0)
        change = price - previous
        return {"available": True, "price": round(price, 2), "previous_close": round(previous, 2), "change": round(change, 2), "change_pct": round((change / previous) * 100, 2) if previous else 0}
    except Exception as exc:
        logger.warning("Gold data unavailable: %s", exc)
        return {"available": False, "message": "No se pudo consultar el precio en tiempo real."}


async def ai_text(prompt: str, session_id: str) -> str:
    key = os.environ.get("EMERGENT_LLM_KEY")
    if not key:
        return "La IA todavía no está configurada. Puedes seguir usando tu diario y tus reglas de disciplina."
    chat = LlmChat(api_key=key, session_id=session_id, system_message=(
        "Eres un coach educativo de trading. Responde en español claro, con alto contraste mental: "
        "frases cortas, listas y acciones concretas. Nunca prometas resultados, nunca des una orden directa de compra o venta "
        "y recuerda que la información no es asesoría financiera. Prioriza gestión de riesgo, pausas y el límite de dos pérdidas."
    )).with_model("openai", "gpt-5.4")
    chunks: List[str] = []
    async for event in chat.stream_message(UserMessage(text=prompt)):
        if isinstance(event, TextDelta):
            chunks.append(event.content)
        elif isinstance(event, StreamDone):
            break
    return "".join(chunks).strip()


@api_router.post("/ai/briefing")
async def ai_briefing(body: AiRequest, user: Dict[str, Any] = Depends(current_user)) -> Dict[str, Any]:
    account = await owned_account(body.account_id, user)
    metrics = await dashboard(body.account_id, user)
    market = gold_context()
    prompt = f"Fecha: {date.today().isoformat()}. Contexto XAU/USD: {market}. Cuenta: capital {metrics['capital']} {account['currency']}, P/L del día {metrics['daily_pnl']}, pérdidas seguidas {metrics['consecutive_losses']}. Solicitud: {body.question}. Devuelve: 1) lectura educativa del contexto, 2) tres riesgos a vigilar, 3) checklist antes de operar y 4) una regla para retirarse hoy."
    text = await ai_text(prompt, f"briefing-{user['id']}-{date.today().isoformat()}")
    return {"text": text, "market": market, "generated_at": now_iso()}


def pdf_escape(value: str) -> str:
    return value.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def make_pdf(lines: List[str]) -> bytes:
    stream_lines = ["BT", "/F1 16 Tf", "50 790 Td"]
    for index, line in enumerate(lines):
        if index:
            stream_lines.append("0 -22 Td")
        stream_lines.append(f"({pdf_escape(line[:110])}) Tj")
    stream_lines.append("ET")
    stream = "\n".join(stream_lines).encode("latin-1", "replace")
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        b"<< /Length " + str(len(stream)).encode() + b" >>\nstream\n" + stream + b"\nendstream",
    ]
    pdf = bytearray(b"%PDF-1.4\n")
    offsets = [0]
    for index, obj in enumerate(objects, 1):
        offsets.append(len(pdf))
        pdf.extend(f"{index} 0 obj\n".encode() + obj + b"\nendobj\n")
    xref = len(pdf)
    pdf.extend(f"xref\n0 {len(objects) + 1}\n0000000000 65535 f \n".encode())
    for offset in offsets[1:]:
        pdf.extend(f"{offset:010d} 00000 n \n".encode())
    pdf.extend(f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF".encode())
    return bytes(pdf)


@api_router.get("/reports/pdf")
async def report_pdf(account_id: str, period: str = Query(default="monthly"), token: Optional[str] = Query(default=None), authorization: Optional[str] = Header(default=None)) -> Response:
    raw_token = token or (authorization.split(" ", 1)[1] if authorization and authorization.startswith("Bearer ") else None)
    if not raw_token:
        raise HTTPException(status_code=401, detail="Sesión requerida")
    try:
        payload = jwt.decode(raw_token, JWT_SECRET, algorithms=["HS256"])
        user = await db.users.find_one({"id": payload.get("sub")}, {"_id": 0, "password_hash": 0})
    except jwt.PyJWTError as exc:
        raise HTTPException(status_code=401, detail="Sesión inválida") from exc
    if not user:
        raise HTTPException(status_code=401, detail="Usuario no encontrado")
    account = await owned_account(account_id, user)
    trades = await db.trades.find({"account_id": account_id}, {"_id": 0}).sort("entry_date", -1).to_list(500)
    today = date.today()
    if period == "daily":
        filtered = [t for t in trades if t["entry_date"] == today.isoformat()]
        label = "Diario"
    elif period == "weekly":
        start = today - timedelta(days=6)
        filtered = [t for t in trades if start.isoformat() <= t["entry_date"] <= today.isoformat()]
        label = "Semanal"
    else:
        filtered = [t for t in trades if t["entry_date"].startswith(today.isoformat()[:7])]
        label = "Mensual"
    pnl = sum(float(t["pnl"]) for t in filtered)
    lines = ["APEXTRADE JOURNAL", f"Reporte {label} - {today.isoformat()}", f"Cuenta: {account['name']}", f"Operaciones: {len(filtered)}", f"Resultado: {pnl:.2f} {account['currency']}", "", "Detalle:"]
    lines.extend([f"{t['entry_date']} | {t['symbol']} | {t['result']} | {float(t['pnl']):.2f}" for t in filtered[:28]])
    return Response(content=make_pdf(lines), media_type="application/pdf", headers={"Content-Disposition": f'attachment; filename="apextrade-{period}.pdf"'})


app.include_router(api_router)
app.add_middleware(CORSMiddleware, allow_credentials=True, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


@app.on_event("shutdown")
async def shutdown_db_client() -> None:
    client.close()