import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';

const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPod|iPad/.test(navigator.platform || navigator.userAgent);

export function SearchBar() {
  const [q, setQ] = useState('');
  const [results, setResults] = useState(null);
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);
  const inputRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    function onClickOutside(e) {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  useEffect(() => {
    function onKeyDown(e) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    if (!q.trim()) {
      setResults(null);
      return;
    }
    const handle = setTimeout(() => {
      api.search(q).then(setResults).catch(() => setResults(null));
    }, 250);
    return () => clearTimeout(handle);
  }, [q]);

  function go(path) {
    setOpen(false);
    setQ('');
    setResults(null);
    navigate(path);
  }

  const hasResults =
    results && (results.companies.length || results.contacts.length || results.deals.length);

  return (
    <div className="search-box" ref={boxRef}>
      <input
        ref={inputRef}
        type="search"
        placeholder="Search companies, contacts, deals…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => setOpen(true)}
      />
      {!q.trim() && <kbd className="search-kbd-hint">{IS_MAC ? '⌘K' : 'Ctrl K'}</kbd>}
      {open && q.trim() && (
        <div className="search-dropdown">
          {!results ? (
            <p className="search-empty">Searching…</p>
          ) : !hasResults ? (
            <p className="search-empty">No matches for "{q}"</p>
          ) : (
            <>
              {results.companies.length > 0 && (
                <div className="search-group">
                  <h4>Companies</h4>
                  {results.companies.map((c) => (
                    <button key={c._id} type="button" onClick={() => go(`/companies/${c._id}`)}>
                      {c.name}
                    </button>
                  ))}
                </div>
              )}
              {results.contacts.length > 0 && (
                <div className="search-group">
                  <h4>Contacts</h4>
                  {results.contacts.map((c) => (
                    <button key={c._id} type="button" onClick={() => go(`/contacts/${c._id}`)}>
                      {c.name}
                    </button>
                  ))}
                </div>
              )}
              {results.deals.length > 0 && (
                <div className="search-group">
                  <h4>Deals</h4>
                  {results.deals.map((d) => (
                    <button key={d._id} type="button" onClick={() => go(`/deals/${d._id}`)}>
                      {d.title}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
