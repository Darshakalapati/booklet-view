import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, NavLink, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { DeleteSection, Dialog, ErrorNote, NameForm } from '../components/Dialog';
import TableEditor from '../components/TableEditor';

// One book, open for editing: its tables along the top, the chosen table below.
export default function Book() {
  const { bookId, tableId } = useParams();
  const navigate = useNavigate();
  const fileInput = useRef(null);
  const [book, setBook] = useState(null);
  const [tables, setTables] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [open, setOpen] = useState(null); // 'add-table' | 'book' | 'table'
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    try {
      const [loadedBook, loadedTables] = await Promise.all([
        api(`/books/${bookId}/`),
        api(`/tables/?book=${bookId}`),
      ]);
      setBook(loadedBook);
      setTables(loadedTables);
      setError('');
      return loadedTables;
    } catch (problem) {
      setError(problem.status === 404 ? 'This book does not exist, or it is not yours.' : problem.message);
      return null;
    }
  }, [bookId]);

  useEffect(() => {
    load();
  }, [load]);

  // With no table chosen in the address, open the first one.
  useEffect(() => {
    if (!tables || tables.length === 0) return;
    const chosen = tables.some((table) => String(table.id) === tableId);
    if (!chosen) navigate(`/books/${bookId}/tables/${tables[0].id}`, { replace: true });
  }, [tables, tableId, bookId, navigate]);

  if (error && !book) {
    return (
      <section>
        <ErrorNote>{error}</ErrorNote>
        <Link to="/">Back to books</Link>
      </section>
    );
  }
  if (!book || !tables) return <p className="loading">Opening book…</p>;

  const current = tables.find((table) => String(table.id) === tableId);
  const close = () => setOpen(null);

  const upload = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setUploading(true);
    setError('');
    setNotice('');
    try {
      const form = new FormData();
      form.append('file', file);
      const result = await api(`/books/${bookId}/import/`, { method: 'POST', form });
      await load();
      const names = result.tables.map((table) => `“${table.name}”`).join(', ');
      setNotice(`Added ${result.tables.length === 1 ? 'table' : 'tables'} ${names} from ${file.name}.`);
      navigate(`/books/${bookId}/tables/${result.tables[0].id}`);
    } catch (problem) {
      setError(problem.message);
    } finally {
      setUploading(false);
    }
  };

  const moveTable = async (step) => {
    const ids = tables.map((table) => table.id);
    const from = ids.indexOf(current.id);
    const to = from + step;
    if (to < 0 || to >= ids.length) return;
    ids.splice(from, 1);
    ids.splice(to, 0, current.id);
    try {
      setTables(await api(`/books/${bookId}/reorder-tables/`, { method: 'POST', body: { order: ids } }));
    } catch (problem) {
      setError(problem.message);
    }
  };

  const tableIndex = current ? tables.indexOf(current) : -1;

  return (
    <section>
      <p className="crumb">
        <Link to="/">Books</Link>
      </p>
      <div className="page-head">
        <div>
          <h1>{book.title}</h1>
          <p className="muted">
            {tables.length} {tables.length === 1 ? 'table' : 'tables'}
            {book.owner_username ? `, owned by ${book.owner_username}` : ''}
          </p>
        </div>
        <div className="row-actions">
          <Link to={`/books/${bookId}/read`} className="button primary">
            Read as book
          </Link>
          <button type="button" className="button" onClick={() => fileInput.current.click()} disabled={uploading}>
            {uploading ? 'Uploading…' : 'Upload Excel or CSV'}
          </button>
          <button type="button" className="button" onClick={() => setOpen('add-table')}>
            Add table
          </button>
          <button type="button" className="button quiet" onClick={() => setOpen('book')}>
            Book settings
          </button>
          <input
            ref={fileInput}
            type="file"
            accept=".xlsx,.csv"
            className="visually-hidden"
            onChange={upload}
            aria-label="Upload an Excel or CSV file"
            tabIndex={-1}
          />
        </div>
      </div>

      <ErrorNote>{error}</ErrorNote>
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}

      {tables.length === 0 ? (
        <p className="empty">
          This book has no tables yet. Add a table and type into it, or upload an Excel or CSV file to create one.
        </p>
      ) : (
        <>
          <div className="tabs" role="tablist" aria-label="Tables in this book">
            {tables.map((table) => (
              <NavLink key={table.id} to={`/books/${bookId}/tables/${table.id}`} role="tab" className="tab">
                {table.name}
              </NavLink>
            ))}
          </div>
          {current && (
            <>
              <div className="table-head">
                <h2>{current.name}</h2>
                <button type="button" className="button quiet" onClick={() => setOpen('table')}>
                  Table settings
                </button>
              </div>
              <TableEditor key={current.id} tableId={current.id} />
            </>
          )}
        </>
      )}

      {open === 'add-table' && (
        <Dialog title="Add table" onClose={close}>
          <NameForm
            label="Table name"
            submitLabel="Add table"
            onSubmit={async (name) => {
              const table = await api('/tables/', { method: 'POST', body: { book: book.id, name } });
              close();
              await load();
              navigate(`/books/${bookId}/tables/${table.id}`);
            }}
          />
        </Dialog>
      )}

      {open === 'book' && (
        <Dialog title="Book settings" onClose={close}>
          <NameForm
            label="Title"
            initial={book.title}
            submitLabel="Save title"
            onSubmit={async (title) => {
              setBook(await api(`/books/${book.id}/`, { method: 'PATCH', body: { title } }));
              close();
            }}
          />
          <DeleteSection label="Delete this book" path={`/books/${book.id}/`} onDeleted={() => navigate('/')} />
        </Dialog>
      )}

      {open === 'table' && current && (
        <Dialog title="Table settings" onClose={close}>
          <NameForm
            label="Table name"
            initial={current.name}
            submitLabel="Save name"
            onSubmit={async (name) => {
              await api(`/tables/${current.id}/`, { method: 'PATCH', body: { name } });
              close();
              await load();
            }}
          />
          <div className="row-actions">
            <button type="button" className="button" disabled={tableIndex <= 0} onClick={() => moveTable(-1)}>
              Move earlier
            </button>
            <button
              type="button"
              className="button"
              disabled={tableIndex >= tables.length - 1}
              onClick={() => moveTable(1)}
            >
              Move later
            </button>
          </div>
          <DeleteSection
            label="Delete this table"
            path={`/tables/${current.id}/`}
            onDeleted={async () => {
              close();
              await load();
              navigate(`/books/${bookId}`, { replace: true });
            }}
          />
        </Dialog>
      )}
    </section>
  );
}
