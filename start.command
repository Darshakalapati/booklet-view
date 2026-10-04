#!/bin/bash
# Booklet View launcher for Mac.
#
# Double-click this file in Finder. It sets the project up the first time
# (a few minutes, needs the internet), starts the backend and the screens,
# and opens the site in your browser. Close the Terminal window to stop it.

cd "$(dirname "$0")" || exit 1
ROOT="$(pwd)"

say() { printf '\n== %s\n' "$1"; }
fail() {
  printf '\nCould not start: %s\n' "$1"
  if [ -t 0 ]; then read -r -p "Press Return to close." _; fi
  exit 1
}

# --- What this needs ---------------------------------------------------------
PYTHON=""
for candidate in python3 python; do
  if command -v "$candidate" >/dev/null 2>&1 &&
     "$candidate" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)' 2>/dev/null; then
    PYTHON="$candidate"
    break
  fi
done
[ -n "$PYTHON" ] || fail "Python 3.10 or newer is needed. Install it from https://www.python.org/downloads/ and run this again."

command -v npm >/dev/null 2>&1 || fail "Node.js 18 or newer is needed. Install it from https://nodejs.org and run this again."
node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 18 ? 0 : 1)' ||
  fail "Node.js 18 or newer is needed. This computer has $(node --version). Update it from https://nodejs.org."

# --- Backend -----------------------------------------------------------------
say "Setting up the Python backend"
cd "$ROOT/python_code" || fail "The python_code folder is missing."
if [ ! -x .venv/bin/python ]; then
  "$PYTHON" -m venv .venv || fail "The Python environment could not be created."
fi
.venv/bin/python -m pip install --quiet --disable-pip-version-check -r requirements.txt ||
  fail "The Python packages could not be installed. Check the internet connection."
.venv/bin/python manage.py migrate -v 0 || fail "The database could not be prepared."
.venv/bin/python manage.py seed_demo

HAS_ADMIN='import sys; from accounts.models import User; sys.exit(0 if User.objects.filter(role="admin").exists() else 1)'
if ! .venv/bin/python manage.py shell -v 0 -c "$HAS_ADMIN" >/dev/null 2>&1; then
  say "Create the admin account. Choose a username and a password."
  .venv/bin/python manage.py createsuperuser
fi

# --- Screens -----------------------------------------------------------------
say "Setting up the screens"
cd "$ROOT/frontend" || fail "The frontend folder is missing."
# Runs every time, so packages added by a later change are picked up. It is quick when nothing changed.
npm install --no-audit --no-fund --loglevel=error ||
  fail "The screen packages could not be installed. Check the internet connection."

# --- Start -------------------------------------------------------------------
say "Starting"
cd "$ROOT/python_code" || exit 1
.venv/bin/python manage.py runserver 8000 > "$ROOT/backend.log" 2>&1 &
BACKEND=$!
# Stop the backend whenever this script ends, however it ends.
trap 'kill "$BACKEND" 2>/dev/null' EXIT
trap 'exit 130' INT TERM HUP
sleep 3
kill -0 "$BACKEND" 2>/dev/null ||
  fail "The backend stopped. Port 8000 may be in use by another program. Details are in backend.log."

cat <<'EOF'

  Booklet View is running.

    Open:      http://localhost:5173
    Demo user: demo  /  demo-Booklet-2026
    Admin:     the account you created

  Keep this window open while you use the site.
  To stop, close this window or press Control + C.

EOF

cd "$ROOT/frontend" || exit 1
if command -v open >/dev/null 2>&1; then
  (sleep 4 && open "http://localhost:5173") &
fi
npm run dev -- --strictPort ||
  fail "The screens stopped. Port 5173 may be in use by another program."
