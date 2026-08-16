-- Ledger invariants that a schema DSL cannot express. Applied after the
-- generated migration; safe to re-run.

-- ---------------------------------------------------------------------------
-- 1. Every journal entry must balance.
--
-- DEFERRABLE INITIALLY DEFERRED is the whole point: lines are inserted one at
-- a time, so the entry is legitimately unbalanced mid-transaction. The check
-- runs once at COMMIT, which is the only moment the rule is meaningful.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION assert_entry_balances() RETURNS trigger AS $$
DECLARE
  total_debit  bigint;
  total_credit bigint;
BEGIN
  SELECT COALESCE(SUM(debit_minor), 0), COALESCE(SUM(credit_minor), 0)
    INTO total_debit, total_credit
    FROM journal_lines
   WHERE entry_id = COALESCE(NEW.entry_id, OLD.entry_id);

  IF total_debit <> total_credit THEN
    RAISE EXCEPTION
      'journal entry % is unbalanced: debits %, credits %',
      COALESCE(NEW.entry_id, OLD.entry_id), total_debit, total_credit
      USING ERRCODE = 'check_violation';
  END IF;

  -- An entry with no lines at all is not a valid entry either.
  IF total_debit = 0 AND total_credit = 0 THEN
    RAISE EXCEPTION 'journal entry % has no value',
      COALESCE(NEW.entry_id, OLD.entry_id)
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS journal_lines_balanced ON journal_lines;
CREATE CONSTRAINT TRIGGER journal_lines_balanced
  AFTER INSERT OR UPDATE ON journal_lines
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION assert_entry_balances();

-- ---------------------------------------------------------------------------
-- 2. The ledger is append-only.
--
-- Corrections are new entries (a reversal, or a credit note's own entry), never
-- an edit. Enforcing it here means no future code path -- or console session --
-- can quietly rewrite history.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION refuse_ledger_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION
    'the ledger is append-only: % on % is not allowed. Post a reversing entry instead.',
    TG_OP, TG_TABLE_NAME
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS journal_entries_immutable ON journal_entries;
CREATE TRIGGER journal_entries_immutable
  BEFORE UPDATE OR DELETE ON journal_entries
  FOR EACH ROW EXECUTE FUNCTION refuse_ledger_mutation();

DROP TRIGGER IF EXISTS journal_lines_immutable ON journal_lines;
CREATE TRIGGER journal_lines_immutable
  BEFORE UPDATE OR DELETE ON journal_lines
  FOR EACH ROW EXECUTE FUNCTION refuse_ledger_mutation();

-- ---------------------------------------------------------------------------
-- 3. A posted document is immutable except for its void stamp.
--
-- Drafts stay freely editable; posting is the one-way door. Allowing the void
-- columns through is what makes voiding possible without opening the rest.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION refuse_posted_document_edit() RETURNS trigger AS $$
BEGIN
  IF OLD.status = 'posted' THEN
    IF NEW.status = 'voided'
       AND NEW.doc_number      IS NOT DISTINCT FROM OLD.doc_number
       AND NEW.total_minor     IS NOT DISTINCT FROM OLD.total_minor
       AND NEW.subtotal_minor  IS NOT DISTINCT FROM OLD.subtotal_minor
       AND NEW.tax_minor       IS NOT DISTINCT FROM OLD.tax_minor
       AND NEW.party_id        IS NOT DISTINCT FROM OLD.party_id
       AND NEW.issue_date      IS NOT DISTINCT FROM OLD.issue_date THEN
      RETURN NEW;
    END IF;

    RAISE EXCEPTION
      'document % is posted and cannot be edited. Raise a credit note instead.',
      OLD.doc_number
      USING ERRCODE = 'restrict_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS documents_posted_immutable ON documents;
CREATE TRIGGER documents_posted_immutable
  BEFORE UPDATE ON documents
  FOR EACH ROW EXECUTE FUNCTION refuse_posted_document_edit();

CREATE OR REPLACE FUNCTION refuse_posted_document_delete() RETURNS trigger AS $$
BEGIN
  IF OLD.status <> 'draft' THEN
    RAISE EXCEPTION
      'document % has been posted and cannot be deleted.', OLD.doc_number
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS documents_posted_undeletable ON documents;
CREATE TRIGGER documents_posted_undeletable
  BEFORE DELETE ON documents
  FOR EACH ROW EXECUTE FUNCTION refuse_posted_document_delete();

-- Lines of a posted document are equally frozen.
CREATE OR REPLACE FUNCTION refuse_posted_line_change() RETURNS trigger AS $$
DECLARE
  parent_status text;
BEGIN
  SELECT status::text INTO parent_status
    FROM documents
   WHERE id = COALESCE(NEW.document_id, OLD.document_id);

  IF parent_status IS NOT NULL AND parent_status <> 'draft' THEN
    RAISE EXCEPTION 'cannot change lines of a posted document'
      USING ERRCODE = 'restrict_violation';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS document_lines_frozen ON document_lines;
CREATE TRIGGER document_lines_frozen
  BEFORE INSERT OR UPDATE OR DELETE ON document_lines
  FOR EACH ROW EXECUTE FUNCTION refuse_posted_line_change();

-- ---------------------------------------------------------------------------
-- 4. An invoice can never be over-allocated.
--
-- Without this, two concurrent payments could each settle the same balance.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION assert_allocation_within_total() RETURNS trigger AS $$
DECLARE
  doc_total   bigint;
  allocated   bigint;
BEGIN
  SELECT total_minor INTO doc_total FROM documents WHERE id = NEW.to_document_id;

  SELECT COALESCE(SUM(amount_minor), 0) INTO allocated
    FROM allocations WHERE to_document_id = NEW.to_document_id;

  IF allocated > doc_total THEN
    RAISE EXCEPTION
      'allocations (%) exceed document total (%)', allocated, doc_total
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS allocations_within_total ON allocations;
CREATE CONSTRAINT TRIGGER allocations_within_total
  AFTER INSERT OR UPDATE ON allocations
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION assert_allocation_within_total();
