import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { ErrorNote } from '../components/Dialog';

const KINDS = [
  { key: 'books', title: 'Books', path: 'books', name: (item) => item.title },
  { key: 'tables', title: 'Tables', path: 'tables', name: (item) => item.name },
  { key: 'columns', title: 'Columns', path: 'columns', name: (item) => item.name },
  {
    key: 'rows',
    title: 'Rows',
    path: 'rows',
    name: (item) =>
      Object.values(item.data)
        .filter((value) => value !== null && value !== false)
        .map((value) => (value === true ? 'Yes' : String(value)))
        .slice(0, 4)
        .join(', ') || 'Empty row',
  },
];

const when = (iso) =>
  new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

// Everything that was deleted and can still be brought back.
export default function Trash() {
  const [trash, setTrash] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api('/trash/')
      .then(setTrash)
      .catch((problem) => setError(problem.message));
  }, []);
  useEffect(load, [load]);

  const restore = async (path, id) => {
    try {
      await api(`/${path}/${id}/restore/`, { method: 'POST' });
      load();
    } catch (problem) {
      setError(problem.message);
    }
  };

  const isEmpty = trash && KINDS.every((kind) => trash[kind.key].length === 0);

  return (
    <section>
      <div className="page-head">
        <div>
          <h1>Trash</h1>
          <p className="muted">Deleted books, tables, columns and rows stay here until you restore them.</p>
        </div>
      </div>
      <ErrorNote>{error}</ErrorNote>
      {isEmpty && <p className="empty">The trash is empty.</p>}
      {trash &&
        KINDS.filter((kind) => trash[kind.key].length > 0).map((kind) => (
          <div key={kind.key} className="trash-group">
            <h2>{kind.title}</h2>
            <ul className="trash-list">
              {trash[kind.key].map((item) => (
                <li key={item.id}>
                  <span>
                    <strong>{kind.name(item)}</strong>
                    <span className="muted small"> deleted {when(item.deleted_at)}</span>
                  </span>
                  <button type="button" className="button" onClick={() => restore(kind.path, item.id)}>
                    Restore
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
    </section>
  );
}
