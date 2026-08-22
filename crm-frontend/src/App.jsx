import { Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { ProtectedRoute } from './components/ProtectedRoute';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Companies from './pages/Companies';
import CompanyDetail from './pages/CompanyDetail';
import Contacts from './pages/Contacts';
import ContactDetail from './pages/ContactDetail';
import Leads from './pages/Leads';
import LeadDetail from './pages/LeadDetail';
import Deals from './pages/Deals';
import DealDetail from './pages/DealDetail';
import RegisterDeal from './pages/RegisterDeal';
import Tasks from './pages/Tasks';
import TaskDetail from './pages/TaskDetail';
import Users from './pages/Users';
import Rules from './pages/Rules';
import Profile from './pages/Profile';

// Companies, contacts, and the pipeline are client/deal data - admin/sales
// only, matching the backend (routes/companies.js, routes/contacts.js,
// routes/deals.js all reject a developer with 403). Gating the routes here
// too means a developer hitting one of these URLs directly gets redirected
// instead of landing on a raw "Forbidden" error banner.
const CLIENT_DATA_ROLES = ['admin', 'sales'];

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
        <Route
          path="/companies"
          element={
            <ProtectedRoute roles={CLIENT_DATA_ROLES}>
              <Companies />
            </ProtectedRoute>
          }
        />
        <Route
          path="/companies/:id"
          element={
            <ProtectedRoute roles={CLIENT_DATA_ROLES}>
              <CompanyDetail />
            </ProtectedRoute>
          }
        />
        <Route
          path="/contacts"
          element={
            <ProtectedRoute roles={CLIENT_DATA_ROLES}>
              <Contacts />
            </ProtectedRoute>
          }
        />
        <Route
          path="/contacts/:id"
          element={
            <ProtectedRoute roles={CLIENT_DATA_ROLES}>
              <ContactDetail />
            </ProtectedRoute>
          }
        />
        <Route
          path="/leads"
          element={
            <ProtectedRoute roles={CLIENT_DATA_ROLES}>
              <Leads />
            </ProtectedRoute>
          }
        />
        <Route
          path="/leads/:id"
          element={
            <ProtectedRoute roles={CLIENT_DATA_ROLES}>
              <LeadDetail />
            </ProtectedRoute>
          }
        />
        <Route
          path="/deals"
          element={
            <ProtectedRoute roles={CLIENT_DATA_ROLES}>
              <Deals />
            </ProtectedRoute>
          }
        />
        <Route
          path="/deals/new"
          element={
            <ProtectedRoute roles={CLIENT_DATA_ROLES}>
              <RegisterDeal />
            </ProtectedRoute>
          }
        />
        <Route
          path="/deals/:id"
          element={
            <ProtectedRoute roles={CLIENT_DATA_ROLES}>
              <DealDetail />
            </ProtectedRoute>
          }
        />
        <Route path="/tasks" element={<Tasks />} />
        <Route path="/tasks/:id" element={<TaskDetail />} />
        <Route path="/profile" element={<Profile />} />
        <Route
          path="/users"
          element={
            <ProtectedRoute roles={['admin']}>
              <Users />
            </ProtectedRoute>
          }
        />
        <Route
          path="/rules"
          element={
            <ProtectedRoute roles={['admin']}>
              <Rules />
            </ProtectedRoute>
          }
        />
      </Route>
    </Routes>
  );
}
