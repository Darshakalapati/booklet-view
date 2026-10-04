import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { DeleteSection, Dialog, ErrorNote } from './Dialog';

const TYPES = [
  ['text', 'Text'],
  ['number', 'Number'],
  ['date', 'Date'],
  ['checkbox', 'Checkbox'],
];
const typeLabel = (type) => TYPES.find(([value]) => value === type)[1];

const toDraft = (value) => (value === null || value === undefined ? '' : String(value));

// One cell of the grid. Typing changes a local draft; leaving the cell saves it.
function Cell({ column, value, label, autoFocus, onSave }) {
  const [draft, setDraft] = useState(toDraft(value));
  const [invalid, setInvalid] = useState(false);
  useEffect(() => {
    setDraft(toDraft(value));
    setInvalid(false);
  }, [value]);

  if (column.data_type === 'checkbox') {
    // Shows the tick at once and puts it back if the save fails.
    return (
      <input
        type="checkbox"
        className="cell-check"
        checked={draft === 'true'}
        aria-label={label}
        onChange={(event) => {
          setDraft(String(event.target.checked));
          onSave(event.target.checked).catch(() => setDraft(toDraft(value)));
        }}
      />
    );
  }

  const commit = async () => {
    if (draft === toDraft(value)) return;
    try {
      await onSave(draft.trim() === '' ? null : draft);
      setInvalid(false);
    } catch {
      setInvalid(true);
    }
  };

  return (
    <input
      className={`cell-input${column.data_type === 'number' ? ' is-number' : ''}`}
      type={column.data_type === 'date' ? 'date' : 'text'}
      inputMode={column.data_type === 'number' ? 'decimal' : undefined}
      value={draft}
      aria-label={label}
      aria-invalid={invalid || undefined}
      autoFocus={autoFocus}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur();
        if (event.key === 'Escape') {
          setDraft(toDraft(value));
          setInvalid(false);
        }
      }}
    />
  );
}

function ColumnForm({ initial, submitLabel, onSubmit }) {
  const [name, setName] = useState(initial?.name ?? '');
  const [dataType, setDataType] = useState(initial?.data_type ?? 'text');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    if (!name.trim()) {
      setError('Enter a column name.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await onSubmit({ name: name.trim(), data_type: dataType });
    } catch (problem) {
      setError(problem.message);
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="stack">
      <label className="field">
        <span>Column name</span>
        <input value={name} onChange={(event) => setName(event.target.value)} autoFocus maxLength={200} />
      </label>
      <label className="field">
        <span>Type</span>
        <select value={dataType} onChange={(event) => setDataType(event.target.value)}>
          {TYPES.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <ErrorNote>{error}</ErrorNote>
      <div className="row-actions">
        <button type="submit" className="button primary" disabled={busy}>
          {submitLabel}
        </button>
      </div>
    </form>
  );
}

// Moves one id inside a list of ids and returns the new list.
function shifted(ids, id, step) {
  const from = ids.indexOf(id);
  const to = from + step;
  if (to < 0 || to >= ids.length) return null;
  const next = [...ids];
  next.splice(from, 1);
  next.splice(to, 0, id);
  return next;
}

export default function TableEditor({ tableId }) {
  const [table, setTable] = useState(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(null); // {kind: 'add-column' | 'column' | 'row', item}
  const [newRowId, setNewRowId] = useState(null);
  const errorCell = useRef(null); // which cell the current error message is about

  const load = useCallback(async () => {
    try {
      setTable(await api(`/tables/${tableId}/`));
      setError('');
    } catch (problem) {
      setError(problem.message);
    }
  }, [tableId]);
  useEffect(() => {
    load();
  }, [load]);

  if (!table) return error ? <ErrorNote>{error}</ErrorNote> : <p className="loading">Opening table…</p>;

  const { columns, rows } = table;
  const close = () => setOpen(null);
  const closeAndReload = async () => {
    close();
    await load();
  };

  const saveCell = async (row, column, value) => {
    try {
      const saved = await api(`/rows/${row.id}/`, { method: 'PATCH', body: { data: { [column.id]: value } } });
      setTable((current) => ({
        ...current,
        rows: current.rows.map((item) => (item.id === saved.id ? saved : item)),
      }));
      // Clear the message only if it was about this same cell; a save of
      // another cell must not hide it.
      if (errorCell.current === `${row.id}:${column.id}`) {
        errorCell.current = null;
        setError('');
      }
    } catch (problem) {
      errorCell.current = `${row.id}:${column.id}`;
      setError(problem.message);
      throw problem;
    }
  };

  const addRow = async () => {
    try {
      const row = await api('/rows/', { method: 'POST', body: { table: table.id } });
      setNewRowId(row.id);
      setTable((current) => ({ ...current, rows: [...current.rows, row] }));
    } catch (problem) {
      setError(problem.message);
    }
  };

  const reorder = async (kind, ids) => {
    try {
      setTable(await api(`/tables/${table.id}/reorder-${kind}/`, { method: 'POST', body: { order: ids } }));
    } catch (problem) {
      setError(problem.message);
    }
  };

  const columnIds = columns.map((column) => column.id);
  const rowIds = rows.map((row) => row.id);

  return (
    <div className="editor">
      <ErrorNote>{error}</ErrorNote>

      {columns.length === 0 ? (
        <div className="empty">
          <p>This table has no columns yet. Add the first column, then add rows under it.</p>
          <button type="button" className="button primary" onClick={() => setOpen({ kind: 'add-column' })}>
            Add column
          </button>
        </div>
      ) : (
        <>
          <div className="grid-scroll">
            <table className="grid">
              <thead>
                <tr>
                  <th className="grid-corner" scope="col">
                    <span className="visually-hidden">Row</span>
                  </th>
                  {columns.map((column) => (
                    <th key={column.id} scope="col">
                      <button
                        type="button"
                        className="head-button"
                        onClick={() => setOpen({ kind: 'column', item: column })}
                        title="Open column"
                      >
                        <span className="head-name">{column.name}</span>
                        <span className="head-type">{typeLabel(column.data_type)}</span>
                      </button>
                    </th>
                  ))}
                  <th className="grid-add" scope="col">
                    <button type="button" className="button quiet" onClick={() => setOpen({ kind: 'add-column' })}>
                      Add column
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={row.id}>
                    <th scope="row" className="grid-rownum">
                      <button
                        type="button"
                        className="rownum-button"
                        onClick={() => setOpen({ kind: 'row', item: row, number: index + 1 })}
                        title="Open row"
                      >
                        {index + 1}
                      </button>
                    </th>
                    {columns.map((column, columnIndex) => (
                      <td key={column.id} className={column.data_type === 'checkbox' ? 'is-check' : undefined}>
                        <Cell
                          column={column}
                          value={row.data[column.id]}
                          label={`${column.name}, row ${index + 1}`}
                          autoFocus={row.id === newRowId && columnIndex === 0}
                          onSave={(value) => saveCell(row, column, value)}
                        />
                      </td>
                    ))}
                    <td className="grid-add" />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="row-actions">
            <button type="button" className="button" onClick={addRow}>
              Add row
            </button>
            <span className="muted small">
              {rows.length} {rows.length === 1 ? 'row' : 'rows'}. Changes save when you leave a cell.
            </span>
          </div>
        </>
      )}

      {open?.kind === 'add-column' && (
        <Dialog title="Add column" onClose={close}>
          <ColumnForm
            submitLabel="Add column"
            onSubmit={async (values) => {
              await api('/columns/', { method: 'POST', body: { table: table.id, ...values } });
              await closeAndReload();
            }}
          />
        </Dialog>
      )}

      {open?.kind === 'column' && (
        <Dialog title={`Column: ${open.item.name}`} onClose={close}>
          <ColumnForm
            initial={open.item}
            submitLabel="Save column"
            onSubmit={async (values) => {
              await api(`/columns/${open.item.id}/`, { method: 'PATCH', body: values });
              await closeAndReload();
            }}
          />
          <div className="row-actions">
            <button
              type="button"
              className="button"
              disabled={!shifted(columnIds, open.item.id, -1)}
              onClick={() => reorder('columns', shifted(columnIds, open.item.id, -1))}
            >
              Move left
            </button>
            <button
              type="button"
              className="button"
              disabled={!shifted(columnIds, open.item.id, 1)}
              onClick={() => reorder('columns', shifted(columnIds, open.item.id, 1))}
            >
              Move right
            </button>
          </div>
          <DeleteSection label="Delete this column" path={`/columns/${open.item.id}/`} onDeleted={closeAndReload} />
        </Dialog>
      )}

      {open?.kind === 'row' && (
        <Dialog title={`Row ${rowIds.indexOf(open.item.id) + 1}`} onClose={close}>
          <p className="muted">{rowSummary(columns, open.item) || 'This row is empty.'}</p>
          <div className="row-actions">
            <button
              type="button"
              className="button"
              disabled={!shifted(rowIds, open.item.id, -1)}
              onClick={() => reorder('rows', shifted(rowIds, open.item.id, -1))}
            >
              Move up
            </button>
            <button
              type="button"
              className="button"
              disabled={!shifted(rowIds, open.item.id, 1)}
              onClick={() => reorder('rows', shifted(rowIds, open.item.id, 1))}
            >
              Move down
            </button>
          </div>
          <DeleteSection label="Delete this row" path={`/rows/${open.item.id}/`} onDeleted={closeAndReload} />
        </Dialog>
      )}
    </div>
  );
}

function rowSummary(columns, row) {
  return columns
    .map((column) => row.data[column.id])
    .filter((value) => value !== null && value !== undefined && value !== false)
    .map((value) => (value === true ? 'Yes' : String(value)))
    .slice(0, 4)
    .join(', ');
}
