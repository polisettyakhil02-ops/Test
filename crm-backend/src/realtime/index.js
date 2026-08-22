const { verifyToken } = require('../lib/jwt');
const ChatChannel = require('../models/ChatChannel');
const ChatMessage = require('../models/ChatMessage');
const Board = require('../models/Board');
const BoardVersion = require('../models/BoardVersion');

// Same handshake auth for every realtime namespace - verifies the JWT the
// same way middleware/auth.js does for REST.
function authMiddleware(jwtSecret) {
  return (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      const payload = verifyToken(token, jwtSecret);
      socket.user = { id: payload.sub, role: payload.role, name: payload.name, email: payload.email };
      next();
    } catch (err) {
      next(new Error('unauthorized'));
    }
  };
}

// Boards debounce their Mongo writes per-board (in-process memory - fine at
// this team's scale; a multi-instance deployment would need this state
// shared, e.g. via Redis, same caveat as Socket.IO's own room broadcast).
const BOARD_DEBOUNCE_MS = 3000;
const BOARD_SNAPSHOT_INTERVAL_MS = 5 * 60 * 1000;
const boardSaveTimers = new Map(); // boardId -> Timeout
const boardLastSnapshotAt = new Map(); // boardId -> ms timestamp

function scheduleBoardPersist(boardId, sceneData, userId) {
  const existing = boardSaveTimers.get(boardId);
  if (existing) clearTimeout(existing);

  const timeout = setTimeout(async () => {
    boardSaveTimers.delete(boardId);
    try {
      await Board.findByIdAndUpdate(boardId, { sceneData, lastEditedBy: userId, lastEditedAt: new Date() });

      const lastSnapshotAt = boardLastSnapshotAt.get(boardId) || 0;
      if (Date.now() - lastSnapshotAt > BOARD_SNAPSHOT_INTERVAL_MS) {
        await BoardVersion.create({ boardId, sceneData, capturedAt: new Date() });
        boardLastSnapshotAt.set(boardId, Date.now());
      }
    } catch (err) {
      console.error(`Failed to persist board ${boardId}:`, err);
    }
  }, BOARD_DEBOUNCE_MS);

  boardSaveTimers.set(boardId, timeout);
}

// Everything here does only awaited async I/O (Mongo calls) - never
// synchronous work over a large payload - so a socket handler never stalls
// the single event loop the REST API shares with it.
function attachRealtime(io, { jwtSecret }) {
  const chat = io.of('/chat');
  chat.use(authMiddleware(jwtSecret));

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

  // Whiteboard: any authenticated team member can join any board (boards
  // aren't access-controlled beyond authentication, same as chat's 'team'
  // channel) and relay/persist its live scene. This is a simple last-write-
  // relayed-and-debounced-saved sync, not a full CRDT merge - fine for a
  // small team where two people rarely draw the exact same spot at once;
  // see README for the honest trade-off vs. tldraw's own hosted sync.
  const board = io.of('/board');
  board.use(authMiddleware(jwtSecret));

  board.on('connection', (socket) => {
    socket.on('board:join', (boardId, ack) => {
      if (!boardId) return ack?.({ ok: false, error: 'boardId is required' });
      socket.join(`board:${boardId}`);
      ack?.({ ok: true });
    });

    socket.on('scene:update', ({ boardId, sceneData } = {}) => {
      if (!boardId || sceneData === undefined) return;
      socket.to(`board:${boardId}`).emit('scene:update', { sceneData, userId: socket.user.id });
      scheduleBoardPersist(boardId, sceneData, socket.user.id);
    });
  });

  return { chat, board };
}

module.exports = { attachRealtime };
