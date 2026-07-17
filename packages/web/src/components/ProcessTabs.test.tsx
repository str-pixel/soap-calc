/** @vitest-environment jsdom */
import { afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProcessTabs } from './ProcessTabs';

afterEach(cleanup);

describe('ProcessTabs', () => {
  it('renders all three processes and marks the active one', () => {
    render(
      <ProcessTabs
        process="cp"
        onChange={() => {}}
        processVariant="cp"
        onVariantChange={() => {}}
      />,
    );
    expect(screen.getByRole('tab', { name: /cold process/i }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tab', { name: /liquid soap/i }).getAttribute('aria-selected')).toBe('false');
  });

  it('calls onChange when a different process is clicked', async () => {
    const onChange = vi.fn();
    render(
      <ProcessTabs
        process="cp"
        onChange={onChange}
        processVariant="cp"
        onVariantChange={() => {}}
      />,
    );
    await userEvent.click(screen.getByRole('tab', { name: /liquid soap/i }));
    expect(onChange).toHaveBeenCalledWith('ls');
  });

  it('does not show a variant selector for CP (only one variant)', () => {
    render(
      <ProcessTabs
        process="cp"
        onChange={() => {}}
        processVariant="cp"
        onVariantChange={() => {}}
      />,
    );
    expect(screen.queryByRole('tablist', { name: /process variant/i })).toBeNull();
  });

  it('shows three variant chips for HP, with the active variant marked', () => {
    render(
      <ProcessTabs
        process="hp"
        onChange={() => {}}
        processVariant="hp-lthp"
        onVariantChange={() => {}}
      />,
    );
    const variantTabs = within(screen.getByRole('tablist', { name: /process variant/i }));
    expect(variantTabs.getByRole('tab', { name: /low-temp hp/i })).toBeTruthy();
    expect(variantTabs.getByRole('tab', { name: /high-temp hp/i })).toBeTruthy();
    expect(variantTabs.getByRole('tab', { name: /fluid hp/i })).toBeTruthy();
    expect(variantTabs.getByRole('tab', { name: /low-temp hp/i }).getAttribute('aria-selected')).toBe('true');
    expect(variantTabs.getByRole('tab', { name: /high-temp hp/i }).getAttribute('aria-selected')).toBe('false');
  });

  it('selecting HTHP calls onVariantChange with hp-hthp', async () => {
    const onVariantChange = vi.fn();
    render(
      <ProcessTabs
        process="hp"
        onChange={() => {}}
        processVariant="hp-lthp"
        onVariantChange={onVariantChange}
      />,
    );
    const variantTabs = within(screen.getByRole('tablist', { name: /process variant/i }));
    await userEvent.click(variantTabs.getByRole('tab', { name: /high-temp hp/i }));
    expect(onVariantChange).toHaveBeenCalledWith('hp-hthp');
  });

  it('shows four variant chips for LS, defaulting the active one to CPLS', () => {
    render(
      <ProcessTabs
        process="ls"
        onChange={() => {}}
        processVariant="ls-cpls"
        onVariantChange={() => {}}
      />,
    );
    const variantTabs = within(screen.getByRole('tablist', { name: /process variant/i }));
    expect(variantTabs.getAllByRole('tab')).toHaveLength(4);
    expect(variantTabs.getByRole('tab', { name: /cold-process ls/i }).getAttribute('aria-selected')).toBe('true');
  });

  it('gives the active tab tabIndex=0 and the rest tabIndex=-1, on both tablists', () => {
    render(
      <ProcessTabs
        process="hp"
        onChange={() => {}}
        processVariant="hp-lthp"
        onVariantChange={() => {}}
      />,
    );
    const processTabs = within(screen.getByRole('tablist', { name: /soap process/i }));
    expect(processTabs.getByRole('tab', { name: /hot process/i }).getAttribute('tabindex')).toBe('0');
    expect(processTabs.getByRole('tab', { name: /cold process/i }).getAttribute('tabindex')).toBe('-1');
    expect(processTabs.getByRole('tab', { name: /liquid soap/i }).getAttribute('tabindex')).toBe('-1');

    const variantTabs = within(screen.getByRole('tablist', { name: /process variant/i }));
    expect(variantTabs.getByRole('tab', { name: /low-temp hp/i }).getAttribute('tabindex')).toBe('0');
    expect(variantTabs.getByRole('tab', { name: /high-temp hp/i }).getAttribute('tabindex')).toBe('-1');
    expect(variantTabs.getByRole('tab', { name: /fluid hp/i }).getAttribute('tabindex')).toBe('-1');
  });

  it('ArrowRight on the HP variant tablist moves from LTHP to HTHP and invokes onVariantChange', async () => {
    const onVariantChange = vi.fn();
    render(
      <ProcessTabs
        process="hp"
        onChange={() => {}}
        processVariant="hp-lthp"
        onVariantChange={onVariantChange}
      />,
    );
    const variantTabs = within(screen.getByRole('tablist', { name: /process variant/i }));
    const active = variantTabs.getByRole('tab', { name: /low-temp hp/i });
    active.focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(onVariantChange).toHaveBeenCalledWith('hp-hthp');
  });

  it('ArrowLeft wraps from the first HP variant to the last', async () => {
    const onVariantChange = vi.fn();
    render(
      <ProcessTabs
        process="hp"
        onChange={() => {}}
        processVariant="hp-lthp"
        onVariantChange={onVariantChange}
      />,
    );
    const variantTabs = within(screen.getByRole('tablist', { name: /process variant/i }));
    const active = variantTabs.getByRole('tab', { name: /low-temp hp/i });
    active.focus();
    await userEvent.keyboard('{ArrowLeft}');
    expect(onVariantChange).toHaveBeenCalledWith('hp-fluid');
  });

  it('ArrowRight on the process tablist moves from CP to HP and invokes onChange', async () => {
    const onChange = vi.fn();
    render(
      <ProcessTabs
        process="cp"
        onChange={onChange}
        processVariant="cp"
        onVariantChange={() => {}}
      />,
    );
    const processTabs = within(screen.getByRole('tablist', { name: /soap process/i }));
    const active = processTabs.getByRole('tab', { name: /cold process/i });
    active.focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(onChange).toHaveBeenCalledWith('hp');
  });
});
