const express = require('express');
const Lead = require('../models/Lead');
const Company = require('../models/Company');
const Contact = require('../models/Contact');
const Deal = require('../models/Deal');
const Activity = require('../models/Activity');
const { STAGES } = require('../models/Lead');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/requireRole');
const { logAudit } = require('../lib/audit');
const { emitEvent } = require('../lib/events');

const router = express.Router();

// Same access pattern as companies/contacts/deals - pre-sales pipeline data,
// admin/sales only, reads included.
router.use(requireAuth, requireRole('admin', 'sales'));

router.get('/', async (req, res, next) => {
  try {
    const filter = req.query.archived === 'true' ? { archived: true } : { archived: false };
    if (req.query.stage) filter.stage = req.query.stage;
    if (req.query.ownerId) filter.ownerId = req.query.ownerId;
    const leads = await Lead.find(filter).sort({ createdAt: -1 });
    res.json({ leads });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const lead = await Lead.findById(req.params.id);
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    res.json({ lead });
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { name, companyName, companyWebsite, contactName, contactEmail, contactPhone, linkedinUrl, source, ownerId } =
      req.body || {};
    if (!name) return res.status(400).json({ error: 'name is required' });

    const lead = await Lead.create({
      name,
      companyName,
      companyWebsite,
      contactName,
      contactEmail,
      contactPhone,
      linkedinUrl,
      source,
      ownerId: ownerId || req.user.id,
      createdBy: req.user.id,
    });

    await logAudit({ entityType: 'lead', entityId: lead._id, action: 'created', actorId: req.user.id });
    await emitEvent('lead.created', lead.toObject(), { actorId: req.user.id });

    res.status(201).json({ lead });
  } catch (err) {
    next(err);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { name, companyName, companyWebsite, contactName, contactEmail, contactPhone, linkedinUrl, source, ownerId } =
      req.body || {};
    const lead = await Lead.findByIdAndUpdate(
      req.params.id,
      { name, companyName, companyWebsite, contactName, contactEmail, contactPhone, linkedinUrl, source, ownerId },
      { new: true, runValidators: true }
    );
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    await logAudit({ entityType: 'lead', entityId: lead._id, action: 'updated', actorId: req.user.id });
    res.json({ lead });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id/stage', async (req, res, next) => {
  try {
    const { stage } = req.body || {};
    if (!STAGES.includes(stage)) {
      return res.status(400).json({ error: `stage must be one of: ${STAGES.join(', ')}` });
    }
    const lead = await Lead.findById(req.params.id);
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    if (lead.convertedToDealId) return res.status(400).json({ error: 'Lead has already been converted' });

    const previousStage = lead.stage;
    lead.stage = stage;
    await lead.save();

    await logAudit({
      entityType: 'lead',
      entityId: lead._id,
      action: 'stage_changed',
      actorId: req.user.id,
      changes: { from: previousStage, to: stage },
    });

    res.json({ lead });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id/archive', async (req, res, next) => {
  try {
    const lead = await Lead.findByIdAndUpdate(req.params.id, { archived: true }, { new: true });
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    await logAudit({ entityType: 'lead', entityId: lead._id, action: 'archived', actorId: req.user.id });
    res.json({ lead });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id/restore', async (req, res, next) => {
  try {
    const lead = await Lead.findByIdAndUpdate(req.params.id, { archived: false }, { new: true });
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    await logAudit({ entityType: 'lead', entityId: lead._id, action: 'restored', actorId: req.user.id });
    res.json({ lead });
  } catch (err) {
    next(err);
  }
});

// Converts a Lead into a real Company + Contact + Deal. Not run inside a
// Mongo transaction - that needs a replica set, which local dev's standalone
// mongod doesn't provide, and we don't want the seed/setup story to require
// one just for this. If a later step fails, earlier records created by this
// request are NOT rolled back; the failure is returned to the caller so they
// can retry (re-running is safe - see the findOne-before-create checks below).
router.post('/:id/convert', async (req, res, next) => {
  try {
    const lead = await Lead.findById(req.params.id);
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    if (lead.convertedToDealId) return res.status(400).json({ error: 'Lead has already been converted' });

    const { companyId } = req.body || {};

    let company = null;
    if (companyId) {
      company = await Company.findById(companyId);
      if (!company) return res.status(400).json({ error: 'companyId does not match an existing company' });
    } else if (lead.companyName) {
      company = await Company.findOne({ name: new RegExp(`^${lead.companyName.trim()}$`, 'i') });
      if (!company) {
        company = await Company.create({
          name: lead.companyName,
          website: lead.companyWebsite,
          createdBy: req.user.id,
        });
      }
    }

    let contact = null;
    if (lead.contactEmail) {
      contact = await Contact.findOne({ email: lead.contactEmail.toLowerCase() });
    }
    if (!contact && (lead.contactName || lead.contactEmail || lead.contactPhone)) {
      contact = await Contact.create({
        name: lead.contactName || lead.name,
        email: lead.contactEmail,
        phone: lead.contactPhone,
        linkedinUrl: lead.linkedinUrl,
        companyId: company ? company._id : null,
        createdBy: req.user.id,
      });
    }

    const deal = await Deal.create({
      title: company ? `${company.name} - ${lead.name}` : lead.name,
      companyId: company ? company._id : null,
      contactId: contact ? contact._id : null,
      stage: 'new',
      source: lead.source,
      ownerId: lead.ownerId || req.user.id,
      createdBy: req.user.id,
    });

    lead.convertedToDealId = deal._id;
    lead.convertedAt = new Date();
    lead.archived = true;
    await lead.save();

    await Activity.create({
      type: 'note',
      body: `Converted from lead "${lead.name}".`,
      dealId: deal._id,
      authorId: req.user.id,
    });

    await logAudit({
      entityType: 'lead',
      entityId: lead._id,
      action: 'converted',
      actorId: req.user.id,
      changes: { dealId: deal._id },
    });
    await logAudit({
      entityType: 'deal',
      entityId: deal._id,
      action: 'created',
      actorId: req.user.id,
      changes: { convertedFromLeadId: lead._id },
    });

    await emitEvent('lead.converted', lead.toObject(), { actorId: req.user.id });
    await emitEvent('deal.created', deal.toObject(), { actorId: req.user.id });

    res.status(201).json({ lead, deal, company, contact });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', requireRole('admin'), async (req, res, next) => {
  try {
    const lead = await Lead.findByIdAndDelete(req.params.id);
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    await logAudit({ entityType: 'lead', entityId: lead._id, action: 'deleted', actorId: req.user.id });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
