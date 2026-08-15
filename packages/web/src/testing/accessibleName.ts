/**
 * The three name sources that apply to a form control, in the precedence the accessible-name
 * algorithm gives them: aria-label, then aria-labelledby, then the wrapping <label>. Written
 * out rather than pulled from dom-accessibility-api, which is only a transitive dependency
 * here — and writing it out is the point: the precedence IS the claim being made, that an
 * aria-label silently REPLACES the words on screen rather than adding to them.
 *
 * Shared across component tests that assert Label-in-Name (WCAG 2.5.3) — a control's
 * accessible name must CONTAIN its visible caption. Originally lived only in
 * DilutionPanel.test.tsx; moved here once a second file (SoapingTemperaturePanel.test.tsx,
 * PricingPanel.test.tsx) needed the same check, so the algorithm has one home instead of
 * copies that can drift apart.
 */
export function accessibleNameOf(el: HTMLElement): string {
  const ariaLabel = el.getAttribute('aria-label');
  if (ariaLabel !== null) return ariaLabel;
  const labelledBy = el.getAttribute('aria-labelledby');
  if (labelledBy !== null) return document.getElementById(labelledBy)?.textContent ?? '';
  return el.closest('label')?.textContent ?? '';
}
