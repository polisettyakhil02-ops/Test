import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { getChatSocket } from '../lib/socket';

function channelLabel(channel, currentUserId, directory) {
  if (channel.type === 'team') return channel.name || 'Team';
  if (channel.type === 'group') return channel.name || 'Group';
  // dm: show the other member's name
  const otherId = channel.memberIds.map(String).find((id) => id !== String(currentUserId));
  return directory.find((u) => String(u._id) === otherId)?.name || 'Direct message';
}

export default function Chat() {
  const { user } = useAuth();
  const userId = user.id || user._id;

  const [channels, setChannels] = useState([]);
  const [directory, setDirectory] = useState([]);
  const [activeChannelId, setActiveChannelId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [body, setBody] = useState('');
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState(null);
  const [showNewDm, setShowNewDm] = useState(false);
  const bottomRef = useRef(null);

  function loadChannels() {
    api.chat.channels().then((d) => {
      setChannels(d.channels);
      if (!activeChannelId && d.channels.length > 0) setActiveChannelId(d.channels[0]._id);
    }).catch((err) => setError(err.message));
  }

  useEffect(() => {
    loadChannels();
    api.chat.directory().then((d) => setDirectory(d.users.filter((u) => u._id !== userId))).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const socket = getChatSocket();
    setConnected(socket.connected);
    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    const onMessage = (msg) => {
      setMessages((prev) => (String(msg.channelId) === String(activeChannelId) ? [...prev, msg] : prev));
    };
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('message:new', onMessage);
    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('message:new', onMessage);
    };
  }, [activeChannelId]);

  useEffect(() => {
    if (!activeChannelId) return;
    setMessages([]);
    api.chat.messages(activeChannelId).then((d) => setMessages(d.messages)).catch((err) => setError(err.message));
    getChatSocket().emit('channel:join', activeChannelId, (ack) => {
      if (!ack?.ok) setError(ack?.error || 'Could not join channel');
    });
  }, [activeChannelId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  function sendMessage(e) {
    e.preventDefault();
    if (!body.trim() || !activeChannelId) return;
    getChatSocket().emit('message:send', { channelId: activeChannelId, body: body.trim() }, (ack) => {
      if (!ack?.ok) setError(ack?.error || 'Message failed to send');
    });
    setBody('');
  }

  async function startDirect(otherUserId) {
    try {
      const { channel } = await api.chat.openDirect([otherUserId]);
      setShowNewDm(false);
      loadChannels();
      setActiveChannelId(channel._id);
    } catch (err) {
      setError(err.message);
    }
  }

  const activeChannel = channels.find((c) => c._id === activeChannelId);

  return (
    <div>
      <div className="page-header">
        <h1>Chat</h1>
        <span className="stat-label">{connected ? 'Connected' : 'Connecting…'}</span>
      </div>
      {error && <div className="error-banner">{error}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: '1rem', minHeight: '60vh' }}>
        <div className="card">
          <div className="page-header" style={{ marginBottom: '0.5rem' }}>
            <h3 style={{ margin: 0 }}>Channels</h3>
            <button type="button" onClick={() => setShowNewDm((s) => !s)}>{showNewDm ? 'Cancel' : 'New DM'}</button>
          </div>
          {showNewDm && (
            <ul style={{ listStyle: 'none', margin: '0 0 0.75rem', padding: 0 }}>
              {directory.map((u) => (
                <li key={u._id}>
                  <button type="button" style={{ width: '100%', textAlign: 'left' }} onClick={() => startDirect(u._id)}>
                    {u.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {channels.map((c) => (
              <li key={c._id}>
                <button
                  type="button"
                  className={c._id === activeChannelId ? 'primary' : undefined}
                  style={{ width: '100%', textAlign: 'left', marginBottom: '0.25rem' }}
                  onClick={() => setActiveChannelId(c._id)}
                >
                  {channelLabel(c, userId, directory)}
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
          <h3 style={{ marginTop: 0 }}>{activeChannel ? channelLabel(activeChannel, userId, directory) : 'Select a channel'}</h3>
          <div style={{ flex: 1, overflowY: 'auto', marginBottom: '0.75rem', maxHeight: '50vh' }}>
            {messages.map((m) => {
              const authorIdStr = m.authorId?._id || m.authorId;
              return (
                <div key={m._id} style={{ marginBottom: '0.5rem' }}>
                  <span className="stat-label">
                    {String(authorIdStr) === String(userId) ? 'You' : m.authorId?.name || 'Someone'}
                  </span>
                  <p style={{ margin: 0 }}>{m.body}</p>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>
          {activeChannelId && (
            <form onSubmit={sendMessage} style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                style={{ flex: 1, padding: '0.5rem', border: '1px solid var(--color-border)', borderRadius: 6 }}
                placeholder="Message…"
                value={body}
                onChange={(e) => setBody(e.target.value)}
              />
              <button type="submit" className="primary">Send</button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
