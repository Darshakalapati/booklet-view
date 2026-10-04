import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { Dialog, ErrorNote, NameForm } from '../components/Dialog';

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

  const create = async (title) => {
    const book = await api('/books/', { method: 'POST', body: { title } });
    navigate(`/books/${book.id}`);
  };

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

      <ul className="shelf">
        {(books || []).map((book) => (
          <li key={book.id}>
            <Link to={`/books/${book.id}`} className="book-cover">
              <span className="cover-plate">
                <span className="plate-title">{book.title}</span>
                <span className="plate-rule" />
                <span className="plate-sub">
                  {book.table_count} {book.table_count === 1 ? 'table' : 'tables'}
                </span>
              </span>
            </Link>
            {isAdmin && book.owner !== user.id && <p className="shelf-owner">{book.owner_username}</p>}
          </li>
        ))}
      </ul>

      {adding && (
        <Dialog title="New book" onClose={() => setAdding(false)}>
          <NameForm label="Title" submitLabel="Create book" onSubmit={create} />
        </Dialog>
      )}
    </section>
  );
}
