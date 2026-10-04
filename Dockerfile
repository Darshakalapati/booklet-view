# Builds the whole site into one container: the screens are built with Node,
# then served by the Python backend.

# --- Step 1: build the screens ----------------------------------------------
FROM node:22-slim AS screens
WORKDIR /build/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

# --- Step 2: the Python backend, with the built screens inside ---------------
FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    BOOKLET_DEBUG=0

WORKDIR /app/python_code
COPY python_code/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY python_code/ ./
COPY --from=screens /build/frontend/dist /app/frontend/dist

# Gather the static files of Django's own admin screen. The key here is used
# only for this build step; the real one comes from the server's settings.
RUN BOOKLET_SECRET_KEY=build-step-only python manage.py collectstatic --noinput

# The host says which port to listen on through $PORT.
EXPOSE 8000
CMD ["sh", "-c", "python manage.py migrate --noinput && python manage.py ensure_admin && exec gunicorn booklet_site.wsgi:application --bind 0.0.0.0:${PORT:-8000} --workers 2 --timeout 60 --access-logfile -"]
