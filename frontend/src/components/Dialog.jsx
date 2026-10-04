import { useEffect, useRef, useState } from 'react';
import { confirmDelete, describeDelete } from '../api';

// A window that opens over the page. Uses the browser's own <dialog>, so the
// Escape key and keyboard focus behave correctly without extra code.
export function Dialog({ title, onClose, children }) {
  const ref = useRef(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog.open) dialog.showModal();
    return () => dialog.open && dialog.close();
  }, []);

  return (
    <dialog
      ref={ref}
      className="dialog"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => event.target === ref.current && onClose()}
    >
      <div className="dialog-body">
        <div className="dialog-head">
          <h2>{title}</h2>
          <button type="button" className="button quiet" onClick={onClose}>
            Close
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}

export function ErrorNote({ children }) {
  if (!children) return null;
  return (
    <p className="error-note" role="alert">
      {children}
    </p>
  );
}

// Delete lives inside an item's own window, never in the normal view, and it
// always asks before removing anything.
export function DeleteSection({ label, path, onDeleted }) {
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const ask = async () => {
    setError('');
    setBusy(true);
    try {
      setSummary((await describeDelete(path)) || label);
    } catch (problem) {
      setError(problem.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await confirmDelete(path);
      onDeleted();
    } catch (problem) {
      setError(problem.message);
      setBusy(false);
    }
  };

  return (
    <div className="delete-section">
      {summary === null ? (
        <button type="button" className="button danger-quiet" onClick={ask} disabled={busy}>
          {label}
        </button>
      ) : (
        <div className="confirm-box" role="alertdialog" aria-label="Confirm delete">
          <p>
            <strong>{summary}</strong> will be moved to the trash. You can restore it from there.
          </p>
          <div className="row-actions">
            <button type="button" className="button danger" onClick={remove} disabled={busy}>
              Delete
            </button>
            <button type="button" className="button" onClick={() => setSummary(null)} disabled={busy}>
              Keep
            </button>
          </div>
        </div>
      )}
      <ErrorNote>{error}</ErrorNote>
    </div>
  );
}

// A small form with one text field, used for naming and renaming things.
export function NameForm({ label, initial = '', submitLabel, onSubmit, children }) {
  const [value, setValue] = useState(initial);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    if (!value.trim()) {
      setError('Enter a name.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await onSubmit(value.trim());
    } catch (problem) {
      setError(problem.message);
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="stack">
      <label className="field">
        <span>{label}</span>
        <input value={value} onChange={(event) => setValue(event.target.value)} autoFocus maxLength={200} />
      </label>
      {children}
      <ErrorNote>{error}</ErrorNote>
      <div className="row-actions">
        <button type="submit" className="button primary" disabled={busy}>
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
