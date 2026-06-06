import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, Form, Request
from fastapi.responses import HTMLResponse
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text

# ---------- Настройки подключения к PostgreSQL ----------
DB_USER = os.getenv("DB_USER", "postgres")
DB_PASSWORD = os.getenv("DB_PASSWORD", "postgres")
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = os.getenv("DB_PORT", "5432")
DB_NAME = os.getenv("DB_NAME", "testdb")

DATABASE_URL = f"postgresql+asyncpg://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"


@asynccontextmanager
async def lifespan(app: FastAPI):
    # --- Запуск: создаём движок и инициализируем БД ---
    engine = create_async_engine(DATABASE_URL, echo=False)
    app.state.engine = engine

    async with engine.begin() as conn:
        # Создаём таблицу, если её нет
        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username TEXT NOT NULL UNIQUE,
                password TEXT NOT NULL
            );
        """))
        # Тестовые пользователи
        await conn.execute(text(
            "INSERT INTO users (username, password) VALUES ('admin', 'adminpass') ON CONFLICT (username) DO NOTHING"
        ))
        await conn.execute(text(
            "INSERT INTO users (username, password) VALUES ('user', 'userpass') ON CONFLICT (username) DO NOTHING"
        ))

    yield  # Приложение работает

    # --- Завершение: закрываем движок ---
    await engine.dispose()


app = FastAPI(lifespan=lifespan)


# ---------- Страница с формой ----------
@app.get("/home", response_class=HTMLResponse)
async def home_page():
    return """
    <html>
        <body>
            <h2>Login (уязвимая форма)</h2>
            <form method="post" action="/home">
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
@app.post("/home", response_class=HTMLResponse)
async def login(request: Request, username: str = Form(...), password: str = Form(...)):
    # ⚠️ УЯЗВИМЫЙ ЗАПРОС – конкатенация пользовательского ввода ⚠️
    query = f"SELECT * FROM users WHERE username='{username}' AND password='{password}'"

    try:
        engine = request.app.state.engine
        async with engine.connect() as conn:
            result = await conn.execute(text(query))
            row = result.fetchone()

        if row:
            return f"<h1>Welcome, {row['username']}!</h1><a href='/home'>Back</a>"
        else:
            return "<h1>Invalid credentials.</h1><a href='/home'>Try again</a>"
    except Exception as e:
        return HTMLResponse(content=f"<h1>Database error: {e}</h1>", status_code=500)