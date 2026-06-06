from contextlib import asynccontextmanager

from fastapi import FastAPI, Form, Request
from fastapi.responses import HTMLResponse
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text

# ---------- Настройки подключения к SQLite ----------
DATABASE_URL = "sqlite+aiosqlite:///./test.db"


@asynccontextmanager
async def lifespan(app: FastAPI):
    # --- Запуск: создаём движок и инициализируем БД ---
    engine = create_async_engine(DATABASE_URL, echo=False)
    app.state.engine = engine

    async with engine.begin() as conn:
        # Создаём таблицу, если её нет
        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL UNIQUE,
                password TEXT NOT NULL
            );
        """))
        # Тестовые пользователи (INSERT OR IGNORE для игнорирования дубликатов)
        await conn.execute(text(
            "INSERT OR IGNORE INTO users (username, password) VALUES ('admin', 'adminpass')"
        ))
        await conn.execute(text(
            "INSERT OR IGNORE INTO users (username, password) VALUES ('user', 'userpass')"
        ))

    yield  # Приложение работает

    # --- Завершение: закрываем движок ---
    await engine.dispose()


app = FastAPI(lifespan=lifespan)


# ---------- Страница с формой ----------
@app.get("/", response_class=HTMLResponse)
async def home_page():
    return """
    <html>
        <body>
            <h2>Login (уязвимая форма)</h2>
            <form method="post" action="/">
                <label>Username:</label><br>
                <input type="text" name="username"><br><br>
                <label>Password:</label><br>
                <input type="password" name="password"><br><br>
                <input type="submit" value="Login">
            </form>
            <p><i>Попробуйте пароль: <b>' OR '1'='1</b></i></p>
        </body>
    </html>
    """


# ---------- Уязвимый обработчик входа ----------
@app.post("/", response_class=HTMLResponse)
async def login(request: Request, username: str = Form(...), password: str = Form(...)):
    # ⚠️ УЯЗВИМЫЙ ЗАПРОС – конкатенация пользовательского ввода ⚠️
    query = f"SELECT * FROM users WHERE username='{username}' AND password='{password}'"

    try:
        engine = request.app.state.engine
        async with engine.connect() as conn:
            result = await conn.execute(text(query))
            row = result.fetchone()

        if row:
            return f"<h1>Welcome, {row['username']}!</h1><a href='/'>Back</a>"
        else:
            return "<h1>Invalid credentials.</h1><a href='/'>Try again</a>"
    except Exception as e:
        return HTMLResponse(content=f"<h1>Database error: {e}</h1>", status_code=500)