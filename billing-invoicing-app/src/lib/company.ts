/**
 * Your own business details -- the "from" side of every invoice.
 *
 * Single-tenant, so this is configuration rather than data: there is exactly
 * one issuing company and it never changes per record. Set it in .env.local.
 */
export interface CompanyDetails {
  name: string
  addressLines: string[]
  gstin: string
  email: string
  phone: string
  website: string
  bankDetails: string
  footerNote: string
}

export function getCompanyDetails(): CompanyDetails {
  return {
    name: process.env.COMPANY_NAME || 'Your Company Name',
    // Multi-line address in one variable: split on "|" so it stays a single
    // env var while still laying out over several lines on the PDF.
    addressLines: (process.env.COMPANY_ADDRESS || '')
      .split('|')
      .map((line) => line.trim())
      .filter(Boolean),
    gstin: process.env.COMPANY_GSTIN || '',
    email: process.env.COMPANY_EMAIL || '',
    phone: process.env.COMPANY_PHONE || '',
    website: process.env.COMPANY_WEBSITE || '',
    bankDetails: process.env.COMPANY_BANK_DETAILS || '',
    footerNote: process.env.COMPANY_FOOTER || 'This is a computer-generated invoice.',
  }
}
