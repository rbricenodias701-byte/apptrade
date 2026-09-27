# ApexTrade Journal — PRD

## Problema
Trader necesita una app móvil sencilla y de alto contraste (fondo negro, letras grandes) para gestionar capital, operaciones, metas diarias/mensuales y disciplina personal.

## Público objetivo
Traders individuales con problemas de visión que buscan control diario/mensual del PL, metas ajustables y recordatorios de disciplina.

## Arquitectura
- Frontend: Expo React Native (expo-router) con tema oscuro alto contraste (`/app/frontend/src/theme.ts`).
- Backend: FastAPI + MongoDB. Auth con JWT.
- IA: Emergent LLM Key para briefing XAU/USD.
- PDF: `reportlab` para reportes diario/semanal/mensual.

## Funcionalidades implementadas (feb 2026)
- Registro/login por email + password (JWT).
- Multi-cuenta por usuario (crear/editar/eliminar, aislamiento verificado).
- Dashboard: capital actual, PL total, PL diario, PL mensual, meta diaria (barra), regla de 2 pérdidas.
- Diario: alta/edición/borrado de operaciones con activo, dirección, resultado, PL, fecha y reseña.
- Disciplina: contador de pérdidas seguidas, tarjeta de "sesión terminada", notas de reflexión CRUD.
- Asistente IA: briefing en español sobre XAU/USD con contexto de la cuenta.
- Meta editable en monto o porcentaje sobre el capital.
- Reportes PDF: diario, semanal, mensual (abre en pestaña autenticada).
- Configuración: editar cuenta activa, cambiar modo de meta, notificación diaria opcional (nativa).
- **Radar Oro (v2)**: detección automática AMD (acumulación → manipulación → distribución) en XAU/USD para 5m y 1h con contexto de tendencia (EMA 50/200 + estructura HH/LL). Auto-refresh cada 60s vía TwelveData API. Historial de señales persistido en Mongo.
- **Calculadora de lotaje (v2)**: cálculo de lotes según capital + riesgo (% o $ fijo) + entrada + SL + contrato. Devuelve lotes, micro lotes, valor por lote y metas 1R/2R/3R.

## Endpoints clave (`/api/...`)
- `POST /auth/register`, `POST /auth/login`
- `GET /accounts`, `POST /accounts`, `PATCH /accounts/{id}`, `DELETE /accounts/{id}`
- `GET /dashboard?account_id=`
- `GET /trades?account_id=`, `POST /trades`, `PATCH /trades/{id}`, `DELETE /trades/{id}`
- `GET /notes?account_id=`, `POST /notes`, `DELETE /notes/{id}`
- `POST /ai/briefing`
- `GET /reports/pdf?account_id=&period=`

## Modelo de datos
- users: `{id, name, email, hashed_password, created_at}`
- accounts: `{id, user_id, name, initial_capital, currency, target_mode, daily_target, monthly_target, stop_after_losses}`
- trades: `{id, account_id, user_id, symbol, side, result, pnl, entry_date, review, created_at}`
- notes: `{id, account_id, text, mood, created_at}`

## Estado de calidad
- Testing agent iter 3: PASS regresión backend + fix aislamiento multi-cuenta verificado end-to-end.

## Backlog priorizado
- Alertas nativas de "sesión terminada" en tiempo real.
- Gráfica de curva de capital semanal.
- Etiquetas/tags para agrupar operaciones por estrategia.
- Exportación CSV además de PDF.
