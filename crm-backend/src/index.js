require('dotenv').config();
const { connectDB } = require('./config/db');
const { createApp } = require('./server');

const PORT = process.env.PORT || 4000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/dominare_crm';
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

async function main() {
  await connectDB(MONGODB_URI);
  console.log('Connected to MongoDB');

  const app = createApp({ jwtSecret: JWT_SECRET, jwtExpiresIn: JWT_EXPIRES_IN, corsOrigin: CORS_ORIGIN });
  app.listen(PORT, () => console.log(`Dominare CRM API listening on port ${PORT}`));
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
