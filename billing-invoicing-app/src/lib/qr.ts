import QRCode from 'qrcode'

/**
 * A QR code as a PNG data URI.
 *
 * Everything is generated locally -- no external image service is involved,
 * which matters here because the string being encoded is a signed government
 * document reference and has no business leaving this machine.
 *
 * Error correction is set to M: the signed QR string is long, and the higher
 * levels push the module count up far enough that the code stops scanning
 * reliably at the size a printed invoice gives it.
 */
export async function qrDataUrl(text: string, size = 220): Promise<string | null> {
  if (!text) return null

  try {
    return await QRCode.toDataURL(text, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: size,
      color: { dark: '#000000ff', light: '#ffffffff' },
    })
  } catch {
    // A QR that cannot be generated must not take the invoice down with it.
    return null
  }
}
