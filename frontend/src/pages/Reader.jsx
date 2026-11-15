import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useParams } from 'react-router-dom';
import { PageFlip } from 'page-flip/dist/js/page-flip.module.js';
import { api } from '../api';
import { Dialog, ErrorNote } from '../components/Dialog';
import { RowForm } from '../components/RowForm';

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

// Works out the size of one page on this screen, and from that how many
// columns and rows fit. A phone gets one tall page; a wide screen gets two
// pages side by side, like an open ledger.
function measure() {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const spread = vw >= 960 && vw / vh > 1.25;
  const margin = spread ? 28 : 10;
  const availableHeight = vh - margin * 2;
  const availableWidth = (vw - margin * 2) / (spread ? 2 : 1);
  const pageWidth = Math.floor(Math.min(availableWidth, availableHeight * 0.78));
  const compact = pageWidth < 480;
  const pageHeight = Math.floor(Math.min(availableHeight, pageWidth * (compact ? 2.2 : 1.5)));

  const rowHeight = compact ? 34 : 38;
  const paddingX = compact ? 14 : 30;
  // Heading, foot, column names, and two rows kept for the totals of a cash book.
  const fixedHeight = (compact ? 64 : 84) + (compact ? 36 : 44) + rowHeight * 3;
  return {
    spread,
    compact,
    pageWidth,
    pageHeight,
    rowHeight,
    columns: clamp(Math.floor((pageWidth - paddingX * 2) / (compact ? 78 : 124)), 2, 12),
    rows: clamp(Math.floor((pageHeight - fixedHeight) / rowHeight), 3, 60),
  };
}

const todayISO = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

function formatCell(value, type, compact) {
  if (value === null || value === undefined) return '';
  if (type === 'number' && typeof value === 'number') {
    return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value);
  }
  if (type === 'date' && typeof value === 'string') {
    const [year, month, day] = value.split('-').map(Number);
    if (year && month && day) {
      return new Intl.DateTimeFormat(undefined, {
        day: 'numeric',
        month: 'short',
        year: compact ? '2-digit' : 'numeric',
      }).format(new Date(year, month - 1, day));
    }
  }
  return String(value);
}

// Columns share the page width by what they hold: words need more room than
// a number or a tick. The first column is the row's label, so it is never narrow.
const WIDTH_SHARE = { text: 1.5, date: 1.15, number: 0.9, checkbox: 0.7 };

function columnWidths(columns) {
  const shares = columns.map((column, index) => (index === 0 ? 1.5 : WIDTH_SHARE[column.data_type] ?? 1));
  const total = shares.reduce((sum, share) => sum + share, 0);
  return shares.map((share) => `${((share / total) * 100).toFixed(2)}%`);
}

// Where the reader was in each book, kept on this device.
const placeKey = (bookId) => `booklet.place.${bookId}`;
const loadPlace = (bookId) => {
  try {
    return JSON.parse(window.localStorage.getItem(placeKey(bookId))) || { index: 0, rowId: null };
  } catch {
    return { index: 0, rowId: null };
  }
};
const savePlace = (bookId, place) => {
  try {
    window.localStorage.setItem(placeKey(bookId), JSON.stringify(place));
  } catch {
    /* private browsing: the place is simply not remembered */
  }
};
const loadNight = () => {
  try {
    return window.localStorage.getItem('booklet.night') === '1';
  } catch {
    return false;
  }
};

function CoverPage({ page, layout, color, subtitle }) {
  return (
    <div className="page page-cover" data-cloth={color} style={{ fontSize: clamp(layout.pageWidth / 19, 17.6, 30.4) }}>
      <div className="cover-plate">
        <span className="plate-title">{page.title}</span>
        <span className="plate-rule" />
        <span className="plate-sub">{subtitle || page.owner}</span>
      </div>
    </div>
  );
}

// The outside of the back cover: plain cloth.
function BackCoverPage({ color }) {
  return <div className="page page-cover is-back" data-cloth={color} aria-hidden="true" />;
}

// An empty ruled page, used to keep the page count even so the back cover closes properly.
function BlankPage() {
  return <div className="page page-paper is-blank" aria-hidden="true" />;
}

function ContentsPage({ page, onJump }) {
  return (
    <div className="page page-paper">
      <header className="page-heading">
        <h1>Contents</h1>
      </header>
      {page.entries.length === 0 ? (
        <p className="page-empty">This book has no tables yet.</p>
      ) : (
        <ol className="contents">
          {page.entries.map((entry) => (
            <li key={entry.table_id}>
              <button type="button" onClick={() => onJump(entry.page_number)}>
                <span className="contents-name">{entry.table_name}</span>
                <span className="contents-dots" aria-hidden="true" />
                <span className="contents-page">{entry.page_number}</span>
              </button>
            </li>
          ))}
        </ol>
      )}
      <footer className="page-foot">{page.page_number}</footer>
    </div>
  );
}

function TablePage({ page, layout, overrides, highlightRowId, today, canEdit, onTick, onAddRow }) {
  const widths = columnWidths(page.columns);
  const totals = page.totals;
  const showBroughtForward = totals && totals.some((t) => t && t.brought_forward !== 0);
  const totalRows = totals ? 1 + (showBroughtForward ? 1 : 0) : 0;
  const blankRows = Math.max(0, layout.rows + 2 - totalRows - page.rows.length);
  const cellValue = (row, column, index) => {
    const changed = overrides[row.id];
    return changed && column.id in changed ? changed[column.id] : row.cells[index];
  };
  const isToday = (row) =>
    page.columns.some((column, index) => column.data_type === 'date' && cellValue(row, column, index) === today);

  return (
    <div className="page page-paper">
      <header className="page-heading">
        <h1>
          {page.table_name}
          {!page.starts_table && <span className="continued"> continued</span>}
        </h1>
        {page.column_parts > 1 && (
          <p className="page-part">
            Columns, part {page.column_part} of {page.column_parts}
          </p>
        )}
      </header>
      {page.columns.length === 0 ? (
        <p className="page-empty">This table has no columns yet.</p>
      ) : (
        <table className="ledger" style={{ '--row-height': `${layout.rowHeight}px` }}>
          <colgroup>
            {page.columns.map((column, index) => (
              <col key={column.id} style={{ width: widths[index] }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              {page.columns.map((column) => (
                <th key={column.id} scope="col" className={`is-${column.data_type}`} title={column.name}>
                  <span className="cell-text">{column.name}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {page.rows.map((row) => (
              <tr
                key={row.id}
                className={`${row.id === highlightRowId ? 'is-found ' : ''}${isToday(row) ? 'is-today' : ''}`.trim() || undefined}
              >
                {row.cells.map((_, index) => {
                  const column = page.columns[index];
                  const value = cellValue(row, column, index);
                  const text = formatCell(value, column.data_type, layout.compact);
                  const Tag = index === 0 ? 'th' : 'td';
                  return (
                    <Tag key={column.id} scope={index === 0 ? 'row' : undefined} className={`is-${column.data_type}`} title={text}>
                      {column.data_type === 'checkbox' ? (
                        <button
                          type="button"
                          className={`tick${value ? ' is-on' : ''}${canEdit ? ' can-tick' : ''}`}
                          aria-label={`${column.name}: ${value ? 'yes' : 'no'}${canEdit ? ', press to change' : ''}`}
                          aria-pressed={Boolean(value)}
                          disabled={!canEdit}
                          onClick={() => onTick(row, column, !value)}
                        />
                      ) : (
                        <span className="cell-text">{text}</span>
                      )}
                    </Tag>
                  );
                })}
              </tr>
            ))}
            {Array.from({ length: blankRows }, (_, index) => (
              <tr key={`blank-${index}`} aria-hidden="true">
                {page.columns.map((column) => (
                  <td key={column.id} />
                ))}
              </tr>
            ))}
          </tbody>
          {totals && (
            <tfoot>
              {showBroughtForward && (
                <tr className="ledger-total is-bf">
                  {page.columns.map((column, index) => (
                    <td key={column.id} className={`is-${column.data_type}`}>
                      {index === 0 ? 'Brought forward' : totals[index] ? formatCell(totals[index].brought_forward, 'number') : ''}
                    </td>
                  ))}
                </tr>
              )}
              <tr className="ledger-total">
                {page.columns.map((column, index) => (
                  <td key={column.id} className={`is-${column.data_type}`}>
                    {index === 0 ? (page.last_rows ? 'Total' : 'Carried forward') : totals[index] ? formatCell(totals[index].running, 'number') : ''}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      )}
      <footer className="page-foot">
        {canEdit && page.last_rows && page.column_part === page.column_parts && (
          <button type="button" className="page-add" onClick={() => onAddRow(page.table_id)} title="Add a row to this table">
            + Add a row
          </button>
        )}
        <span>{page.page_number}</span>
      </footer>
    </div>
  );
}

function Page({ page, book, ...rest }) {
  if (page.type === 'cover') return <CoverPage page={page} layout={rest.layout} color={book.color} subtitle={book.subtitle} />;
  if (page.type === 'back') return <BackCoverPage color={book.color} />;
  if (page.type === 'blank') return <BlankPage />;
  if (page.type === 'contents') return <ContentsPage page={page} onJump={rest.onJump} />;
  return <TablePage page={page} {...rest} />;
}

// The pages of the bound book: what the backend sent, plus a back cover.
// A real book has an even number of sides, so a blank page is added if needed.
function bindBook(pages) {
  const leaves = [...pages];
  if (leaves.length % 2 === 0) leaves.push({ type: 'blank' });
  leaves.push({ type: 'back' });
  return leaves;
}

const prefersReducedMotion = () =>
  typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// What to call a row in a list: its first words, or else its first filled cell.
const rowLabel = (leaf, row) => {
  const textIndex = leaf.columns.findIndex((column, i) => column.data_type === 'text' && row.cells[i]);
  if (textIndex >= 0) return String(row.cells[textIndex]);
  const first = row.cells.find((cell) => cell !== null && cell !== undefined && cell !== '' && cell !== false);
  return first === true ? 'Yes' : first === undefined ? `Row ${row.number}` : String(first);
};

// The reading screen. Nothing is shown except the book.
//
// The turning-page effect comes from the page-flip library (StPageFlip). It
// owns the page elements and moves them; React only fills each page with its
// content, through a portal.
export default function Reader() {
  const { bookId } = useParams();
  const [layout, setLayout] = useState(measure);
  const [book, setBook] = useState(null);
  const [error, setError] = useState('');
  const [leafIndex, setLeafIndex] = useState(0); // which page is open (0 = front cover)
  const [leafElements, setLeafElements] = useState([]);
  const [menu, setMenu] = useState(false);
  const [hint, setHint] = useState(true);
  const [night, setNight] = useState(loadNight);
  const [query, setQuery] = useState('');
  const [note, setNote] = useState('');
  const [overrides, setOverrides] = useState({}); // ticks changed on the page: rowId -> {columnId: value}
  const [highlightRowId, setHighlightRowId] = useState(null);
  const [adding, setAdding] = useState(null); // table id when the "add a row" window is open
  const [ribbonIndex, setRibbonIndex] = useState(null);
  const host = useRef(null);
  const flip = useRef(null);
  const pointer = useRef(null);
  const place = useRef(loadPlace(bookId)); // where the reader is; remembered on this device

  useEffect(() => {
    let timer;
    const onResize = () => {
      clearTimeout(timer);
      timer = setTimeout(() => setLayout(measure()), 150);
    };
    window.addEventListener('resize', onResize);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  const load = useCallback(() => {
    let cancelled = false;
    api(`/books/${bookId}/booklet/?columns_per_page=${layout.columns}&rows_per_page=${layout.rows}`)
      .then((loaded) => {
        if (cancelled) return;
        setBook(loaded);
        setOverrides({});
        setError('');
      })
      .catch((problem) => !cancelled && setError(problem.message));
    return () => {
      cancelled = true;
    };
  }, [bookId, layout.columns, layout.rows]);
  useEffect(load, [load]);

  useEffect(() => {
    try {
      window.localStorage.setItem('booklet.night', night ? '1' : '0');
    } catch {
      /* not remembered */
    }
  }, [night]);

  const leaves = useMemo(() => (book ? bindBook(book.pages) : []), [book]);
  const today = useMemo(todayISO, []);

  // Build the book. Runs again whenever the pages or the page size change.
  useEffect(() => {
    if (!leaves.length || !host.current) return undefined;

    // Open where the reader left off, finding the same rows if the pages were laid out again.
    let startPage = clamp(place.current.index, 0, leaves.length - 1);
    if (place.current.rowId) {
      const same = leaves.findIndex(
        (leaf) => leaf.type === 'table' && leaf.column_part === 1 && leaf.rows.some((row) => row.id === place.current.rowId)
      );
      if (same >= 0) startPage = same;
    }
    setRibbonIndex((current) => current ?? startPage);

    const block = document.createElement('div');
    host.current.appendChild(block);
    const elements = leaves.map((leaf) => {
      const element = document.createElement('div');
      element.className = 'leaf';
      if (leaf.type === 'cover' || leaf.type === 'back') element.dataset.density = 'hard';
      return element;
    });

    const reduced = prefersReducedMotion();
    const book3d = new PageFlip(block, {
      width: layout.pageWidth,
      height: layout.pageHeight,
      size: 'fixed',
      usePortrait: true, // one page when the screen is too narrow for two
      showCover: true,
      startPage,
      drawShadow: true,
      maxShadowOpacity: 0.4,
      flippingTime: 650,
      mobileScrollSupport: false,
      swipeDistance: 30,
      showPageCorners: !layout.compact && !reduced,
      disableFlipByClick: false,
      clickEventForward: true,
      useMouseEvents: !reduced,
    });
    book3d.loadFromHTML(elements);

    // Two changes to how the library ends a touch or a click:
    //  * A plain tap or click does nothing here; the reader handles taps itself,
    //    so that the middle of the page can open the menu.
    //  * A drag finishes the turn once the finger has travelled a fair part of
    //    the page. The library's own rule needs the page dragged past the spine,
    //    which on a phone is off the edge of the screen.
    book3d.userStop = function userStop(position, isSwipe = false) {
      if (!this.isUserTouch) return;
      this.isUserTouch = false;
      if (isSwipe || !this.isUserMove) return;
      const controller = this.flipController;
      const calculation = controller.calc;
      if (!calculation) return;
      const bounds = controller.getBoundsRect();
      const travelled = position.x - this.mousePosition.x; // to the right is positive
      const forward = calculation.getDirection() === 0;
      const enough = Math.min(90, bounds.pageWidth * 0.18);
      const finish = forward ? travelled < -enough : travelled > enough;
      const y = calculation.getCorner() === 'bottom' ? bounds.height : 0;
      controller.animateFlippingTo(
        calculation.getPosition(),
        { x: finish ? -bounds.pageWidth : bounds.pageWidth, y },
        finish
      );
    };
    book3d.on('flip', (event) => {
      const index = event.data;
      const leaf = leaves[index];
      place.current = { index, rowId: leaf?.type === 'table' ? leaf.rows[0]?.id ?? null : null };
      savePlace(bookId, place.current);
      setLeafIndex(index);
      setHint(false);
    });

    flip.current = book3d;
    setLeafElements(elements);
    setLeafIndex(startPage);
    return () => {
      flip.current = null;
      book3d.destroy();
    };
  }, [leaves, layout.pageWidth, layout.pageHeight, layout.spread, layout.compact, bookId]);

  // 'read' is the resting state; 'fold_corner' is a corner lifted under the mouse.
  const isResting = (book3d) => ['read', 'fold_corner'].includes(book3d.getState());

  const turn = useCallback((direction, corner = 'top') => {
    const book3d = flip.current;
    if (!book3d || !isResting(book3d)) return;
    if (prefersReducedMotion()) {
      if (direction > 0) book3d.turnToNextPage();
      else book3d.turnToPrevPage();
    } else if (direction > 0) book3d.flipNext(corner);
    else book3d.flipPrev(corner);
  }, []);

  const goTo = useCallback((index) => {
    const book3d = flip.current;
    if (!book3d || !isResting(book3d)) return;
    if (prefersReducedMotion()) book3d.turnToPage(index);
    else book3d.flip(index);
  }, []);

  useEffect(() => {
    const onKey = (event) => {
      if (event.target.closest('input, textarea, select, dialog')) return;
      if (['ArrowRight', 'PageDown', ' '].includes(event.key)) {
        event.preventDefault();
        turn(1);
      } else if (['ArrowLeft', 'PageUp'].includes(event.key)) {
        event.preventDefault();
        turn(-1);
      } else if (event.key === 'Home') goTo(0);
      else if (event.key === 'End') goTo(leaves.length - 1);
      else if (event.key === 'Escape') setMenu((shown) => !shown);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [turn, goTo, leaves.length]);

  // Dragging and swiping are handled by the page-flip library. A plain tap is
  // handled here: the edges turn the page, the middle opens the menu.
  const onPointerDown = (event) => {
    pointer.current = { x: event.clientX, y: event.clientY };
  };
  const onPointerUp = (event) => {
    const start = pointer.current;
    pointer.current = null;
    if (!start || event.target.closest('a, button, input, .reader-menu, dialog')) return;
    if (Math.abs(event.clientX - start.x) > 8 || Math.abs(event.clientY - start.y) > 8) return;
    const position = event.clientX / window.innerWidth;
    const corner = event.clientY < window.innerHeight / 2 ? 'top' : 'bottom';
    if (position < 0.3) turn(-1, corner);
    else if (position > 0.7) turn(1, corner);
    else setMenu((shown) => !shown);
  };

  // Jump to a page and show which row was meant.
  const showRow = (leafIndexToOpen, rowId) => {
    setMenu(false);
    setQuery('');
    goTo(leafIndexToOpen);
    setHighlightRowId(rowId);
    window.setTimeout(() => setHighlightRowId((current) => (current === rowId ? null : current)), 4000);
  };

  // Today: the first row dated today, or else the first thing left unticked.
  const goToToday = () => {
    const tablePages = leaves.map((leaf, index) => [leaf, index]).filter(([leaf]) => leaf.type === 'table' && leaf.column_part === 1);
    for (const [leaf, index] of tablePages) {
      const dateIndexes = leaf.columns.map((c, i) => (c.data_type === 'date' ? i : -1)).filter((i) => i >= 0);
      const row = leaf.rows.find((r) => dateIndexes.some((i) => r.cells[i] === today));
      if (row) return showRow(index, row.id);
    }
    for (const [leaf, index] of leaves.map((l, i) => [l, i]).filter(([l]) => l.type === 'table')) {
      const boxIndexes = leaf.columns.map((c, i) => (c.data_type === 'checkbox' ? i : -1)).filter((i) => i >= 0);
      const row = leaf.rows.find((r) =>
        boxIndexes.some((i) => {
          const changed = overrides[r.id];
          const value = changed && leaf.columns[i].id in changed ? changed[leaf.columns[i].id] : r.cells[i];
          return !value;
        })
      );
      if (row) return showRow(index, row.id);
    }
    setNote('Nothing is dated today, and nothing is left unticked.');
    window.setTimeout(() => setNote(''), 3500);
  };

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (needle.length < 1) return [];
    const found = [];
    leaves.forEach((leaf, index) => {
      if (leaf.type !== 'table') return;
      leaf.rows.forEach((row) => {
        const hitIndex = row.cells.findIndex((cell, i) => {
          const column = leaf.columns[i];
          const changed = overrides[row.id];
          const value = changed && column.id in changed ? changed[column.id] : cell;
          return value !== null && value !== undefined && typeof value !== 'boolean' &&
            (String(value).toLowerCase().includes(needle) || formatCell(value, column.data_type, false).toLowerCase().includes(needle));
        });
        if (hitIndex >= 0 && !found.some((f) => f.rowId === row.id)) {
          const matched = formatCell(row.cells[hitIndex], leaf.columns[hitIndex].data_type, false);
          const label = rowLabel(leaf, row);
          found.push({
            rowId: row.id,
            index,
            table: leaf.table_name,
            label: matched === label ? label : `${matched} · ${label}`,
            page: leaf.page_number,
          });
        }
      });
    });
    return found.slice(0, 20);
  }, [query, leaves, overrides]);

  const tick = async (row, column, value) => {
    const before = overrides;
    setOverrides((current) => ({ ...current, [row.id]: { ...(current[row.id] || {}), [column.id]: value } }));
    try {
      await api(`/rows/${row.id}/`, { method: 'PATCH', body: { data: { [column.id]: value } } });
    } catch (problem) {
      setOverrides(before);
      setNote(problem.message);
      window.setTimeout(() => setNote(''), 3500);
    }
  };

  const addedRow = (row) => {
    setAdding(null);
    place.current = { index: place.current.index, rowId: row.id };
    load();
    setNote('Row added.');
    window.setTimeout(() => setNote(''), 2500);
  };

  if (error) {
    return (
      <div className="reader">
        <div className="reader-message">
          <p>{error}</p>
          <Link to={`/books/${bookId}`} className="button">
            Back to the book
          </Link>
        </div>
      </div>
    );
  }
  if (!book) {
    return (
      <div className="reader">
        <p className="reader-message">Opening the book…</p>
      </div>
    );
  }

  // With two pages showing, a closed book (front or back cover) sits in the middle.
  const lastIndex = leaves.length - 1;
  const resting = !layout.spread ? '' : leafIndex === 0 ? ' at-front' : leafIndex >= lastIndex ? ' at-back' : '';
  const numbered = leaves[leafIndex]?.page_number;
  const currentTableId = leaves[leafIndex]?.table_id ?? leaves[leafIndex + 1]?.table_id ?? book.tables[0]?.id;
  const addingTable = adding ? book.tables.find((table) => table.id === adding) : null;

  return (
    <div className={`reader${night ? ' is-night' : ''}`} onPointerDown={onPointerDown} onPointerUp={onPointerUp}>
      <div
        ref={host}
        className={`book${layout.spread ? ' is-spread' : ''}${layout.compact ? ' is-compact' : ''}${resting}`}
        style={{ width: layout.pageWidth * (layout.spread ? 2 : 1), height: layout.pageHeight }}
      />
      {leafElements.map((element, index) =>
        leaves[index]
          ? createPortal(
              <>
                <Page
                  page={leaves[index]}
                  book={book}
                  layout={layout}
                  overrides={overrides}
                  highlightRowId={highlightRowId}
                  today={today}
                  canEdit={book.can_edit}
                  onTick={tick}
                  onAddRow={(tableId) => setAdding(tableId)}
                  onJump={(number) => goTo(number - 1)}
                />
                {index === ribbonIndex && index !== 0 && <span className="ribbon" title="Where you left off" />}
              </>,
              element
            )
          : null
      )}

      {menu && (
        <div className="reader-menu" role="dialog" aria-label="Book menu">
          <div className="menu-row">
            <Link to={`/books/${bookId}`} className="button">
              Close book
            </Link>
            <span className="menu-title">
              {book.title}
              {numbered ? `, page ${numbered} of ${book.page_count}` : ''}
            </span>
          </div>
          <div className="menu-row">
            <button type="button" className="button" onClick={goToToday}>
              Today
            </button>
            {book.can_edit && (
              <button type="button" className="button" onClick={() => setAdding(currentTableId)} disabled={!book.tables.length}>
                Add a row
              </button>
            )}
            <button type="button" className="button" onClick={() => setNight((on) => !on)} aria-pressed={night}>
              {night ? 'Day' : 'Night'}
            </button>
            <Link to={`/books/${bookId}/print`} className="button">
              Print
            </Link>
          </div>
          <div className="menu-row">
            <input
              type="search"
              className="menu-search"
              placeholder="Search this book"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              aria-label="Search this book"
            />
          </div>
          {query.trim() && (
            <ul className="menu-results">
              {results.length === 0 && <li className="menu-none">Nothing found.</li>}
              {results.map((hit) => (
                <li key={hit.rowId}>
                  <button type="button" onClick={() => showRow(hit.index, hit.rowId)}>
                    <span className="hit-label">{hit.label}</span>
                    <span className="hit-where">
                      {hit.table}, page {hit.page}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {note && (
        <p className="reader-hint" role="status">
          {note}
        </p>
      )}
      {hint && !menu && !note && (
        <p className="reader-hint">
          {layout.compact
            ? 'Drag or swipe to turn the page. Tap the middle for the menu.'
            : 'Drag a page, click its edge, or use the arrow keys. Click the middle for the menu.'}
        </p>
      )}

      {addingTable && (
        <Dialog title={`Add a row to ${addingTable.name}`} onClose={() => setAdding(null)}>
          {book.tables.length > 1 && (
            <label className="field">
              <span>Table</span>
              <select value={addingTable.id} onChange={(event) => setAdding(Number(event.target.value))}>
                {book.tables.map((table) => (
                  <option key={table.id} value={table.id}>
                    {table.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {addingTable.columns.length === 0 ? (
            <ErrorNote>This table has no columns yet. Add columns in the editor first.</ErrorNote>
          ) : (
            <RowForm key={addingTable.id} table={addingTable} onSaved={addedRow} />
          )}
        </Dialog>
      )}
    </div>
  );
}
