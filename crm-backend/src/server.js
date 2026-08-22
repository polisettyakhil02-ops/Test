const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const companyRoutes = require('./routes/companies');
const contactRoutes = require('./routes/contacts');
const dealRoutes = require('./routes/deals');
const leadRoutes = require('./routes/leads');
const projectRoutes = require('./routes/projects');
const taskRoutes = require('./routes/tasks');
const activityRoutes = require('./routes/activities');
const dashboardRoutes = require('./routes/dashboard');
const notificationRoutes = require('./routes/notifications');
const searchRoutes = require('./routes/search');
const attachmentRoutes = require('./routes/attachments');
const auditLogRoutes = require('./routes/auditLog');
const ruleRoutes = require('./routes/rules');
const chatRoutes = require('./routes/chat');
const boardRoutes = require('./routes/boards');
const { errorHandler } = require('./middleware/errorHandler');

function createApp({ jwtSecret, jwtExpiresIn, corsOrigin }) {
  const app = express();

  app.set('jwtSecret', jwtSecret);
  app.set('jwtExpiresIn', jwtExpiresIn);

  const origins = corsOrigin && corsOrigin !== '*' ? corsOrigin.split(',').map((o) => o.trim()) : '*';
  app.use(cors({ origin: origins }));
  app.use(express.json());

  app.get('/health', (_req, res) => res.json({ ok: true }));

  app.use('/api/auth', authRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/companies', companyRoutes);
  app.use('/api/contacts', contactRoutes);
  app.use('/api/deals', dealRoutes);
  app.use('/api/leads', leadRoutes);
  app.use('/api/projects', projectRoutes);
  app.use('/api/tasks', taskRoutes);
  app.use('/api/activities', activityRoutes);
  app.use('/api/dashboard', dashboardRoutes);
  app.use('/api/notifications', notificationRoutes);
  app.use('/api/search', searchRoutes);
  app.use('/api/attachments', attachmentRoutes);
  app.use('/api/audit-log', auditLogRoutes);
  app.use('/api/rules', ruleRoutes);
  app.use('/api/chat', chatRoutes);
  app.use('/api/boards', boardRoutes);

  app.use((_req, res) => res.status(404).json({ error: 'Not found' }));
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
