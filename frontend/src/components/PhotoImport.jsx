import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { ErrorNote } from './Dialog';

// Turns a photo of a paper table into a table in the book.
//
// The reading of the photo happens in the browser, on the phone itself, with
// the open-source Tesseract engine. Nothing is sent to the server until the
// person has checked the rows and pressed Save.

const MAX_SIDE = 2000; // photos are shrunk to this before reading; faster and no less accurate

async function shrink(file) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext('2d');
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  // Grey, with a little more contrast: handwriting and faint print read better.
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  const px = image.data;
  for (let i = 0; i < px.length; i += 4) {
    const grey = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
    const boosted = Math.max(0, Math.min(255, (grey - 128) * 1.25 + 128));
    px[i] = px[i + 1] = px[i + 2] = boosted;
  }
  context.putImageData(image, 0, 0);
  return canvas;
}

// Groups the words Tesseract found into lines, then splits each line into
// cells wherever there is a gap much wider than the spaces between words.
export function wordsToGrid(words) {
  const usable = words.filter((w) => w.text.trim() && w.confidence > 15);
  if (!usable.length) return [];
  const heights = usable.map((w) => w.bbox.y1 - w.bbox.y0).sort((a, b) => a - b);
  const lineHeight = heights[Math.floor(heights.length / 2)] || 20;

  const lines = [];
  for (const word of usable.sort((a, b) => (a.bbox.y0 + a.bbox.y1) / 2 - (b.bbox.y0 + b.bbox.y1) / 2)) {
    const middle = (word.bbox.y0 + word.bbox.y1) / 2;
    const line = lines.find((l) => Math.abs(l.middle - middle) < lineHeight * 0.6);
    if (line) {
      line.words.push(word);
      line.middle = (line.middle * (line.words.length - 1) + middle) / line.words.length;
    } else lines.push({ middle, words: [word] });
  }

  // Gaps between words come in two kinds: the small space inside a cell and
  // the wide gap between columns. The widest jump in the sorted gaps separates
  // the two; a gap on the wide side starts a new cell.
  const gaps = [];
  lines.forEach((line) => {
    line.words.sort((a, b) => a.bbox.x0 - b.bbox.x0);
    for (let i = 1; i < line.words.length; i++) gaps.push(Math.max(1, line.words[i].bbox.x0 - line.words[i - 1].bbox.x1));
  });
  gaps.sort((a, b) => a - b);
  let gapLimit = lineHeight * 0.9;
  if (gaps.length >= 2) {
    let bestJump = 1.8;
    for (let i = 0; i < gaps.length - 1; i++) {
      const jump = gaps[i + 1] / gaps[i];
      if (jump > bestJump && gaps[i + 1] > lineHeight * 0.7) {
        bestJump = jump;
        gapLimit = (gaps[i] + gaps[i + 1]) / 2;
      }
    }
    if (bestJump === 1.8) gapLimit = Math.max(gapLimit, gaps[0] > lineHeight * 0.7 ? gaps[0] * 0.8 : lineHeight * 0.9);
  }

  const rows = lines.map((line) => {
    const cells = [];
    let current = null;
    for (const word of line.words) {
      if (current && word.bbox.x0 - current.x1 <= gapLimit) {
        current.text += ` ${word.text}`;
        current.x1 = word.bbox.x1;
      } else {
        current = { text: word.text, x0: word.bbox.x0, x1: word.bbox.x1 };
        cells.push(current);
      }
    }
    return cells;
  });

  // Line the cells up into columns by where they start on the page.
  const starts = rows.flatMap((cells) => cells.map((c) => c.x0)).sort((a, b) => a - b);
  const columns = [];
  for (const x of starts) {
    const near = columns.find((c) => Math.abs(c - x) < lineHeight * 1.6);
    if (near === undefined) columns.push(x);
  }
  const width = Math.max(1, ...rows.map((cells) => cells.length));
  return rows.map((cells) => {
    const out = Array.from({ length: Math.max(columns.length, width) }, () => '');
    for (const cell of cells) {
      let slot = columns.findIndex((c) => Math.abs(c - cell.x0) < lineHeight * 1.6);
      if (slot < 0) slot = out.findIndex((v) => v === '');
      while (slot < out.length && out[slot]) slot++;
      if (slot < out.length) out[slot] = cell.text.trim();
    }
    return out;
  }).filter((row) => row.some(Boolean));
}

const guessType = (values) => {
  const filled = values.filter((v) => v.trim() !== '');
  if (!filled.length) return 'text';
  if (filled.every((v) => /^-?[\d,]+(\.\d+)?$/.test(v.trim()) && !/^0\d/.test(v.trim()))) return 'number';
  if (filled.every((v) => /^(yes|no|y|n|✓|✗|true|false)$/i.test(v.trim()))) return 'checkbox';
  return 'text';
};

export default function PhotoImport({ bookId, onSaved }) {
  const input = useRef(null);
  const [stage, setStage] = useState('pick'); // pick | reading | review | saving
  const [progress, setProgress] = useState('');
  const [grid, setGrid] = useState([]);
  const [firstRowIsHeader, setFirstRowIsHeader] = useState(true);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const worker = useRef(null);

  useEffect(() => () => worker.current?.terminate(), []);

  const read = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setError('');
    setStage('reading');
    setProgress('Preparing the photo…');
    try {
      const canvas = await shrink(file);
      setProgress('Loading the reader (first time only)…');
      const { createWorker } = await import('tesseract.js');
      worker.current = await createWorker('eng', 1, {
        // The engine is served by this site itself (see scripts/copy-ocr.mjs).
        workerPath: '/ocr/worker.min.js',
        corePath: '/ocr/',
        langPath: '/ocr/',
        logger: (m) => {
          if (m.status === 'recognizing text') setProgress(`Reading… ${Math.round(m.progress * 100)}%`);
        },
      });
      await worker.current.setParameters({ preserve_interword_spaces: '1' });
      const result = await worker.current.recognize(canvas, {}, { blocks: true });
      const words = result.data.words && result.data.words.length
        ? result.data.words
        : (result.data.blocks || []).flatMap((b) => b.paragraphs.flatMap((p) => p.lines.flatMap((l) => l.words)));
      const rows = wordsToGrid(words);
      if (!rows.length) throw new Error('No words could be read from this photo. Try better light, and hold the phone straight above the page.');
      setGrid(rows);
      setName(file.name.replace(/\.[^.]+$/, '').slice(0, 60) || 'From photo');
      setStage('review');
    } catch (problem) {
      setError(problem.message || 'The photo could not be read.');
      setStage('pick');
    }
  };

  const columnCount = Math.max(0, ...grid.map((r) => r.length));
  const setCell = (r, c, value) => setGrid((g) => g.map((row, i) => (i === r ? row.map((cell, j) => (j === c ? value : cell)) : row)));
  const removeRow = (r) => setGrid((g) => g.filter((_, i) => i !== r));
  const removeColumn = (c) => setGrid((g) => g.map((row) => row.filter((_, j) => j !== c)));

  const save = async () => {
    setStage('saving');
    setError('');
    try {
      const header = firstRowIsHeader ? grid[0] : Array.from({ length: columnCount }, (_, i) => `Column ${i + 1}`);
      const body = firstRowIsHeader ? grid.slice(1) : grid;
      const table = await api('/tables/', { method: 'POST', body: { book: bookId, name: name.trim() || 'From photo' } });
      const columns = [];
      for (let c = 0; c < columnCount; c++) {
        const type = guessType(body.map((row) => row[c] ?? ''));
        columns.push(await api('/columns/', { method: 'POST', body: { table: table.id, name: (header[c] || `Column ${c + 1}`).slice(0, 190), data_type: type } }));
      }
      for (const row of body) {
        const data = {};
        columns.forEach((column, c) => {
          const raw = (row[c] ?? '').trim();
          if (!raw) return;
          if (column.data_type === 'number') data[column.id] = raw.replace(/,/g, '');
          else if (column.data_type === 'checkbox') data[column.id] = /^(yes|y|✓|true)$/i.test(raw);
          else data[column.id] = raw;
        });
        await api('/rows/', { method: 'POST', body: { table: table.id, data } });
      }
      onSaved(table);
    } catch (problem) {
      setError(problem.message);
      setStage('review');
    }
  };

  if (stage === 'pick' || stage === 'reading') {
    return (
      <div className="stack">
        <p className="muted">
          Photograph the page from straight above, in good light, with the table filling the picture. The photo is read
          on this device and nothing is saved until you have checked the rows.
        </p>
        <input ref={input} type="file" accept="image/*" capture="environment" className="visually-hidden" onChange={read} tabIndex={-1} />
        <ErrorNote>{error}</ErrorNote>
        <div className="row-actions">
          <button type="button" className="button primary" onClick={() => input.current.click()} disabled={stage === 'reading'}>
            {stage === 'reading' ? progress : 'Choose or take a photo'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="stack">
      <p className="muted">Check the rows below. Tap a cell to correct it. Remove rows or columns that are not part of the table.</p>
      <label className="field">
        <span>Table name</span>
        <input value={name} onChange={(event) => setName(event.target.value)} maxLength={200} />
      </label>
      <label className="check-field">
        <input type="checkbox" className="cell-check" checked={firstRowIsHeader} onChange={(event) => setFirstRowIsHeader(event.target.checked)} />
        <span>The first row holds the column names</span>
      </label>
      <div className="grid-scroll">
        <table className="grid review-grid">
          <thead>
            <tr>
              <th className="grid-corner" />
              {Array.from({ length: columnCount }, (_, c) => (
                <th key={c}>
                  <button type="button" className="button quiet" onClick={() => removeColumn(c)} title="Remove this column">
                    Remove
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grid.map((row, r) => (
              <tr key={r} className={r === 0 && firstRowIsHeader ? 'is-header' : undefined}>
                <th className="grid-rownum">
                  <button type="button" className="rownum-button" onClick={() => removeRow(r)} title="Remove this row">
                    ×
                  </button>
                </th>
                {Array.from({ length: columnCount }, (_, c) => (
                  <td key={c}>
                    <input className="cell-input" value={row[c] ?? ''} onChange={(event) => setCell(r, c, event.target.value)} aria-label={`Row ${r + 1}, column ${c + 1}`} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ErrorNote>{error}</ErrorNote>
      <div className="row-actions">
        <button type="button" className="button primary" onClick={save} disabled={stage === 'saving' || !grid.length}>
          {stage === 'saving' ? 'Saving…' : `Save ${firstRowIsHeader ? grid.length - 1 : grid.length} rows`}
        </button>
        <button type="button" className="button" onClick={() => setStage('pick')} disabled={stage === 'saving'}>
          Try another photo
        </button>
      </div>
    </div>
  );
}
