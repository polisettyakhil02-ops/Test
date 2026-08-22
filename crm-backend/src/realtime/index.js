const { verifyToken } = require('../lib/jwt');
const ChatChannel = require('../models/ChatChannel');
const ChatMessage = require('../models/ChatMessage');

// Everything here does only awaited async I/O (Mongo calls) - never
// synchronous work over a large payload - so a socket handler never stalls
// the single event loop the REST API shares with it. Chat messages are
// persisted THEN broadcast (write-through), so a message is never visible
// to a peer and lost on a crash.
function attachRealtime(io, { jwtSecret }) {
  const chat = io.of('/chat');

  chat.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      const payload = verifyToken(token, jwtSecret);
      socket.user = { id: payload.sub, role: payload.role, name: payload.name, email: payload.email };
      next();
    } catch (err) {
      next(new Error('unauthorized'));
    }
  });

  chat.on('connection', (socket) => {
    socket.on('channel:join', async (channelId, ack) => {
      try {
        const channel = await ChatChannel.findById(channelId);
        const isMember = channel?.memberIds.some((id) => String(id) === socket.user.id);
        if (!isMember) return ack?.({ ok: false, error: 'Not a member of this channel' });
        socket.join(`chat:${channelId}`);
        ack?.({ ok: true });
      } catch (err) {
        ack?.({ ok: false, error: 'Invalid channel' });
      }
    });

    socket.on('message:send', async ({ channelId, body } = {}, ack) => {
      try {
        if (!body || !body.trim()) return ack?.({ ok: false, error: 'body is required' });

        const channel = await ChatChannel.findById(channelId);
        const isMember = channel?.memberIds.some((id) => String(id) === socket.user.id);
        if (!isMember) return ack?.({ ok: false, error: 'Not a member of this channel' });

        const message = await ChatMessage.create({ channelId, authorId: socket.user.id, body: body.trim() });
        await message.populate('authorId', 'name');
        chat.to(`chat:${channelId}`).emit('message:new', message);
        ack?.({ ok: true, messageId: message._id });
      } catch (err) {
        ack?.({ ok: false, error: 'Could not send message' });
      }
    });

    socket.on('typing', ({ channelId } = {}) => {
      // Ephemeral, never persisted - just relayed to the room.
      if (channelId) socket.to(`chat:${channelId}`).emit('typing', { channelId, userId: socket.user.id, name: socket.user.name });
    });
  });

  return chat;
}

module.exports = { attachRealtime };
