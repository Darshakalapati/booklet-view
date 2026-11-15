import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { Dialog, ErrorNote } from '../components/Dialog';
import { BookForm } from '../components/BookForm';

// "last written: yesterday", in plain words.
export function whenWritten(iso) {
  if (!iso) return 'nothing written yet';
  const then = new Date(iso);
  const days = Math.floor((Date.now() - then.getTime()) / 86400000);
  if (days <= 0) return 'written today';
  if (days === 1) return 'written yesterday';
  if (days < 7) return `written ${days} days ago`;
  return `last written ${then.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`;
}

// The shelf: every book the signed-in person can open.
export default function Books() {
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [books, setBooks] = useState(null);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);

  const load = useCallback(() => {
    api('/books/')
      .then(setBooks)
      .catch((problem) => setError(problem.message));
  }, []);
  useEffect(load, [load]);

  const mine = (books || []).filter((book) => book.access !== 'reader');
  const shared = (books || []).filter((book) => book.access === 'reader');

  const shelf = (list) => (
    <ul className="shelf">
      {list.map((book) => (
        <li key={book.id}>
          <Link to={`/books/${book.id}`} className="book-cover" data-cloth={book.color}>
            <span className="cover-plate">
              <span className="plate-title">{book.title}</span>
              <span className="plate-rule" />
              <span className="plate-sub">{book.subtitle || `${book.table_count} ${book.table_count === 1 ? 'table' : 'tables'}`}</span>
            </span>
          </Link>
          <p className="shelf-note">
            {whenWritten(book.last_written_at)}
            {book.access === 'reader' && <> · from {book.owner_username}</>}
            {isAdmin && book.access === 'admin' && <> · {book.owner_username}</>}
          </p>
        </li>
      ))}
    </ul>
  );

  return (
    <section>
      <div className="page-head">
        <div>
          <h1>Books</h1>
          <p className="muted">
            {isAdmin ? 'Every user’s books. Open one to edit its tables.' : 'Open a book to edit its tables, or read it.'}
          </p>
        </div>
        <button type="button" className="button primary" onClick={() => setAdding(true)}>
          New book
        </button>
      </div>
      <ErrorNote>{error}</ErrorNote>

      {books && books.length === 0 && (
        <p className="empty">No books yet. Create your first book, then add tables to it or upload a spreadsheet.</p>
      )}
      {shelf(mine)}
      {shared.length > 0 && (
        <>
          <h2 className="shelf-heading">Shared with you</h2>
          {shelf(shared)}
        </>
      )}

      {adding && (
        <Dialog title="New book" onClose={() => setAdding(false)}>
          <BookForm
            submitLabel="Create book"
            onSubmit={async (values) => {
              const book = await api('/books/', { method: 'POST', body: values });
              navigate(`/books/${book.id}`);
            }}
          />
        </Dialog>
      )}
    </section>
  );
}
