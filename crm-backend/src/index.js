require('dotenv').config();
const http = require('http');
const { Server } = require('socket.io');
const { connectDB } = require('./config/db');
const { createApp } = require('./server');
const { attachRealtime } = require('./realtime');

const PORT = process.env.PORT || 4000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/dominare_crm';
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

async function main() {
  await connectDB(MONGODB_URI);
  console.log('Connected to MongoDB');

  const app = createApp({ jwtSecret: JWT_SECRET, jwtExpiresIn: JWT_EXPIRES_IN, corsOrigin: CORS_ORIGIN });

  // Socket.IO attaches to the same HTTP server Express listens on - no
  // second port/process to run or deploy. See src/realtime/index.js for
  // why this doesn't bottleneck the REST API.
  const httpServer = http.createServer(app);
  const io = new Server(httpServer, { cors: { origin: CORS_ORIGIN } });
  attachRealtime(io, { jwtSecret: JWT_SECRET });

  httpServer.listen(PORT, () => console.log(`Dominare CRM API (+ realtime) listening on port ${PORT}`));
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
