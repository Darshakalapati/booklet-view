"""
Settings for the Booklet View backend.

Everything that differs between a laptop and a real server is read from
environment variables, so the same code runs in both places:

    BOOKLET_SECRET_KEY     secret used for signing (required in production)
    BOOKLET_DEBUG          "1" for development (default), "0" for production
    BOOKLET_ALLOWED_HOSTS  comma-separated host names, e.g. "example.com"
    DATABASE_URL           a PostgreSQL address, e.g. postgresql://user:pw@host/db
                           (left out: a local SQLite file is used)
    BOOKLET_ADMIN_USERNAME / BOOKLET_ADMIN_PASSWORD
                           the first admin account, created on a new server
                           by `manage.py ensure_admin`
    BOOKLET_SSL_REDIRECT   "0" to stop the redirect to https (only for trying
                           the production setup on your own computer)
"""

import os
import sys
from pathlib import Path

import dj_database_url

BASE_DIR = Path(__file__).resolve().parent.parent


def env_flag(name, default):
    return os.environ.get(name, default).strip().lower() in ("1", "true", "yes")


DEBUG = env_flag("BOOKLET_DEBUG", "1")

SECRET_KEY = os.environ.get("BOOKLET_SECRET_KEY", "")
if not SECRET_KEY:
    if not DEBUG:
        raise RuntimeError("Set BOOKLET_SECRET_KEY before running with BOOKLET_DEBUG=0.")
    SECRET_KEY = "development-only-key-do-not-use-in-production"

ALLOWED_HOSTS = [
    host.strip()
    for host in os.environ.get("BOOKLET_ALLOWED_HOSTS", "localhost,127.0.0.1").split(",")
    if host.strip()
]
# Render tells the app its own public host name.
if os.environ.get("RENDER_EXTERNAL_HOSTNAME"):
    ALLOWED_HOSTS.append(os.environ["RENDER_EXTERNAL_HOSTNAME"])

CSRF_TRUSTED_ORIGINS = [
    f"https://{host}" for host in ALLOWED_HOSTS if host not in ("localhost", "127.0.0.1")
]

# --- Running on a real server ----------------------------------------------
if not DEBUG:
    # The host (Render) handles https and passes requests on over plain http.
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
    SECURE_SSL_REDIRECT = env_flag("BOOKLET_SSL_REDIRECT", "1")
    SESSION_COOKIE_SECURE = SECURE_SSL_REDIRECT
    CSRF_COOKIE_SECURE = SECURE_SSL_REDIRECT
    SECURE_HSTS_SECONDS = 60 * 60 * 24 * 30 if SECURE_SSL_REDIRECT else 0

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "rest_framework.authtoken",
    "accounts",
    "books",
]

MIDDLEWARE = [
    "booklet_site.middleware.HealthCheckMiddleware",  # must stay first
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",  # serves the screens and static files
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "booklet_site.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "booklet_site.wsgi.application"

# --- Database -------------------------------------------------------------
# With DATABASE_URL set (on the server) the site uses that PostgreSQL database.
# Without it (on your own computer) it uses a SQLite file, which needs no setup.
if os.environ.get("DATABASE_URL"):
    DATABASES = {
        "default": dj_database_url.parse(
            os.environ["DATABASE_URL"],
            conn_max_age=600,
            conn_health_checks=True,
        )
    }
else:
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": BASE_DIR / "db.sqlite3",
        }
    }

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# --- Users ----------------------------------------------------------------
AUTH_USER_MODEL = "accounts.User"

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

# Password hashing is slow on purpose. The automated tests create many users,
# so they use a fast hasher; real passwords always use the strong default.
if "test" in sys.argv:
    PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]

# --- API ------------------------------------------------------------------
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework.authentication.TokenAuthentication",
        "rest_framework.authentication.SessionAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
    "TEST_REQUEST_DEFAULT_FORMAT": "json",
    # Slows down anyone guessing passwords on the sign-in page.
    "DEFAULT_THROTTLE_RATES": {"login": "1000/min" if "test" in sys.argv else "10/min"},
}

# --- File uploads (Excel / CSV import) --------------------------------------
IMPORT_MAX_FILE_BYTES = 5 * 1024 * 1024
IMPORT_MAX_ROWS = 5000
IMPORT_MAX_COLUMNS = 100

# --- Booklet pages ----------------------------------------------------------
# Used when the screen does not say how much fits on one page.
BOOKLET_DEFAULT_COLUMNS_PER_PAGE = 5
BOOKLET_DEFAULT_ROWS_PER_PAGE = 15

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

# --- Static files and the screens -------------------------------------------
STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
STATIC_ROOT.mkdir(exist_ok=True)  # WhiteNoise expects the folder to exist
STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {
        "BACKEND": (
            "django.contrib.staticfiles.storage.StaticFilesStorage"
            if DEBUG or "test" in sys.argv
            else "whitenoise.storage.CompressedManifestStaticFilesStorage"
        )
    },
}

# The built screens (the output of `npm run build` in the frontend folder).
# When this folder exists, Django serves the screens itself, so the whole site
# runs from one address.
FRONTEND_DIST = Path(os.environ.get("BOOKLET_FRONTEND_DIST", BASE_DIR.parent / "frontend" / "dist"))
if FRONTEND_DIST.is_dir():
    WHITENOISE_ROOT = FRONTEND_DIST
