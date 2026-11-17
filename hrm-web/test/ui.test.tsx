import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Button, Field, Input, PasswordInput, StateView } from '@/components/ui';
import { ExpiryBadge } from '@/features/employees/components/ExpiryBadge';
import { activeNavHref, NAV_ITEMS, visibleNav } from '@/components/layout/nav';

describe('Button', () => {
  it('fires onClick and is disabled while loading', async () => {
    const onClick = vi.fn();
    const { rerender } = render(<Button onClick={onClick}>Save</Button>);
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onClick).toHaveBeenCalledTimes(1);
    rerender(<Button onClick={onClick} loading>Save</Button>);
    expect(screen.getByRole('button')).toBeDisabled();
    expect(screen.getByRole('button')).toHaveAttribute('aria-busy', 'true');
  });
});

describe('Field + Input', () => {
  it('links the error message to the input for screen readers', () => {
    render(
      <Field label="Phone" htmlFor="phone" error="Invalid">
        <Input id="phone" invalid />
      </Field>,
    );
    const input = screen.getByLabelText('Phone');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAttribute('aria-describedby', 'phone-error');
    expect(screen.getByRole('alert')).toHaveTextContent('Invalid');
  });
});

describe('StateView', () => {
  it('renders the offline state', () => {
    render(<StateView kind="offline" title="No internet" />);
    expect(screen.getByRole('status')).toHaveAttribute('data-state', 'offline');
  });
});

describe('ExpiryBadge', () => {
  it('renders the API status as-is, with the threshold in the label', () => {
    const { container } = render(<ExpiryBadge expiryStatus="EXPIRING" expiryThresholdDays={7} />);
    const el = container.querySelector('[data-expiry="EXPIRING"]');
    expect(el).toHaveAttribute('data-threshold', '7');
    expect(el).toHaveTextContent('7');
  });
  it('shows expired documents in the danger tone', () => {
    const { container } = render(<ExpiryBadge expiryStatus="EXPIRED" expiryThresholdDays={null} />);
    expect(container.querySelector('[data-expiry="EXPIRED"]')?.parentElement?.className).toMatch(/danger/);
  });
});

describe('activeNavHref', () => {
  it('highlights only the most specific matching item', () => {
    expect(activeNavHref('/settings/parameters', NAV_ITEMS)).toBe('/settings/parameters');
    expect(activeNavHref('/settings', NAV_ITEMS)).toBe('/settings');
    expect(activeNavHref('/employees/abc/edit', NAV_ITEMS)).toBe('/employees');
    expect(activeNavHref('/unknown', NAV_ITEMS)).toBeUndefined();
  });
});

describe('visibleNav', () => {
  it('hides items the user has no permission for', () => {
    expect(visibleNav([]).map((i) => i.href)).toEqual(['/dashboard', '/approvals', '/notifications', '/account']);
    expect(visibleNav(['employee.read', 'org.read', 'org.write']).map((i) => i.href)).toContain('/settings');
    expect(visibleNav(['org.read']).map((i) => i.href)).not.toContain('/settings');
    expect(visibleNav(['org.write']).find((i) => i.href === '/settings')?.mobile).toBe(true);
  });
});

describe('PasswordInput', () => {
  it('toggles between hidden and visible text', async () => {
    render(
      <Field label="Password" htmlFor="pw">
        <PasswordInput id="pw" defaultValue="secret" />
      </Field>,
    );
    const input = screen.getByLabelText('Password');
    const toggle = screen.getByTestId('pw-toggle');
    expect(input).toHaveAttribute('type', 'password');
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(toggle);
    expect(input).toHaveAttribute('type', 'text');
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(toggle);
    expect(input).toHaveAttribute('type', 'password');
  });
});
