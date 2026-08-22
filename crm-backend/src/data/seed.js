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
const Rule = require('../models/Rule');
const Lead = require('../models/Lead');
const Project = require('../models/Project');
const ChatChannel = require('../models/ChatChannel');
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

  const existingProject = await Project.findOne();
  let internalProject;
  let finaleProject;
  if (!existingProject) {
    internalProject = await Project.create({
      name: 'Internal Tooling',
      description: 'CRM platform work that isn\'t tied to a specific client deal.',
      kind: 'internal',
      scratchpad: '// Ideas / reminders\n- Look into batching the notification poll instead of per-tab 30s intervals\n- TODO: revisit Mongo indexes on Task once we have real usage volume',
      createdBy: admin._id,
    });
    finaleProject = await Project.create({
      name: 'Finale Launch',
      description: 'Brand campaign - launch storyboards, creative briefs and the microsite build.',
      kind: 'campaign',
      scratchpad: '// Palette from the brief\nconst finalePalette = ["#101820", "#F2AA4C", "#F8F4E3"];\n\nMicrosite hero copy draft:\n"Finale. Out now."',
      createdBy: sales._id,
    });

    await Task.create([
      {
        title: 'Build Finale microsite hero section',
        description: 'Implement the hero from the creative brief - see the Finale Launch scratchpad for palette/copy.',
        priority: 'high',
        issueType: 'feature',
        assigneeId: developer._id,
        projectId: finaleProject._id,
        createdBy: sales._id,
      },
      {
        title: 'Notification poll causes visible jank on low-end devices',
        description: 'The 30s notification poll appears to block the main thread briefly on older hardware.',
        priority: 'medium',
        issueType: 'bug',
        severity: 'medium',
        environment: 'Chrome 120, Android (low-end)',
        stepsToReproduce: '1. Open the CRM on a low-end Android device\n2. Wait for the notification poll to fire\n3. Observe a brief scroll stutter',
        projectId: internalProject._id,
        // Deliberately unassigned - this is what the Developer Dashboard's
        // Backlog view (unassigned bugs) is for.
        createdBy: admin._id,
      },
    ]);

    console.log('Created sample projects (Internal Tooling, Finale Launch) and project-linked tasks.');
  } else {
    console.log('Sample projects already present, skipping.');
  }

  const existingLead = await Lead.findOne();
  if (!existingLead) {
    await Lead.create({
      name: 'Northwind Traders - inbound demo request',
      companyName: 'Northwind Traders',
      companyWebsite: 'https://northwind.example.com',
      contactName: 'Casey Rivera',
      contactEmail: 'casey@northwind.example.com',
      contactPhone: '555-0140',
      linkedinUrl: 'https://linkedin.com/in/caseyrivera',
      stage: 'contacted',
      source: 'website form',
      ownerId: sales._id,
      createdBy: sales._id,
    });
    console.log('Created sample lead.');
  } else {
    console.log('Sample lead already present, skipping.');
  }

  const existingRule = await Rule.findOne();
  if (!existingRule) {
    await Rule.create([
      {
        name: 'Notify on task assignment',
        trigger: { event: 'task.assigned', conditions: [] },
        actions: [
          {
            type: 'notify',
            params: {
              targetField: 'assigneeId',
              messageTemplate: 'You were assigned "{{title}}"',
              linkTemplate: '/tasks',
            },
          },
        ],
        createdBy: admin._id,
      },
      {
        name: 'Notify deal owner on stage change',
        trigger: { event: 'deal.stage_changed', conditions: [] },
        actions: [
          {
            type: 'notify',
            params: {
              targetField: 'ownerId',
              messageTemplate: '"{{title}}" moved from {{previousStage}} to {{stage}}',
              linkTemplate: '/deals/{{_id}}',
            },
          },
        ],
        createdBy: admin._id,
      },
      {
        name: 'Auto-create delivery kickoff task on Won',
        trigger: { event: 'deal.stage_changed', conditions: [{ field: 'stage', op: 'equals', value: 'won' }] },
        actions: [
          {
            type: 'create_task',
            params: {
              titleTemplate: 'Kick off delivery for "{{title}}"',
              linkToDeal: true,
            },
          },
        ],
        createdBy: admin._id,
      },
    ]);
    console.log('Created 3 default automation rules.');
  } else {
    console.log('Automation rules already present, skipping.');
  }

  const existingTeamChannel = await ChatChannel.findOne({ type: 'team' });
  if (!existingTeamChannel) {
    await ChatChannel.create({
      type: 'team',
      name: 'General',
      memberIds: [admin._id, sales._id, developer._id],
      createdBy: admin._id,
    });
    console.log('Created default #General team chat channel.');
  } else {
    console.log('Team chat channel already present, skipping.');
  }

  console.log('Seed complete.');
  console.log(`Log in as admin: ${SEED_ADMIN_EMAIL} / (the password from SEED_ADMIN_PASSWORD)`);
  process.exit(0);
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
