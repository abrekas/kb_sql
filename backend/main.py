import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, Form, HTTPException, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

DATABASE_URL = "sqlite+aiosqlite:///./test.db"
INTERNAL_KEY = os.getenv("INTERNAL_KEY", "dev-secret-key")

DRUM_GATEWAY_URL = os.getenv("DRUM_GATEWAY_URL", "http://127.0.0.1:3000")


@asynccontextmanager
async def lifespan(app: FastAPI):
    engine = create_async_engine(DATABASE_URL, echo=False)
    app.state.engine = engine

    async with engine.begin() as conn:
        await conn.execute(
            text(
                """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL UNIQUE,
                password TEXT NOT NULL
            );
        """
            )
        )

        await conn.execute(
            text(
                "INSERT OR IGNORE INTO users (username, password) VALUES ('admin', 'adminpass')"
            )
        )
        await conn.execute(
            text(
                "INSERT OR IGNORE INTO users (username, password) VALUES ('user', 'userpass')"
            )
        )
    yield

    await engine.dispose()


app = FastAPI(lifespan=lifespan)


async def run_vulnerable_login(request: Request, username: str, password: str) -> HTMLResponse:
    query = (
        f"SELECT * FROM users WHERE username='{username}' AND password='{password}'"
    )

    try:
        engine = request.app.state.engine
        async with engine.connect() as conn:
            result = await conn.execute(text(query))
            row = result.mappings().fetchone()

        if row:
            content = (
                f"<h1>Welcome, {row['username']}!</h1>"
                f"<p>SQL-запрос выполнен (уязвимость намеренная):</p>"
                f"<pre>{query}</pre>"
                f"<a href='{DRUM_GATEWAY_URL}/'>Back</a>"
            )
            return HTMLResponse(content=content)

        content = (
            "<h1>Invalid credentials.</h1>"
            f"<pre>{query}</pre>"
            f"<a href='{DRUM_GATEWAY_URL}/'>Try again</a>"
        )
        return HTMLResponse(content=content)
    except Exception as exc:
        return HTMLResponse(
            content=f"<h1>Database error: {exc}</h1><pre>{query}</pre>",
            status_code=500,
        )


@app.get("/", response_class=HTMLResponse)
async def home_page():
    return RedirectResponse(url=DRUM_GATEWAY_URL, status_code=307)


@app.post("/internal/login", response_class=HTMLResponse)
async def internal_login(
    request: Request,
    username: str = Form(...),
    password: str = Form(...),
):
    if request.headers.get("X-Internal-Key") != INTERNAL_KEY:
        raise HTTPException(status_code=403, detail="Forbidden")

    return await run_vulnerable_login(request, username, password)
