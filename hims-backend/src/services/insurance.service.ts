import { withTransaction } from "../config/database.js";
import { Admission } from "../models/ipd/Admission.model.js";
import { InsurancePolicy } from "../models/billing/InsurancePolicy.model.js";
import { PreAuthorization, type PreAuthorizationDocument } from "../models/billing/PreAuthorization.model.js";
import { Invoice } from "../models/billing/Invoice.model.js";
import { Payment, type PaymentDocument } from "../models/billing/Payment.model.js";
import { PreAuthStatus, PaymentMode, InvoiceStatus } from "../types/common.types.js";
import { generatePreAuthNumber, generateReceiptNumber } from "../utils/sequenceGenerator.js";
import { toObjectId } from "../utils/objectId.js";
import { round2 } from "../utils/money.js";
import { firstOrThrow } from "../utils/assert.js";
import { ValidationError, NotFoundError, ConflictError } from "../utils/errors.js";

export interface RaiseClaimInput {
  admissionId: string;
  insurancePolicyId: string;
  requestedAmount: number;
  provisionalDiagnosis: string;
  treatingDoctorId: string;
  estimatedLengthOfStayDays?: number;
}

export interface RespondToPreAuthInput {
  preAuthId: string;
  status: "APPROVED" | "PARTIALLY_APPROVED" | "REJECTED";
  approvedAmount?: number;
  rejectionReason?: string;
  tpaReferenceNumber?: string;
}

export interface SettleClaimInput {
  preAuthId: string;
  invoiceId: string;
}

export interface SettleClaimResult {
  preAuth: PreAuthorizationDocument;
  payment: PaymentDocument | null;
}

const AWAITING_DECISION_STATUSES: PreAuthStatus[] = [PreAuthStatus.PENDING, PreAuthStatus.SUBMITTED];
const SETTLEABLE_STATUSES: PreAuthStatus[] = [PreAuthStatus.APPROVED, PreAuthStatus.PARTIALLY_APPROVED];

/**
 * TPA & Insurance Claim Clearinghouse. Built on the `InsurancePolicy` /
 * `PreAuthorization` schemas Step 1 already modeled — this is the first
 * step to give them any business logic. The claim's full lifecycle
 * (`PENDING_PRE_AUTH` → `APPROVED`/`PARTIALLY_APPROVED`/`REJECTED` →
 * `QUERY_RAISED` → `SETTLED`) runs through `PreAuthorization.status`
 * continuously — `SETTLED` is a new terminal value added in Step 11
 * rather than a parallel status field, since a settlement is just the
 * natural conclusion of the same request the pre-auth started.
 */
export class InsuranceService {
  async raiseClaim(input: RaiseClaimInput, actor: string): Promise<PreAuthorizationDocument> {
    if (!input.provisionalDiagnosis?.trim()) throw new ValidationError("provisionalDiagnosis is required");
    if (!input.requestedAmount || input.requestedAmount <= 0) {
      throw new ValidationError("requestedAmount must be a positive number");
    }
    const admissionId = toObjectId(input.admissionId, "admissionId");
    const insurancePolicyId = toObjectId(input.insurancePolicyId, "insurancePolicyId");
    const treatingDoctorId = toObjectId(input.treatingDoctorId, "treatingDoctorId");

    const [admission, policy] = await Promise.all([
      Admission.findById(admissionId).lean(),
      InsurancePolicy.findById(insurancePolicyId).lean(),
    ]);
    if (!admission) throw new NotFoundError(`Admission ${input.admissionId} not found`);
    if (!policy || !policy.isActive) throw new NotFoundError(`Insurance policy ${input.insurancePolicyId} not found or inactive`);
    if (policy.patientId.toString() !== admission.patientId.toString()) {
      throw new ValidationError("This policy does not belong to the admitted patient");
    }
    if (policy.validTo.getTime() < Date.now()) {
      throw new ConflictError(`Policy ${policy.policyNumber} expired on ${policy.validTo.toISOString().slice(0, 10)}`);
    }

    const existingOpenClaim = await PreAuthorization.findOne({
      admissionId,
      status: { $nin: [PreAuthStatus.REJECTED, PreAuthStatus.SETTLED] },
    }).lean();
    if (existingOpenClaim) {
      throw new ConflictError(`Admission already has an open claim (${existingOpenClaim.preAuthNumber})`);
    }

    const preAuthNumber = await generatePreAuthNumber();
    return PreAuthorization.create({
      preAuthNumber,
      admissionId,
      patientId: admission.patientId,
      insurancePolicyId,
      status: PreAuthStatus.PENDING,
      requestedAmount: input.requestedAmount,
      provisionalDiagnosis: input.provisionalDiagnosis.trim(),
      treatingDoctorId,
      estimatedLengthOfStayDays: input.estimatedLengthOfStayDays,
      submittedAt: new Date(),
      queries: [],
      attachmentStorageKeys: [],
      createdBy: actor,
    });
  }

  /** The TPA officer's decision on a pending request. */
  async respondToPreAuth(input: RespondToPreAuthInput): Promise<PreAuthorizationDocument> {
    const preAuth = await PreAuthorization.findById(toObjectId(input.preAuthId, "preAuthId"));
    if (!preAuth) throw new NotFoundError(`Claim ${input.preAuthId} not found`);
    if (!AWAITING_DECISION_STATUSES.includes(preAuth.status)) {
      throw new ConflictError(`Claim ${preAuth.preAuthNumber} is ${preAuth.status} and is not awaiting a decision`);
    }
    if ((input.status === "APPROVED" || input.status === "PARTIALLY_APPROVED") && !input.approvedAmount) {
      throw new ValidationError("approvedAmount is required when approving or partially approving a claim");
    }
    if (input.status === "REJECTED" && !input.rejectionReason?.trim()) {
      throw new ValidationError("rejectionReason is required when rejecting a claim");
    }

    preAuth.status = PreAuthStatus[input.status];
    preAuth.approvedAmount = input.approvedAmount;
    preAuth.rejectionReason = input.rejectionReason?.trim();
    preAuth.tpaReferenceNumber = input.tpaReferenceNumber?.trim() || preAuth.tpaReferenceNumber;
    preAuth.respondedAt = new Date();
    await preAuth.save();
    return preAuth;
  }

  async raiseQuery(preAuthId: string, queryText: string): Promise<PreAuthorizationDocument> {
    if (!queryText?.trim()) throw new ValidationError("queryText is required");
    const preAuth = await PreAuthorization.findById(toObjectId(preAuthId, "preAuthId"));
    if (!preAuth) throw new NotFoundError(`Claim ${preAuthId} not found`);
    if (preAuth.status === PreAuthStatus.SETTLED || preAuth.status === PreAuthStatus.REJECTED) {
      throw new ConflictError(`Claim ${preAuth.preAuthNumber} is ${preAuth.status} and cannot receive a new query`);
    }

    preAuth.queries.push({ raisedAt: new Date(), raisedByTPA: true, queryText: queryText.trim() });
    preAuth.status = PreAuthStatus.QUERY_RAISED;
    await preAuth.save();
    return preAuth;
  }

  /** Hospital staff answers the TPA's most recent open query — puts the claim back under TPA review. */
  async respondToQuery(preAuthId: string, responseText: string, actor: string): Promise<PreAuthorizationDocument> {
    if (!responseText?.trim()) throw new ValidationError("responseText is required");
    const preAuth = await PreAuthorization.findById(toObjectId(preAuthId, "preAuthId"));
    if (!preAuth) throw new NotFoundError(`Claim ${preAuthId} not found`);

    const openQuery = [...preAuth.queries].reverse().find((q) => !q.responseText);
    if (!openQuery) {
      throw new ConflictError(`Claim ${preAuth.preAuthNumber} has no open query awaiting a response`);
    }
    openQuery.responseText = responseText.trim();
    openQuery.respondedAt = new Date();
    openQuery.respondedByUserId = actor;
    preAuth.status = PreAuthStatus.SUBMITTED;
    await preAuth.save();
    return preAuth;
  }

  /**
   * Closes the loop: splits the invoice's remaining balance into what
   * the TPA actually covers (capped at both the approved amount and
   * whatever is still due — never more, even if the patient already paid
   * something out of pocket first) and what the patient owes at the
   * counter, then posts the TPA's share as a real Payment. One
   * transaction across PreAuthorization + Invoice + Payment: the claim
   * can never show SETTLED without the money having actually landed on
   * the invoice, or vice versa.
   */
  async settleClaim(input: SettleClaimInput, actor: string): Promise<SettleClaimResult> {
    const preAuthId = toObjectId(input.preAuthId, "preAuthId");
    const invoiceId = toObjectId(input.invoiceId, "invoiceId");

    return withTransaction(async (session) => {
      const preAuth = await PreAuthorization.findById(preAuthId).session(session);
      if (!preAuth) throw new NotFoundError(`Claim ${input.preAuthId} not found`);
      if (!SETTLEABLE_STATUSES.includes(preAuth.status)) {
        throw new ConflictError(`Claim ${preAuth.preAuthNumber} is ${preAuth.status} and cannot be settled yet`);
      }

      const invoice = await Invoice.findById(invoiceId).session(session);
      if (!invoice) throw new NotFoundError(`Invoice ${input.invoiceId} not found`);
      if (invoice.patientId.toString() !== preAuth.patientId.toString()) {
        throw new ValidationError("This invoice does not belong to the claim's patient");
      }
      if (invoice.status === InvoiceStatus.PAID) {
        throw new ConflictError(`Invoice ${invoice.invoiceNumber} is already fully paid`);
      }

      const tpaApprovedAmount = round2(Math.min(preAuth.approvedAmount ?? 0, invoice.amountDue));
      const patientCoPayAmount = round2(invoice.amountDue - tpaApprovedAmount);

      let payment: PaymentDocument | null = null;
      if (tpaApprovedAmount > 0) {
        const receiptNumber = await generateReceiptNumber();
        payment = firstOrThrow(
          await Payment.create(
            [
              {
                receiptNumber,
                invoiceId: invoice._id,
                patientId: invoice.patientId,
                amount: tpaApprovedAmount,
                mode: PaymentMode.INSURANCE,
                transactionType: "PAYMENT",
                referenceNumber: preAuth.tpaReferenceNumber,
                collectedByUserId: actor,
                collectedAt: new Date(),
                notes: `TPA settlement for claim ${preAuth.preAuthNumber}`,
              },
            ],
            { session },
          ),
          "Payment.create returned no document",
        );

        invoice.amountPaid = round2(invoice.amountPaid + tpaApprovedAmount);
        invoice.amountDue = round2(invoice.amountDue - tpaApprovedAmount);
        invoice.status = invoice.amountDue <= 0 ? InvoiceStatus.PAID : InvoiceStatus.PARTIALLY_PAID;
        await invoice.save({ session });
      }

      preAuth.status = PreAuthStatus.SETTLED;
      preAuth.invoiceId = invoice._id;
      preAuth.tpaApprovedAmount = tpaApprovedAmount;
      preAuth.patientCoPayAmount = patientCoPayAmount;
      preAuth.settledAt = new Date();
      preAuth.settlementPaymentId = payment?._id;
      await preAuth.save({ session });

      return { preAuth, payment };
    });
  }

  async listClaims(filters: { status?: PreAuthStatus } = {}): Promise<PreAuthorizationDocument[]> {
    const query: Record<string, unknown> = {};
    if (filters.status) query.status = filters.status;
    return PreAuthorization.find(query)
      .sort({ createdAt: -1 })
      .populate("patientId", "uhid firstName lastName")
      .populate("insurancePolicyId", "insurerName tpaName policyNumber sumInsured")
      .populate("admissionId", "admissionNumber provisionalDiagnosis")
      .populate("treatingDoctorId", "fullName");
  }
}

export const insuranceService = new InsuranceService();
