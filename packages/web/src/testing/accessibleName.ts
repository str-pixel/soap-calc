/**
 * The three name sources that apply to a form control, in the precedence the accessible-name
 * algorithm actually gives them: aria-labelledby first, then aria-label, then the wrapping
 * <label>. Written out rather than pulled from dom-accessibility-api, which is only a
 * transitive dependency here — and writing it out is the point: the precedence IS the claim
 * being made, that an aria-label silently REPLACES the words on screen rather than adding to
 * them, and that an aria-labelledby would in turn replace the aria-label. Getting that order
 * wrong here would let a control gain an aria-labelledby later and change its real name while
 * these tests kept reading the outranked aria-label — passing as the spoken name drifted.
 *
 * Deliberately minimal past the ordering: each labelledby reference contributes its element's
 * textContent (no recursive name computation — this codebase's labels are flat text), joined
 * with single spaces per the spec, and an aria-labelledby that resolves to nothing falls
 * through to the next source exactly as the algorithm does.
 *
 * Shared across component tests that assert Label-in-Name (WCAG 2.5.3) — a control's
 * accessible name must CONTAIN its visible caption. Originally lived only in
 * DilutionPanel.test.tsx; moved here once a second file (SoapingTemperaturePanel.test.tsx,
 * PricingPanel.test.tsx) needed the same check, so the algorithm has one home instead of
 * copies that can drift apart.
 */
export function accessibleNameOf(el: HTMLElement): string {
  const labelledBy = el.getAttribute('aria-labelledby');
  if (labelledBy !== null) {
    const joined = labelledBy
      .split(/\s+/)
      .filter(Boolean)
      .map((id) => document.getElementById(id)?.textContent ?? '')
      .join(' ')
      .trim();
    if (joined !== '') return joined;
  }
  const ariaLabel = el.getAttribute('aria-label');
  if (ariaLabel !== null) return ariaLabel;
  return el.closest('label')?.textContent ?? '';
}
