// @vitest-environment jsdom
import { afterEach, expect, test } from 'vitest';
import { accessibleNameOf } from './accessibleName';

afterEach(() => {
  document.body.innerHTML = '';
});

function mount(html: string): HTMLElement {
  document.body.innerHTML = html;
  return document.body.querySelector<HTMLElement>('[data-subject]')!;
}

// The ordering claims below are the reason this helper exists (see its doc comment) — each
// test pits two sources against each other so the wrong precedence cannot pass silently.

test('aria-labelledby outranks aria-label — the drift this helper must catch', () => {
  // If a control ever gains a labelledby beside its aria-label, assistive tech switches
  // names. A helper that kept reading aria-label would keep old tests green while the
  // spoken name changed — the exact silent pass this file is meant to make impossible.
  const el = mount(
    '<span id="cap">From the page</span>' +
      '<input data-subject aria-labelledby="cap" aria-label="From the attribute" />',
  );
  expect(accessibleNameOf(el)).toBe('From the page');
});

test('aria-label outranks the wrapping label — the replacement Label-in-Name is about', () => {
  const el = mount('<label>Visible caption<input data-subject aria-label="Other name" /></label>');
  expect(accessibleNameOf(el)).toBe('Other name');
});

test('multiple labelledby references resolve in attribute order, space-joined', () => {
  const el = mount(
    '<span id="b">world</span><span id="a">hello</span>' +
      '<input data-subject aria-labelledby="a b" />',
  );
  expect(accessibleNameOf(el)).toBe('hello world');
});

test('a labelledby that resolves to nothing falls through instead of naming the control ""', () => {
  // Dangling references happen when an id is renamed; the algorithm moves to the next
  // source rather than leaving the control nameless-but-labelled.
  const el = mount('<input data-subject aria-labelledby="gone" aria-label="Fallback" />');
  expect(accessibleNameOf(el)).toBe('Fallback');
});

test('with no ARIA attributes the wrapping label names the control', () => {
  const el = mount('<label>Visible caption<input data-subject /></label>');
  expect(accessibleNameOf(el)).toBe('Visible caption');
});

test('no source at all yields the empty string', () => {
  const el = mount('<input data-subject />');
  expect(accessibleNameOf(el)).toBe('');
});
