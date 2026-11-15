# Changelog

Every change to the project, newest first. Each entry names the document that records the discussion behind it.

## 2026-11-15 — Daily-use improvements

Notes: `documents/10-Daily-Use-Improvements.docx`

### Added (Python)

- `books/models.py`: Book gains `subtitle`, `color` (five cloths), `readers` and `last_written_at()`; new `BookShare` model for read-only sharing. Migration `0002_book_cover_and_sharing`.
- `books/booklet.py`: number columns carry brought-forward, page and running totals on every page (`totals`, `last_rows`).
- `books/views.py`: readers of a shared book may use the reading addresses only; new `GET/POST/DELETE /books/{id}/shares/`; the booklet answer carries `can_edit`, `color`, `subtitle` and every table's columns.
- `books/serializers.py`: `access`, `reader_count`, `last_written_at`; `ShareSerializer`.
- `booklet_site/settings.py`: correct file types for `.webmanifest`, `.wasm` and `.gz`.
- 8 new tests (79 in total).

### Added (screens)

- Shelf: cover cloth, short label, "written yesterday", a "Shared with you" shelf.
- Reader: reopens where it was left (per device) with a ribbon; menu with Today, Add a row, Night/Day, Print and search; totals at the foot of pages; ticks that save when tapped; "+ Add a row" at the foot of a table's last page; today's rows marked at the margin; faint paper grain.
- Book page: templates for new tables; "From a photo" (Tesseract.js in the browser, engine served by the site, review grid before saving); sharing in Book settings; cover settings; read-only mode for readers; Print link.
- Print view at `/books/{id}/print`: two pages per sheet, landscape, with totals.
- Install on a phone: `manifest.webmanifest`, icons, `sw.js`.

### Checked

- 79 backend tests pass; 25 browser checks pass at phone, tablet and laptop sizes on the development and production builds; a generated table photo was read with all cells correct.
- Not checked: a real paper photo, Safari, a real phone, installing, a real printer.

## 2026-10-04 — Live

Record: `documents/09-Complete-Record.docx`

### Done

- The code was pushed to GitHub (`Darshakalapati/booklet-view`).
- The site was published on Render from `render.yaml`, with the database on Neon. The first build took 1 minute 22 seconds and had no errors.
- Live address: <https://booklet-view.onrender.com>.

### Added

- `documents/09-Complete-Record.docx`: one document recording the whole conversation in order, every decision, the problems met and how each was solved, and what is and is not yet tested.
- `README.md`: the live address.

### Checked

- Render shows the service as Live, the health address answers, the log shows the first admin account was created, and the sign-in page loads.
- Not checked: signing in on the live site (it needs the owner's password), and the page turn on a real phone.

### Unchanged

- No Python code changed in this step.

## 2026-10-04 — Phase 4: page turning

Notes: `documents/08-Page-Turning.docx`

### Added

- **Turning pages** (`frontend/src/pages/Reader.jsx`): drag a page and it curls under the finger with a shadow along the fold; let go and it finishes the turn or falls back. Swipe, tap an edge, click, or use the arrow keys. Front and back covers are stiff.
- The turn comes from the open-source `page-flip` library (StPageFlip). Two of its rules were changed: a drag finishes after a short distance (the library needed the page dragged past the spine, which is off-screen on a phone), and taps are handled by the reader so the middle of the page opens the menu.
- A back cover, and a blank page before it when the book would otherwise have an odd number of sides.
- Pages change without animation when the device has "reduce motion" switched on.

### Fixed

- In the editing grid, a message about a refused value could be cleared by another cell saving at the same moment.
- Both Mac launchers now update the Python and screen packages on every start.

### Checked

- 44 browser checks at phone, tablet and laptop sizes, including drags, swipes, taps, contents links and rotation (Chromium only; not yet on a real phone).

## 2026-10-04 — Ready to go live

Discussion, code changes and steps: `documents/07-Going-Live.docx`

### Decided

- The site goes on the internet on free plans: Render for the website, Neon for the PostgreSQL database, GitHub for the code.
- One service and one address: the Python backend serves the screens.

### Added (Python)

- `booklet_site/settings.py`: reads the PostgreSQL address from `DATABASE_URL`; https-only, secure cookies and HSTS when not in debug mode; WhiteNoise serves the screens and static files; accepts Render's host name.
- `booklet_site/views.py`: sends the screens for every address that is not the API.
- `booklet_site/middleware.py`: answers the host's health check at `/api/health/`.
- `accounts/management/commands/ensure_admin.py`: creates the first admin from `BOOKLET_ADMIN_USERNAME` and `BOOKLET_ADMIN_PASSWORD` when no admin exists.
- `accounts/views.py`: sign-in is limited to 10 tries a minute.
- `requirements.txt`: gunicorn, whitenoise, dj-database-url, psycopg.
- 11 new tests (71 in total).

### Added (deployment)

- `Dockerfile`, `.dockerignore` and `render.yaml`.

### Checked

- All 71 backend tests pass on PostgreSQL 16 and on SQLite.
- The Dockerfile's steps were followed by hand and the production build was run with gunicorn against PostgreSQL; the 44 browser checks pass on it.
- Not checked: the Docker image build itself, and the real deployment on Render and Neon.

## 2026-10-04 — Phone testing

Notes: `documents/06-Testing-on-a-Phone.docx`

### Added

- **`start-for-phone.command`:** starts the site so a phone on the same Wi-Fi can open it, and prints the address to use on the phone. `start.command` must be run once first.

### Checked

- `start.command` was run on the Mac by its owner and reached the admin-account step.
- The phone launcher was run on Linux: the site and sign-in work through the network address it prints. It has not yet been run on macOS or opened from a real phone.

### Unchanged

- No Python code changed in this step.

## 2026-10-04 — Mac launcher

Notes: `documents/05-Running-on-the-Mac.docx`

### Added

- **`start.command`:** double-click on a Mac to set the project up, start the backend and the screens, and open the site in the browser.
- `backend.log` (written by the launcher) is ignored by Git.

### Changed

- `README.md`: the Mac quick start, and the Python requirement corrected from 3.11 to 3.10 or newer.

### Checked

- From the project folder on the Mac, inside Claude's sandbox there: the 60 backend tests pass on Python 3.10, the screens build, and sign-in, book pages and CSV upload work through the running site.
- The launcher was run from a clean state on Linux. It has not yet been run on macOS itself.

### Unchanged

- No Python code changed in this step.

## 2026-10-04 — Phases 2 and 3: screens and book view

Discussion and build notes: `documents/04-Screens-and-Book-View.docx`

### Decided

- Only an admin creates user accounts.
- One sign-in page serves both admins and users.
- Data is entered by uploading Excel or CSV, or by typing into tables. Photo upload stays as the last upload stage.
- After entry, the tables are read as a book.

### Added

- **Screens** (`frontend/`): a React app with these pages.
  - Sign in.
  - Books: the shelf, each book shown as a cover.
  - Book: tables as tabs, a grid to type into, Excel/CSV upload, book and table settings.
  - Trash: restore anything that was deleted.
  - Users (admin only): create accounts, change roles, switch accounts on or off, set passwords.
- **Delete inside the item only:** no delete button on the normal view; delete sits inside each book, table, column or row, shows what will be removed, and asks to confirm.
- **Book view** (`frontend/src/pages/Reader.jsx`): the book alone on the screen, with a cloth cover, contents page, ledger paper, a red margin line after the repeated first column, and page numbers. One page on a phone, two pages side by side on a laptop. Swipe, tap the edges, or use the arrow keys to turn the page.
- **Screen fitting:** the page size, and the number of columns and rows on it, are worked out from the screen.
- **Screenshots** in `documents/screenshots/`.

### Unchanged

- No Python code changed in this step. The 60 backend tests still pass.

### Checked

- 29 browser checks at phone, tablet and laptop sizes, all passing (Chromium only).

## 2026-10-04 — Phase 1: Python backend

Discussion: `documents/01-Requirement-Discussion.docx`, `documents/02-Requirements-and-Decisions.docx`
Build notes: `documents/03-Backend-Build-Notes.docx`

### Added

- **Project structure:** `documents/` for Word documents, `python_code/` for the backend, `README.md` and this changelog.
- **Users and roles** (`python_code/accounts/`): admin and user roles, sign-in with a token, sign-out, change password, and admin-only user management.
- **Books, tables, columns and rows** (`python_code/books/`):
  - each user has their own private books, and an admin can see and manage all of them;
  - add, rename, reorder and delete tables, columns and rows;
  - four column types: text, number, date and checkbox, with every value checked against its column's type;
  - a column's type can be changed when every existing value fits the new type.
- **Safe delete:** a delete does nothing until it is confirmed, then moves the item to a trash from where it can be restored.
- **Excel and CSV upload:** a file becomes a table, with column names from the first row and column types guessed from the values. An Excel file with several sheets gives one table per sheet.
- **Booklet page layout** (`python_code/books/booklet.py`): cover, contents page, each table starting on a new page, the first column repeated on every continuation page, and pages running across before down.
- **Demo data:** `python manage.py seed_demo`.
- **Automated tests:** 60 tests covering sign-in, permissions, tables, delete and trash, upload, and page layout.
