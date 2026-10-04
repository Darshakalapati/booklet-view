import { useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth';
import { ErrorNote } from '../components/Dialog';

// One sign-in page for everyone. Admins and users sign in the same way; what
// they can do afterwards depends on their role.
export default function SignIn() {
  const { user, checking, signIn } = useAuth();
  const location = useLocation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={location.state?.from || '/'} replace />;

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await signIn(username.trim(), password);
    } catch (problem) {
      setError(problem.message);
      setBusy(false);
    }
  };

  return (
    <div className="signin">
      <div className="signin-cover" aria-hidden="true">
        <div className="cover-plate">
          <span className="plate-title">Booklet View</span>
          <span className="plate-rule" />
          <span className="plate-sub">Your tables, kept as a book</span>
        </div>
      </div>
      <form className="signin-form stack" onSubmit={submit}>
        <h1>Sign in</h1>
        <p className="muted">Admins and users sign in here. Accounts are created by an admin.</p>
        <label className="field">
          <span>Username</span>
          <input
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="username"
            autoCapitalize="none"
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
            autoComplete="current-password"
            required
          />
        </label>
        <ErrorNote>{error}</ErrorNote>
        <button type="submit" className="button primary" disabled={busy || checking}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
