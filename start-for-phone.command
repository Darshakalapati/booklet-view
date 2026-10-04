#!/bin/bash
# Booklet View, reachable from a phone on the same Wi-Fi.
#
# Run start.command once first (it sets the project up). After that,
# double-click this file instead whenever you want to open the site on a phone.
# It prints the address to type into the phone's browser.
#
# While this is running, any device on the same Wi-Fi can open the site,
# so use it on your own Wi-Fi, not a public one.

cd "$(dirname "$0")" || exit 1
ROOT="$(pwd)"

fail() {
  printf '\nCould not start: %s\n' "$1"
  if [ -t 0 ]; then read -r -p "Press Return to close." _; fi
  exit 1
}

[ -x "$ROOT/python_code/.venv/bin/python" ] && [ -d "$ROOT/frontend/node_modules" ] ||
  fail "The project is not set up yet. Double-click start.command once first."

# This Mac's address on the Wi-Fi network.
IP="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null)"
[ -n "$IP" ] || IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
[ -n "$IP" ] || fail "This Mac does not seem to be connected to Wi-Fi."

# Bring the packages up to date, in case a later change added any.
cd "$ROOT/python_code" || exit 1
.venv/bin/python -m pip install --quiet --disable-pip-version-check -r requirements.txt ||
  fail "The Python packages could not be installed. Check the internet connection."
(cd "$ROOT/frontend" && npm install --no-audit --no-fund --loglevel=error) ||
  fail "The screen packages could not be installed. Check the internet connection."

.venv/bin/python manage.py migrate -v 0 || fail "The database could not be prepared."
.venv/bin/python manage.py runserver 8000 > "$ROOT/backend.log" 2>&1 &
BACKEND=$!
# Stop the backend whenever this script ends, however it ends.
trap 'kill "$BACKEND" 2>/dev/null' EXIT
trap 'exit 130' INT TERM HUP
sleep 3
kill -0 "$BACKEND" 2>/dev/null ||
  fail "The backend stopped. If Booklet View is already running in another Terminal window, close that window and try again."

cat <<EOF

  Booklet View is running.

    On your phone:  http://$IP:5173
    On this Mac:    http://localhost:5173

  The phone must be on the same Wi-Fi as this Mac.
  Keep this window open while you use the site.
  To stop, close this window or press Control + C.

EOF

cd "$ROOT/frontend" || exit 1
npm run dev:phone -- --strictPort ||
  fail "The screens stopped. If Booklet View is already running in another Terminal window, close that window and try again."
