import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';

export function NotificationBell() {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);
  const navigate = useNavigate();

  function load() {
    api.notifications
      .list()
      .then((d) => {
        setNotifications(d.notifications);
        setUnreadCount(d.unreadCount);
      })
      .catch(() => {});
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, 30_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    function onClickOutside(e) {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  async function openNotification(n) {
    if (!n.read) {
      await api.notifications.markRead(n._id).catch(() => {});
      load();
    }
    setOpen(false);
    if (n.link) navigate(n.link);
  }

  async function markAllRead() {
    await api.notifications.markAllRead().catch(() => {});
    load();
  }

  return (
    <div className="notif-box" ref={boxRef}>
      <button type="button" className="notif-bell" onClick={() => setOpen((o) => !o)} aria-label="Notifications">
        🔔{unreadCount > 0 && <span className="notif-count">{unreadCount}</span>}
      </button>
      {open && (
        <div className="notif-dropdown">
          <div className="notif-dropdown-head">
            <span>Notifications</span>
            {unreadCount > 0 && (
              <button type="button" onClick={markAllRead}>
                Mark all read
              </button>
            )}
          </div>
          {notifications.length === 0 ? (
            <p className="search-empty">You're all caught up.</p>
          ) : (
            notifications.map((n) => (
              <button
                key={n._id}
                type="button"
                className={`notif-item${n.read ? '' : ' unread'}`}
                onClick={() => openNotification(n)}
              >
                {n.message}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
