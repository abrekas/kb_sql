import os
import asyncpg
from fastapi import FastAPI, Form, Request
from fastapi.responses import HTMLResponse

app = FastAPI()

# ---------- Настройки подключения к PostgreSQL ----------
DB_USER = os.getenv("DB_USER", "postgres")
DB_PASSWORD = os.getenv("DB_PASSWORD", "postgres")
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = os.getenv("DB_PORT", "5432")
DB_NAME = os.getenv("DB_NAME", "testdb")

DATABASE_URL = f"postgresql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"

# Глобальный пул соединений
pool = None


@app.on_event("startup")
async def startup():
    global pool
    pool = await asyncpg.create_pool(DATABASE_URL)

    # Создание таблицы и тестовых данных
    async with pool.acquire() as conn:
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username TEXT NOT NULL UNIQUE,
                password TEXT NOT NULL
            );
        """)
        # Вставка пользователей (игнорируем, если уже есть)
        await conn.execute("""
            INSERT INTO users (username, password)
            VALUES ('admin', 'adminpass')
            ON CONFLICT (username) DO NOTHING;
        """)
        await conn.execute("""
            INSERT INTO users (username, password)
            VALUES ('user', 'userpass')
            ON CONFLICT (username) DO NOTHING;
        """)


@app.on_event("shutdown")
async def shutdown():
    await pool.close()


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
async def login(username: str = Form(...), password: str = Form(...)):
    # ⚠️ УЯЗВИМЫЙ ЗАПРОС – конкатенация пользовательского ввода ⚠️
    query = f"SELECT * FROM users WHERE username='{username}' AND password='{password}'"

    try:
        async with pool.acquire() as conn:
            row = await conn.fetchrow(query)

        if row:
            return f"<h1>Welcome, {row['username']}!</h1><a href='/home'>Back</a>"
        else:
            return "<h1>Invalid credentials.</h1><a href='/home'>Try again</a>"
    except Exception as e:
        return HTMLResponse(content=f"<h1>Database error: {e}</h1>", status_code=500)