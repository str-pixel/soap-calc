/** @vitest-environment jsdom */
import { afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProcessTabs } from './ProcessTabs';

afterEach(cleanup);

describe('ProcessTabs', () => {
  it('renders all three processes and marks the active one', () => {
    render(<ProcessTabs process="cp" onChange={() => {}} />);
    expect(screen.getByRole('tab', { name: /cold process/i }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tab', { name: /liquid soap/i }).getAttribute('aria-selected')).toBe('false');
  });

  it('calls onChange when a different process is clicked', async () => {
    const onChange = vi.fn();
    render(<ProcessTabs process="cp" onChange={onChange} />);
    await userEvent.click(screen.getByRole('tab', { name: /liquid soap/i }));
    expect(onChange).toHaveBeenCalledWith('ls');
  });
});
