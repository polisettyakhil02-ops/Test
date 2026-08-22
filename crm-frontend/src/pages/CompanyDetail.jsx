import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api/client';

export default function CompanyDetail() {
  const { id } = useParams();
  const [company, setCompany] = useState(null);
  const [contacts, setContacts] = useState([]);
  const [deals, setDeals] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.companies.get(id).then((d) => setCompany(d.company)).catch((err) => setError(err.message));
    api.contacts.list(id).then((d) => setContacts(d.contacts)).catch((err) => setError(err.message));
    api.deals.list({ companyId: id }).then((d) => setDeals(d.deals)).catch((err) => setError(err.message));
  }, [id]);

  if (error) return <div className="error-banner">{error}</div>;
  if (!company) return <p>Loading…</p>;

  return (
    <div>
      <p><Link to="/companies">&larr; Companies</Link></p>
      <h1>{company.name}</h1>
      <p className="stat-label">{company.industry} {company.website && <>· <a href={company.website} target="_blank" rel="noreferrer">{company.website}</a></>}</p>
      {company.notes && <p>{company.notes}</p>}

      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h2>Contacts</h2>
        {contacts.length === 0 ? <p>No contacts yet.</p> : (
          <table>
            <thead><tr><th>Name</th><th>Email</th><th>Phone</th></tr></thead>
            <tbody>
              {contacts.map((c) => (
                <tr key={c._id}>
                  <td><Link to={`/contacts/${c._id}`}>{c.name}</Link></td>
                  <td>{c.email}</td>
                  <td>{c.phone}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h2>Deals</h2>
        {deals.length === 0 ? <p>No deals yet.</p> : (
          <table>
            <thead><tr><th>Title</th><th>Stage</th><th>Value</th></tr></thead>
            <tbody>
              {deals.map((d) => (
                <tr key={d._id}>
                  <td><Link to={`/deals/${d._id}`}>{d.title}</Link></td>
                  <td>{d.stage}</td>
                  <td>${d.value.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
