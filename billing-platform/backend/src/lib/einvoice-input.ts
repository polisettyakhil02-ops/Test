import { getDb } from '@/db'
import { getDocument } from '@/lib/queries'
import type { EinvoiceInput } from '@/domain/einvoice'

/**
 * Assembles the e-invoice input for a document.
 *
 * Shared by the page that shows whether an invoice can be registered and the
 * route that hands the payload over, so the two can never disagree about what
 * would be sent.
 *
 * The buyer's PIN code and city come from the party record rather than the
 * document snapshot: the snapshot flattens the address to one string for
 * printing, and the IRP needs the parts separately.
 */
export async function einvoiceInputFor(
  entityId: string,
  documentId: string,
): Promise<{ input: EinvoiceInput; docNumber: string | null } | null> {
  const store = await getDb()
  const found = await getDocument(store, entityId, documentId)
  if (!found || found.doc.docType === 'payment') return null

  const org = await store.entities.findOne({ _id: entityId })
  const party = await store.parties.findOne({ _id: found.doc.partyId })

  const address = party?.billingAddress
  const orgAddress = org?.addressLines ?? []

  return {
    docNumber: found.doc.docNumber,
    input: {
      docType: found.doc.docType as 'invoice' | 'credit_note',
      docNumber: found.doc.docNumber ?? '',
      issueDate: found.doc.issueDate,
      status: found.doc.status,
      supplyKind: found.doc.supplyKind,
      seller: {
        gstin: org?.gstin ?? '',
        legalName: org?.legalName || (org?.name ?? ''),
        addressLines: orgAddress,
        // The last address line is conventionally "City - PIN"; anything the
        // entity has not filled in shows up as a blocker rather than silently
        // going out wrong.
        city: cityOf(orgAddress),
        pincode: pincodeOf(orgAddress.join(' ')),
        stateCode: org?.stateCode ?? '',
        phone: org?.phone ?? '',
        email: org?.email ?? '',
      },
      buyer: {
        gstin: found.doc.partySnapshot.gstin ?? '',
        legalName: found.doc.partySnapshot.name ?? '',
        address: [address?.line1, address?.line2].filter(Boolean).join(', '),
        city: address?.city ?? '',
        pincode: address?.postalCode ?? '',
        stateCode: found.doc.partySnapshot.stateCode ?? '',
        placeOfSupply: found.doc.placeOfSupply,
        phone: found.doc.partySnapshot.phone ?? '',
        email: found.doc.partySnapshot.email ?? '',
      },
      discountMinor: found.doc.discountMinor,
      totalMinor: found.doc.totalMinor,
      lines: found.lines.map((line) => ({
        description: line.description,
        hsnSac: line.hsnSac,
        unit: line.unit,
        quantity: line.quantity,
        unitPriceMinor: line.unitPriceMinor,
        taxRatePercent: line.taxRatePercent,
        lineSubtotalMinor: line.lineSubtotalMinor,
        lineDiscountMinor: line.lineDiscountMinor,
        lineTaxMinor: line.lineTaxMinor,
        lineTotalMinor: line.lineTotalMinor,
      })),
    },
  }
}

function pincodeOf(text: string): string {
  return text.match(/\b(\d{6})\b/)?.[1] ?? ''
}

function cityOf(lines: string[]): string {
  const last = lines.at(-1) ?? ''
  return last.replace(/\b\d{6}\b/, '').replace(/[-,\s]+$/, '').trim()
}
