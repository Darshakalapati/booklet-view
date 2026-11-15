import { useState } from 'react';
import { api } from '../api';
import { ErrorNote } from './Dialog';

// A form with one field per column, for adding a row without opening the grid.
export function RowForm({ table, onSaved }) {
  const [values, setValues] = useState(() =>
    Object.fromEntries(table.columns.map((column) => [column.id, column.data_type === 'checkbox' ? false : '']))
  );
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    const data = {};
    for (const column of table.columns) {
      const value = values[column.id];
      if (column.data_type === 'checkbox') data[column.id] = Boolean(value);
      else if (String(value).trim() !== '') data[column.id] = value;
    }
    try {
      const row = await api('/rows/', { method: 'POST', body: { table: table.id, data } });
      onSaved(row);
    } catch (problem) {
      setError(problem.message);
      setBusy(false);
    }
  };

  return (
    <form className="stack" onSubmit={submit}>
      {table.columns.map((column, index) =>
        column.data_type === 'checkbox' ? (
          <label key={column.id} className="check-field">
            <input
              type="checkbox"
              className="cell-check"
              checked={Boolean(values[column.id])}
              onChange={(event) => setValues({ ...values, [column.id]: event.target.checked })}
            />
            <span>{column.name}</span>
          </label>
        ) : (
          <label key={column.id} className="field">
            <span>{column.name}</span>
            <input
              type={column.data_type === 'date' ? 'date' : 'text'}
              inputMode={column.data_type === 'number' ? 'decimal' : undefined}
              value={values[column.id]}
              autoFocus={index === 0}
              onChange={(event) => setValues({ ...values, [column.id]: event.target.value })}
            />
          </label>
        )
      )}
      <ErrorNote>{error}</ErrorNote>
      <div className="row-actions">
        <button type="submit" className="button primary" disabled={busy}>
          Add row
        </button>
      </div>
    </form>
  );
}
