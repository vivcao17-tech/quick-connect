/**
 * Turn a free-text contact into something tappable when it plainly is one.
 * Anything we can't read confidently stays as plain text.
 */
export function contactLink(raw: string): { href: string; label: string } | null {
  const text = raw.trim();
  if (!text) return null;

  if (/^https?:\/\//i.test(text)) return { href: text, label: text };

  const ig = text.match(
    /^(?:@|(?:https?:\/\/)?(?:www\.)?instagram\.com\/)([A-Za-z0-9._]{2,30})\/?$/,
  );
  if (ig?.[1]) return { href: `https://instagram.com/${ig[1]}`, label: `@${ig[1]}` };

  const digits = text.replace(/[^\d+]/g, "");
  if (/^\+?\d{7,15}$/.test(digits) && /^[\d+\-().\s]+$/.test(text)) {
    return { href: `tel:${digits}`, label: text };
  }

  return null;
}
