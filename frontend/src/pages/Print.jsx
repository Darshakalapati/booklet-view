import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';

// The whole book laid out for paper: two pages per sheet, like the open book.
// The browser's own print window turns it into a PDF.
const COLUMNS = 6;
const ROWS = 28;

function format(value, type) {
  if (value === null || value === undefined) return '';
  if (type === 'number' && typeof value === 'number') return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value);
  if (type === 'checkbox') return value ? '✓' : '';
  return String(value);
}

function Sheet({ page }) {
  if (!page) return <div className="print-page is-empty" />;
  if (page.type === 'cover') {
    return (
      <div className="print-page print-cover" data-cloth={page.color}>
        <div className="cover-plate">
          <span className="plate-title">{page.title}</span>
          <span className="plate-rule" />
          <span className="plate-sub">{page.subtitle || page.owner}</span>
        </div>
      </div>
    );
  }
  if (page.type === 'contents') {
    return (
      <div className="print-page">
        <h2>Contents</h2>
        <ol className="print-contents">
          {page.entries.map((entry) => (
            <li key={entry.table_id}>
              <span>{entry.table_name}</span>
              <span>{entry.page_number}</span>
            </li>
          ))}
        </ol>
        <footer>{page.page_number}</footer>
      </div>
    );
  }
  const totals = page.totals;
  return (
    <div className="print-page">
      <h2>
        {page.table_name}
        {!page.starts_table && <small> continued</small>}
      </h2>
      {page.column_parts > 1 && (
        <p className="print-part">
          Columns, part {page.column_part} of {page.column_parts}
        </p>
      )}
      <table className="ledger print-ledger">
        <thead>
          <tr>
            {page.columns.map((column) => (
              <th key={column.id} className={`is-${column.data_type}`}>
                {column.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {page.rows.map((row) => (
            <tr key={row.id}>
              {row.cells.map((cell, index) => (
                <td key={page.columns[index].id} className={`is-${page.columns[index].data_type}`}>
                  {format(cell, page.columns[index].data_type)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {totals && (
          <tfoot>
            <tr className="ledger-total">
              {page.columns.map((column, index) => (
                <td key={column.id} className={`is-${column.data_type}`}>
                  {index === 0 ? (page.last_rows ? 'Total' : 'Carried forward') : totals[index] ? format(totals[index].running, 'number') : ''}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
      <footer>{page.page_number}</footer>
    </div>
  );
}

export default function Print() {
  const { bookId } = useParams();
  const [book, setBook] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api(`/books/${bookId}/booklet/?columns_per_page=${COLUMNS}&rows_per_page=${ROWS}`)
      .then(setBook)
      .catch((problem) => setError(problem.message));
  }, [bookId]);

  useEffect(() => {
    if (book) document.title = `${book.title} – Booklet View`;
    return () => {
      document.title = 'Booklet View';
    };
  }, [book]);

  if (error) return <p className="loading">{error}</p>;
  if (!book) return <p className="loading">Preparing the pages…</p>;

  const pages = book.pages.map((page) => (page.type === 'cover' ? { ...page, color: book.color, subtitle: book.subtitle } : page));
  // The cover sits alone on the first sheet; the rest go two to a sheet, left and right.
  const sheets = [[null, pages[0]]];
  for (let index = 1; index < pages.length; index += 2) sheets.push([pages[index], pages[index + 1] ?? null]);

  return (
    <div className="print-view">
      <div className="print-bar">
        <Link to={`/books/${bookId}/read`} className="button">
          Back to the book
        </Link>
        <span className="muted">
          {book.title}: {book.page_count} pages on {sheets.length} sheets. Choose landscape paper.
        </span>
        <button type="button" className="button primary" onClick={() => window.print()}>
          Print or save as PDF
        </button>
      </div>
      {sheets.map((pair, index) => (
        <div key={index} className="print-sheet">
          <Sheet page={pair[0]} />
          <Sheet page={pair[1]} />
        </div>
      ))}
    </div>
  );
}
