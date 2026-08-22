import { Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { ProtectedRoute } from './components/ProtectedRoute';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Companies from './pages/Companies';
import CompanyDetail from './pages/CompanyDetail';
import Contacts from './pages/Contacts';
import ContactDetail from './pages/ContactDetail';
import Deals from './pages/Deals';
import DealDetail from './pages/DealDetail';
import Tasks from './pages/Tasks';
import Users from './pages/Users';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<Dashboard />} />
        <Route path="/companies" element={<Companies />} />
        <Route path="/companies/:id" element={<CompanyDetail />} />
        <Route path="/contacts" element={<Contacts />} />
        <Route path="/contacts/:id" element={<ContactDetail />} />
        <Route path="/deals" element={<Deals />} />
        <Route path="/deals/:id" element={<DealDetail />} />
        <Route path="/tasks" element={<Tasks />} />
        <Route
          path="/users"
          element={
            <ProtectedRoute roles={['admin']}>
              <Users />
            </ProtectedRoute>
          }
        />
      </Route>
    </Routes>
  );
}
