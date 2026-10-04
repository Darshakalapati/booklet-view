import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth';

// The frame around every editing screen: name, navigation, who is signed in.
export default function Shell() {
  const { user, isAdmin, signOut } = useAuth();
  return (
    <div className="shell">
      <header className="topbar">
        <NavLink to="/" className="brand">
          Booklet View
        </NavLink>
        <nav className="topnav" aria-label="Main">
          <NavLink to="/" end>
            Books
          </NavLink>
          <NavLink to="/trash">Trash</NavLink>
          {isAdmin && <NavLink to="/users">Users</NavLink>}
        </nav>
        <div className="account">
          <span className="account-name">
            {user.username}
            {isAdmin && <span className="role-tag">admin</span>}
          </span>
          <button type="button" className="button quiet" onClick={signOut}>
            Sign out
          </button>
        </div>
      </header>
      <main className="workspace">
        <Outlet />
      </main>
    </div>
  );
}
