// Best-effort name extraction from a LinkedIn profile URL slug, e.g.
// https://www.linkedin.com/in/jordan-lee-4a2b1c9/ -> "Jordan Lee"
// LinkedIn slugs often end in a random id segment - stripped heuristically
// (a trailing token that's mostly hex/digits) rather than trying to be exact.
// Not a general-purpose name parser: this only ever sees what's in the URL.
function parseNameFromLinkedInUrl(url) {
  if (!url) return null;
  const match = url.match(/linkedin\.com\/in\/([^/?#]+)/i);
  if (!match) return null;

  let slug;
  try {
    slug = decodeURIComponent(match[1]);
  } catch {
    slug = match[1];
  }

  const parts = slug.split('-').filter(Boolean);
  if (parts.length > 1 && /^[0-9a-f]{5,}$/i.test(parts[parts.length - 1])) {
    parts.pop();
  }
  if (parts.length === 0) return null;

  return parts.map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
}

module.exports = { parseNameFromLinkedInUrl };
