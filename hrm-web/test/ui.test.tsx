import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Button, Field, Input, PasswordInput, StateView } from '@/components/ui';
import { ExpiryBadge } from '@/features/employees/components/ExpiryBadge';
import { visibleNav } from '@/components/layout/nav';

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
  const now = new Date('2026-01-01T00:00:00Z');
  it.each([
    ['2025-12-31', 'EXPIRED'],
    ['2026-01-20', 'D30'],
    ['2026-02-25', 'D60'],
    ['2026-03-20', 'D90'],
    ['2027-01-01', 'VALID'],
  ])('%s → %s', (date, status) => {
    const { container } = render(<ExpiryBadge expiresAt={date} now={now} />);
    expect(container.querySelector(`[data-expiry="${status}"]`)).not.toBeNull();
  });
});

describe('visibleNav', () => {
  it('hides items the user has no permission for', () => {
    expect(visibleNav([]).map((i) => i.href)).toEqual(['/dashboard', '/notifications']);
    expect(visibleNav(['employee.read', 'org.read', 'org.write']).map((i) => i.href)).toContain('/settings');
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
