import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, NavLink, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { BookForm } from '../components/BookForm';
import { DeleteSection, Dialog, ErrorNote, NameForm } from '../components/Dialog';
import PhotoImport from '../components/PhotoImport';
import TableEditor from '../components/TableEditor';
import { whenWritten } from './Books';

// Ready-made sets of columns. A blank table is still there for anything else.
const TEMPLATES = [
  { key: 'blank', name: 'Blank', columns: [] },
  { key: 'ledger', name: 'Ledger', columns: [['Date', 'date'], ['Particulars', 'text'], ['In', 'number'], ['Out', 'number']] },
  { key: 'expenses', name: 'Expenses', columns: [['Date', 'date'], ['Item', 'text'], ['Amount', 'number'], ['Paid', 'checkbox']] },
  { key: 'prices', name: 'Price list', columns: [['Item', 'text'], ['Pack', 'text'], ['Price', 'number'], ['In stock', 'checkbox']] },
  { key: 'checklist', name: 'Checklist', columns: [['Task', 'text'], ['Done', 'checkbox']] },
  { key: 'tasks', name: 'Task list', columns: [['Task', 'text'], ['Who', 'text'], ['Due', 'date'], ['Done', 'checkbox']] },
  { key: 'attendance', name: 'Attendance', columns: [['Name', 'text'], ['Date', 'date'], ['Present', 'checkbox']] },
  { key: 'contacts', name: 'Contacts', columns: [['Name', 'text'], ['Phone', 'text'], ['Address', 'text'], ['Notes', 'text']] },
];

function TemplateForm({ onSubmit }) {
  const [name, setName] = useState('');
  const [template, setTemplate] = useState('blank');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const chosen = TEMPLATES.find((t) => t.key === template);

  const submit = async (event) => {
    event.preventDefault();
    if (!name.trim()) {
      setError('Enter a name.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await onSubmit(name.trim(), chosen.columns);
    } catch (problem) {
      setError(problem.message);
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="stack">
      <label className="field">
        <span>Table name</span>
        <input value={name} onChange={(event) => setName(event.target.value)} autoFocus maxLength={200} />
      </label>
      <fieldset className="templates">
        <legend>Start from</legend>
        {TEMPLATES.map((t) => (
          <label key={t.key} className={`template-choice${template === t.key ? ' is-chosen' : ''}`}>
            <input type="radio" name="template" value={t.key} checked={template === t.key} onChange={() => setTemplate(t.key)} />
            <span className="template-name">{t.name}</span>
            <span className="template-cols">{t.columns.length ? t.columns.map(([c]) => c).join(', ') : 'Add your own columns'}</span>
          </label>
        ))}
      </fieldset>
      <ErrorNote>{error}</ErrorNote>
      <div className="row-actions">
        <button type="submit" className="button primary" disabled={busy}>
          Add table
        </button>
      </div>
    </form>
  );
}

function ShareSection({ book, onChanged }) {
  const [readers, setReaders] = useState(null);
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    api(`/books/${book.id}/shares/`).then(setReaders).catch((problem) => setError(problem.message));
  }, [book.id]);

  const change = async (method) => {
    setError('');
    try {
      setReaders(await api(`/books/${book.id}/shares/`, { method, body: { username: username.trim() } }));
      setUsername('');
      onChanged();
    } catch (problem) {
      setError(problem.message);
    }
  };

  return (
    <div className="share-section">
      <h3>Who else can read this book</h3>
      <p className="muted small">They can open and read it, but not change it.</p>
      {readers && readers.length > 0 && (
        <ul className="reader-list">
          {readers.map((reader) => (
            <li key={reader.user}>
              <span>{reader.username}</span>
              <button
                type="button"
                className="button quiet"
                onClick={async () => {
                  try {
                    setReaders(await api(`/books/${book.id}/shares/`, { method: 'DELETE', body: { username: reader.username } }));
                    onChanged();
                  } catch (problem) {
                    setError(problem.message);
                  }
                }}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      <form
        className="row-actions"
        onSubmit={(event) => {
          event.preventDefault();
          if (username.trim()) change('POST');
        }}
      >
        <input value={username} onChange={(event) => setUsername(event.target.value)} placeholder="Username" aria-label="Username to share with" autoCapitalize="none" />
        <button type="submit" className="button">
          Share
        </button>
      </form>
      <ErrorNote>{error}</ErrorNote>
    </div>
  );
}

// One book, open for editing: its tables along the top, the chosen table below.
export default function Book() {
  const { bookId, tableId } = useParams();
  const navigate = useNavigate();
  const fileInput = useRef(null);
  const [book, setBook] = useState(null);
  const [tables, setTables] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [open, setOpen] = useState(null); // 'add-table' | 'photo' | 'book' | 'table'
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    try {
      const [loadedBook, loadedTables] = await Promise.all([api(`/books/${bookId}/`), api(`/tables/?book=${bookId}`)]);
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

  const readOnly = book.access === 'reader';
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
            {tables.length} {tables.length === 1 ? 'table' : 'tables'}, {whenWritten(book.last_written_at)}
            {readOnly ? `. Shared with you by ${book.owner_username}; you can read it but not change it.` : ''}
            {!readOnly && book.access === 'admin' ? `, owned by ${book.owner_username}` : ''}
            {!readOnly && book.reader_count > 0 ? `, shared with ${book.reader_count}` : ''}
          </p>
        </div>
        <div className="row-actions">
          <Link to={`/books/${bookId}/read`} className="button primary">
            Read as book
          </Link>
          {!readOnly && (
            <>
              <button type="button" className="button" onClick={() => setOpen('add-table')}>
                Add table
              </button>
              <button type="button" className="button" onClick={() => fileInput.current.click()} disabled={uploading}>
                {uploading ? 'Uploading…' : 'Upload Excel or CSV'}
              </button>
              <button type="button" className="button" onClick={() => setOpen('photo')}>
                From a photo
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
            </>
          )}
          <Link to={`/books/${bookId}/print`} className="button quiet">
            Print
          </Link>
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
          {readOnly
            ? 'This book has no tables yet.'
            : 'This book has no tables yet. Add a table and type into it, upload an Excel or CSV file, or read one from a photo.'}
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
                {!readOnly && (
                  <button type="button" className="button quiet" onClick={() => setOpen('table')}>
                    Table settings
                  </button>
                )}
              </div>
              <TableEditor key={current.id} tableId={current.id} readOnly={readOnly} />
            </>
          )}
        </>
      )}

      {open === 'add-table' && (
        <Dialog title="Add table" onClose={close}>
          <TemplateForm
            onSubmit={async (name, columns) => {
              const table = await api('/tables/', { method: 'POST', body: { book: book.id, name } });
              for (const [columnName, dataType] of columns) {
                await api('/columns/', { method: 'POST', body: { table: table.id, name: columnName, data_type: dataType } });
              }
              close();
              await load();
              navigate(`/books/${bookId}/tables/${table.id}`);
            }}
          />
        </Dialog>
      )}

      {open === 'photo' && (
        <Dialog title="Table from a photo" onClose={close}>
          <PhotoImport
            bookId={book.id}
            onSaved={async (table) => {
              close();
              await load();
              setNotice(`Added table “${table.name}” from the photo. Check it over and fix anything the camera misread.`);
              navigate(`/books/${bookId}/tables/${table.id}`);
            }}
          />
        </Dialog>
      )}

      {open === 'book' && (
        <Dialog title="Book settings" onClose={close}>
          <BookForm
            initial={book}
            submitLabel="Save"
            onSubmit={async (values) => {
              setBook(await api(`/books/${book.id}/`, { method: 'PATCH', body: values }));
              close();
            }}
          />
          <ShareSection book={book} onChanged={load} />
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
            <button type="button" className="button" disabled={tableIndex >= tables.length - 1} onClick={() => moveTable(1)}>
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
