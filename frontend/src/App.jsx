import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './auth';
import Shell from './components/Shell';
import Book from './pages/Book';
import Books from './pages/Books';
import Reader from './pages/Reader';
import SignIn from './pages/SignIn';
import Trash from './pages/Trash';
import Users from './pages/Users';

function SignedIn() {
  const { user, checking } = useAuth();
  const location = useLocation();
  if (checking) return <p className="loading">Opening…</p>;
  if (!user) return <Navigate to="/sign-in" replace state={{ from: location.pathname }} />;
  return <Outlet />;
}

function AdminOnly() {
  const { isAdmin } = useAuth();
  return isAdmin ? <Outlet /> : <Navigate to="/" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/sign-in" element={<SignIn />} />
      <Route element={<SignedIn />}>
        {/* The reader has no Shell around it: only the book is on screen. */}
        <Route path="/books/:bookId/read" element={<Reader />} />
        <Route element={<Shell />}>
          <Route index element={<Books />} />
          <Route path="/books/:bookId" element={<Book />} />
          <Route path="/books/:bookId/tables/:tableId" element={<Book />} />
          <Route path="/trash" element={<Trash />} />
          <Route element={<AdminOnly />}>
            <Route path="/users" element={<Users />} />
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
