// Idempotent seed script: creates a demo admin/sales/developer user plus a
// sample company/contact/deal/task if they don't already exist. Safe to
// re-run - it upserts the admin by email and only creates the sample data
// once (skipped if a Deal already exists).
require('dotenv').config();
const { connectDB } = require('../config/db');
const User = require('../models/User');
const Company = require('../models/Company');
const Contact = require('../models/Contact');
const Deal = require('../models/Deal');
const Task = require('../models/Task');
const { hashPassword } = require('../lib/password');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/dominare_crm';
const SEED_ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL || 'admin@dominaretech.com';
const SEED_ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD || 'changeme123';

async function upsertUser({ name, email, password, role }) {
  let user = await User.findOne({ email });
  if (!user) {
    const passwordHash = await hashPassword(password);
    user = await User.create({ name, email, passwordHash, role });
    console.log(`Created ${role} user: ${email}`);
  }
  return user;
}

async function main() {
  await connectDB(MONGODB_URI);

  const admin = await upsertUser({ name: 'Admin', email: SEED_ADMIN_EMAIL, password: SEED_ADMIN_PASSWORD, role: 'admin' });
  const sales = await upsertUser({ name: 'Priya (Sales)', email: 'sales@dominaretech.com', password: 'changeme123', role: 'sales' });
  const developer = await upsertUser({ name: 'Dev One', email: 'dev@dominaretech.com', password: 'changeme123', role: 'developer' });

  const existingDeal = await Deal.findOne();
  if (!existingDeal) {
    const company = await Company.create({
      name: 'Acme Corp',
      industry: 'Retail',
      website: 'https://acme.example.com',
      createdBy: admin._id,
    });

    const contact = await Contact.create({
      name: 'Jordan Lee',
      email: 'jordan@acme.example.com',
      phone: '555-0100',
      companyId: company._id,
      createdBy: admin._id,
    });

    const deal = await Deal.create({
      title: 'Acme Corp - Website Revamp',
      companyId: company._id,
      contactId: contact._id,
      stage: 'qualified',
      value: 50000,
      source: 'referral',
      ownerId: sales._id,
      createdBy: sales._id,
    });

    await Task.create({
      title: 'Set up staging environment',
      description: 'Provision staging infra for the Acme Corp website revamp.',
      priority: 'medium',
      assigneeId: developer._id,
      dealId: deal._id,
      createdBy: sales._id,
    });

    console.log('Created sample company, contact, deal and task.');
  } else {
    console.log('Sample data already present, skipping.');
  }

  console.log('Seed complete.');
  console.log(`Log in as admin: ${SEED_ADMIN_EMAIL} / (the password from SEED_ADMIN_PASSWORD)`);
  process.exit(0);
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
