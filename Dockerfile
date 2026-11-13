FROM python:3.12-slim

ARG APP_VERSION=dev

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ ./backend/
COPY frontend/ ./frontend/

RUN CACHE_TAG=$([ "$APP_VERSION" = "dev" ] && date +%s || echo "$APP_VERSION") && \
    sed -i "s|__APP_VERSION__|${APP_VERSION}|g" /app/frontend/index.html && \
    sed -i -E "s|app\.js\?v=[^\"]*|app.js?v=${CACHE_TAG}|g" /app/frontend/index.html && \
    mkdir -p /app/data

EXPOSE 8000

CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
