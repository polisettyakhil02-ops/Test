import { useEffect, useState } from 'react';
import { api } from '../api/client';

const EVENT_LABELS = {
  'deal.created': 'Deal created',
  'deal.stage_changed': 'Deal stage changed',
  'task.created': 'Task created',
  'task.assigned': 'Task assigned',
  'task.status_changed': 'Task status changed',
};

const TARGET_FIELD_OPTIONS = [
  { value: 'assigneeId', label: "the task's assignee" },
  { value: 'ownerId', label: "the deal's owner" },
];

const ASSIGNEE_FIELD_OPTIONS = [
  { value: '', label: 'Unassigned' },
  { value: 'ownerId', label: "the deal's owner" },
  { value: 'assigneeId', label: "the task's assignee" },
];

const emptyForm = {
  name: '',
  event: 'deal.stage_changed',
  conditionEnabled: false,
  conditionField: 'stage',
  conditionOp: 'equals',
  conditionValue: '',
  actionType: 'notify',
  targetField: 'ownerId',
  messageTemplate: '',
  linkTemplate: '',
  titleTemplate: '',
  assigneeField: '',
  linkToDeal: true,
};

export default function Rules() {
  const [rules, setRules] = useState([]);
  const [eventTypes, setEventTypes] = useState(Object.keys(EVENT_LABELS));
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);

  function load() {
    api.rules
      .list()
      .then((d) => {
        setRules(d.rules);
        if (d.eventTypes) setEventTypes(d.eventTypes);
      })
      .catch((err) => setError(err.message));
  }

  useEffect(load, []);

  function describeTrigger(rule) {
    const label = EVENT_LABELS[rule.trigger.event] || rule.trigger.event;
    const conditions = rule.trigger.conditions || [];
    if (conditions.length === 0) return label;
    const cond = conditions[0];
    return `${label}, when ${cond.field} ${cond.op === 'not_equals' ? '≠' : '='} "${cond.value}"`;
  }

  function describeAction(action) {
    if (action.type === 'notify') {
      return `Notify ${action.params.targetField}: "${action.params.messageTemplate}"`;
    }
    if (action.type === 'create_task') {
      return `Create task: "${action.params.titleTemplate}"${action.params.linkToDeal ? ' (linked to the deal)' : ''}`;
    }
    return action.type;
  }

  async function toggleEnabled(rule) {
    try {
      await api.rules.update(rule._id, { enabled: !rule.enabled });
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function removeRule(id) {
    try {
      await api.rules.remove(id);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleCreate(e) {
    e.preventDefault();
    setError(null);
    if (!form.name.trim()) return;

    const trigger = {
      event: form.event,
      conditions:
        form.conditionEnabled && form.conditionField
          ? [{ field: form.conditionField, op: form.conditionOp, value: form.conditionValue }]
          : [],
    };

    const action =
      form.actionType === 'notify'
        ? {
            type: 'notify',
            params: { targetField: form.targetField, messageTemplate: form.messageTemplate, linkTemplate: form.linkTemplate },
          }
        : {
            type: 'create_task',
            params: { titleTemplate: form.titleTemplate, assigneeField: form.assigneeField || undefined, linkToDeal: form.linkToDeal },
          };

    try {
      await api.rules.create({ name: form.name, trigger, actions: [action] });
      setForm(emptyForm);
      setShowForm(false);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1>Automation</h1>
        <button type="button" className="primary" onClick={() => setShowForm((s) => !s)}>
          {showForm ? 'Cancel' : 'New rule'}
        </button>
      </div>
      {error && <div className="error-banner">{error}</div>}
      <p className="stat-label" style={{ maxWidth: '65ch', marginTop: '-0.5rem' }}>
        When something happens in the CRM, a rule can notify someone or create a follow-up task - configured here
        instead of hardcoded. The three rules below replicate what used to be built-in behavior, plus one example
        of auto-creating delivery work when a deal is won.
      </p>

      {showForm && (
        <form className="card form-grid" style={{ marginBottom: '1rem', maxWidth: 520 }} onSubmit={handleCreate}>
          <label>
            Name
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </label>

          <label>
            When
            <select value={form.event} onChange={(e) => setForm({ ...form, event: e.target.value })}>
              {eventTypes.map((ev) => (
                <option key={ev} value={ev}>{EVENT_LABELS[ev] || ev}</option>
              ))}
            </select>
          </label>

          <label>
            <input
              type="checkbox"
              checked={form.conditionEnabled}
              onChange={(e) => setForm({ ...form, conditionEnabled: e.target.checked })}
              style={{ marginRight: '0.4rem' }}
            />
            Only when a field matches (optional)
          </label>
          {form.conditionEnabled && (
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                placeholder="field, e.g. stage"
                value={form.conditionField}
                onChange={(e) => setForm({ ...form, conditionField: e.target.value })}
                style={{ flex: 1 }}
              />
              <select value={form.conditionOp} onChange={(e) => setForm({ ...form, conditionOp: e.target.value })}>
                <option value="equals">equals</option>
                <option value="not_equals">not equals</option>
              </select>
              <input
                placeholder="value, e.g. won"
                value={form.conditionValue}
                onChange={(e) => setForm({ ...form, conditionValue: e.target.value })}
                style={{ flex: 1 }}
              />
            </div>
          )}

          <label>
            Then
            <select value={form.actionType} onChange={(e) => setForm({ ...form, actionType: e.target.value })}>
              <option value="notify">Send a notification</option>
              <option value="create_task">Create a task</option>
            </select>
          </label>

          {form.actionType === 'notify' ? (
            <>
              <label>
                Notify
                <select value={form.targetField} onChange={(e) => setForm({ ...form, targetField: e.target.value })}>
                  {TARGET_FIELD_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </label>
              <label>
                Message (use {'{{field}}'} to insert a value, e.g. {'{{title}}'})
                <input
                  value={form.messageTemplate}
                  onChange={(e) => setForm({ ...form, messageTemplate: e.target.value })}
                  placeholder='"{{title}}" needs your attention'
                  required
                />
              </label>
              <label>
                Link (optional)
                <input
                  value={form.linkTemplate}
                  onChange={(e) => setForm({ ...form, linkTemplate: e.target.value })}
                  placeholder="/deals/{{_id}}"
                />
              </label>
            </>
          ) : (
            <>
              <label>
                Task title (use {'{{field}}'} to insert a value)
                <input
                  value={form.titleTemplate}
                  onChange={(e) => setForm({ ...form, titleTemplate: e.target.value })}
                  placeholder='Follow up on "{{title}}"'
                  required
                />
              </label>
              <label>
                Assign to
                <select value={form.assigneeField} onChange={(e) => setForm({ ...form, assigneeField: e.target.value })}>
                  {ASSIGNEE_FIELD_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={form.linkToDeal}
                  onChange={(e) => setForm({ ...form, linkToDeal: e.target.checked })}
                  style={{ marginRight: '0.4rem' }}
                />
                Link the new task to the triggering deal
              </label>
            </>
          )}

          <button type="submit" className="primary">Create rule</button>
        </form>
      )}

      <table>
        <thead>
          <tr><th>Name</th><th>Trigger</th><th>Action</th><th>Enabled</th><th></th></tr>
        </thead>
        <tbody>
          {rules.map((r) => (
            <tr key={r._id}>
              <td>{r.name}</td>
              <td>{describeTrigger(r)}</td>
              <td>{r.actions.map((a, i) => <div key={i}>{describeAction(a)}</div>)}</td>
              <td>
                <label>
                  <input type="checkbox" checked={r.enabled} onChange={() => toggleEnabled(r)} />
                </label>
              </td>
              <td><button type="button" onClick={() => removeRule(r._id)}>Delete</button></td>
            </tr>
          ))}
          {rules.length === 0 && (
            <tr><td colSpan={5}>No automation rules yet.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
