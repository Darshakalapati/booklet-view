import { useState } from 'react';
import { ErrorNote } from './Dialog';

export const CLOTHS = [
  ['navy', 'Navy'],
  ['green', 'Green'],
  ['maroon', 'Maroon'],
  ['brown', 'Brown'],
  ['black', 'Black'],
];

// Title, short label and cover cloth of a book.
export function BookForm({ initial = {}, submitLabel, onSubmit }) {
  const [title, setTitle] = useState(initial.title ?? '');
  const [subtitle, setSubtitle] = useState(initial.subtitle ?? '');
  const [color, setColor] = useState(initial.color ?? 'navy');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    if (!title.trim()) {
      setError('Enter a title.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await onSubmit({ title: title.trim(), subtitle: subtitle.trim(), color });
    } catch (problem) {
      setError(problem.message);
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="stack">
      <label className="field">
        <span>Title</span>
        <input value={title} onChange={(event) => setTitle(event.target.value)} autoFocus maxLength={200} />
      </label>
      <label className="field">
        <span>Short label on the cover</span>
        <input value={subtitle} onChange={(event) => setSubtitle(event.target.value)} maxLength={60} placeholder="Home accounts, Shop stock…" />
      </label>
      <fieldset className="cloths">
        <legend>Cover</legend>
        {CLOTHS.map(([value, label]) => (
          <label key={value} className={`cloth-choice${color === value ? ' is-chosen' : ''}`} data-cloth={value} title={label}>
            <input type="radio" name="cloth" value={value} checked={color === value} onChange={() => setColor(value)} />
            <span className="visually-hidden">{label}</span>
          </label>
        ))}
      </fieldset>
      <ErrorNote>{error}</ErrorNote>
      <div className="row-actions">
        <button type="submit" className="button primary" disabled={busy}>
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
