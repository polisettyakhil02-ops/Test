import { useState } from 'react';
import { api } from '../api/client';

// Reads a URL out of a native HTML5 drag event - a rep can drag a link
// straight from a browser tab/bookmark. Not every browser populates
// text/uri-list consistently, so text/plain is a fallback, and a manual
// paste into the input underneath always works regardless of drag support.
function urlFromDropEvent(e) {
  const uriList = e.dataTransfer.getData('text/uri-list');
  if (uriList) return uriList.split('\n')[0].trim();
  return e.dataTransfer.getData('text/plain').trim();
}

function DropField({ label, placeholder, value, onChange }) {
  const [dragOver, setDragOver] = useState(false);

  return (
    <div
      className="field"
      style={{
        border: `2px dashed ${dragOver ? 'var(--color-primary)' : 'var(--color-border)'}`,
        borderRadius: 8,
        padding: '0.6rem',
        background: dragOver ? 'var(--color-info-bg)' : 'transparent',
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const url = urlFromDropEvent(e);
        if (url) onChange(url);
      }}
    >
      <label>
        {label}
        <input
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </label>
    </div>
  );
}

// onApply receives the suggested field values (companyName, companyWebsite,
// contactName, linkedinUrl, enrichment, battleCard) for the parent form to
// merge in - this component never creates a lead itself.
export function LeadDropZone({ onApply }) {
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [linkedinUrl, setLinkedinUrl] = useState('');
  const [parsing, setParsing] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  async function handleParse() {
    if (!websiteUrl.trim() && !linkedinUrl.trim()) return;
    setParsing(true);
    setError(null);
    setResult(null);
    try {
      const data = await api.leads.quickParse({
        websiteUrl: websiteUrl.trim() || undefined,
        linkedinUrl: linkedinUrl.trim() || undefined,
      });
      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setParsing(false);
    }
  }

  function apply() {
    if (!result) return;
    onApply(result);
  }

  return (
    <div className="card" style={{ marginBottom: '1rem' }}>
      <h3 style={{ marginTop: 0 }}>Smart drop zone</h3>
      <p className="stat-label" style={{ marginTop: '-0.3rem' }}>
        Drag a website and/or LinkedIn profile link here (or paste them below), then Parse to
        suggest company details, a contact name, and a discovery guide.
      </p>
      <div style={{ display: 'grid', gap: '0.6rem', gridTemplateColumns: '1fr 1fr' }}>
        <DropField label="Company website" placeholder="https://acme.example.com" value={websiteUrl} onChange={setWebsiteUrl} />
        <DropField label="LinkedIn profile" placeholder="https://linkedin.com/in/jordan-lee" value={linkedinUrl} onChange={setLinkedinUrl} />
      </div>
      <button type="button" className="primary" style={{ marginTop: '0.7rem' }} onClick={handleParse} disabled={parsing}>
        {parsing ? 'Parsing…' : 'Parse'}
      </button>

      {error && <div className="error-banner" style={{ marginTop: '0.7rem' }}>{error}</div>}

      {result && (
        <div style={{ marginTop: '0.9rem', paddingTop: '0.9rem', borderTop: '1px solid var(--color-border)' }}>
          {result.enrichmentError && <p className="stat-label">{result.enrichmentError}</p>}
          <div style={{ display: 'flex', gap: '0.8rem', alignItems: 'flex-start' }}>
            {result.enrichment?.ogImage && (
              <img src={result.enrichment.ogImage} alt="" style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 6 }} />
            )}
            <div>
              <p style={{ margin: 0, fontWeight: 600 }}>{result.companyName || '—'}</p>
              {result.contactName && <p className="stat-label" style={{ margin: 0 }}>Contact: {result.contactName}</p>}
              {result.enrichment?.ogDescription && (
                <p className="stat-label" style={{ margin: '0.3rem 0 0' }}>{result.enrichment.ogDescription}</p>
              )}
            </div>
          </div>

          {result.battleCard && (
            <div style={{ marginTop: '0.7rem' }}>
              <p style={{ margin: '0 0 0.3rem', fontWeight: 600 }}>
                Discovery guide: {result.battleCard.industry}
              </p>
              <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
                {result.battleCard.questions.map((q, i) => (
                  <li key={i} style={{ fontSize: '0.85rem' }}>{q}</li>
                ))}
              </ul>
            </div>
          )}

          <button type="button" className="primary" style={{ marginTop: '0.7rem' }} onClick={apply}>
            Use this
          </button>
        </div>
      )}
    </div>
  );
}
