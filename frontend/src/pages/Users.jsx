import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../auth';
import { Dialog, ErrorNote } from '../components/Dialog';

function UserForm({ onSubmit }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('user');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await onSubmit({ username: username.trim(), password, role });
    } catch (problem) {
      setError(problem.message);
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="stack">
      <label className="field">
        <span>Username</span>
        <input
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          autoCapitalize="none"
          autoComplete="off"
          autoFocus
          required
        />
      </label>
      <label className="field">
        <span>Password</span>
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="new-password"
          required
        />
        <small className="muted">At least 8 characters, not only numbers, and not a common password.</small>
      </label>
      <label className="field">
        <span>Role</span>
        <select value={role} onChange={(event) => setRole(event.target.value)}>
          <option value="user">User: manages their own books</option>
          <option value="admin">Admin: manages everyone&rsquo;s books and the users</option>
        </select>
      </label>
      <ErrorNote>{error}</ErrorNote>
      <div className="row-actions">
        <button type="submit" className="button primary" disabled={busy}>
          Create user
        </button>
      </div>
    </form>
  );
}

function PasswordForm({ person, onSubmit }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await onSubmit(password);
    } catch (problem) {
      setError(problem.message);
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="stack">
      <label className="field">
        <span>New password for {person.username}</span>
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="new-password"
          autoFocus
          required
        />
      </label>
      <ErrorNote>{error}</ErrorNote>
      <div className="row-actions">
        <button type="submit" className="button primary" disabled={busy}>
          Set password
        </button>
      </div>
    </form>
  );
}

// Admin only: create accounts, change roles, switch accounts on and off.
export default function Users() {
  const { user: me } = useAuth();
  const [people, setPeople] = useState(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(null); // 'add' | {reset: person}

  const load = useCallback(() => {
    api('/users/')
      .then(setPeople)
      .catch((problem) => setError(problem.message));
  }, []);
  useEffect(load, [load]);

  const change = async (person, values) => {
    try {
      const saved = await api(`/users/${person.id}/`, { method: 'PATCH', body: values });
      setPeople((current) => current.map((item) => (item.id === saved.id ? saved : item)));
      setError('');
    } catch (problem) {
      setError(problem.message);
    }
  };

  return (
    <section>
      <div className="page-head">
        <div>
          <h1>Users</h1>
          <p className="muted">Only admins can create accounts. Switch an account off to stop it signing in; its books are kept.</p>
        </div>
        <button type="button" className="button primary" onClick={() => setOpen('add')}>
          Add user
        </button>
      </div>
      <ErrorNote>{error}</ErrorNote>

      <div className="grid-scroll">
        <table className="plain-table">
          <thead>
            <tr>
              <th scope="col">Username</th>
              <th scope="col">Role</th>
              <th scope="col">Can sign in</th>
              <th scope="col">Password</th>
            </tr>
          </thead>
          <tbody>
            {(people || []).map((person) => (
              <tr key={person.id}>
                <th scope="row">
                  {person.username}
                  {person.id === me.id && <span className="muted"> (you)</span>}
                </th>
                <td>
                  <select
                    value={person.role}
                    disabled={person.id === me.id}
                    aria-label={`Role of ${person.username}`}
                    onChange={(event) => change(person, { role: event.target.value })}
                  >
                    <option value="user">User</option>
                    <option value="admin">Admin</option>
                  </select>
                </td>
                <td>
                  <input
                    type="checkbox"
                    className="cell-check"
                    checked={person.is_active}
                    disabled={person.id === me.id}
                    aria-label={`${person.username} can sign in`}
                    onChange={(event) => change(person, { is_active: event.target.checked })}
                  />
                </td>
                <td>
                  <button type="button" className="button quiet" onClick={() => setOpen({ reset: person })}>
                    Set new password
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {open === 'add' && (
        <Dialog title="Add user" onClose={() => setOpen(null)}>
          <UserForm
            onSubmit={async (values) => {
              await api('/users/', { method: 'POST', body: values });
              setOpen(null);
              load();
            }}
          />
        </Dialog>
      )}
      {open?.reset && (
        <Dialog title="Set new password" onClose={() => setOpen(null)}>
          <PasswordForm
            person={open.reset}
            onSubmit={async (password) => {
              await api(`/users/${open.reset.id}/`, { method: 'PATCH', body: { password } });
              setOpen(null);
            }}
          />
        </Dialog>
      )}
    </section>
  );
}
