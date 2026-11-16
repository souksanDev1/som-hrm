import { ApiError } from '@hrm/shared';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { FileUpload } from '@/components/ui';
import { resolveWebLink } from '@/features/notifications/links';

const pdf = (size = 10) => new File([new Uint8Array(size)], 'contract.pdf', { type: 'application/pdf' });

describe('FileUpload', () => {
  it('passes the chosen file to onSelect and onUpload', async () => {
    const onSelect = vi.fn();
    const onUpload = vi.fn().mockResolvedValue(undefined);
    render(<FileUpload label="Upload" onSelect={onSelect} onUpload={onUpload} accept=".pdf" />);
    const input = screen.getByLabelText('Upload');
    expect(input).toHaveAttribute('accept', '.pdf');
    const file = pdf();
    await userEvent.upload(input, file);
    expect(onSelect).toHaveBeenCalledWith(file);
    await waitFor(() => expect(onUpload).toHaveBeenCalledWith(file));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('rejects files above maxBytes before uploading', async () => {
    const onUpload = vi.fn();
    render(<FileUpload label="Upload" maxBytes={5} onUpload={onUpload} />);
    await userEvent.upload(screen.getByLabelText('Upload'), pdf(6));
    expect(onUpload).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('ໄຟລ໌ໃຫຍ່ເກີນກຳນົດ');
    expect(screen.getByLabelText('Upload')).toHaveAttribute('aria-invalid', 'true');
  });

  it('shows a translated API error when the upload fails', async () => {
    const onUpload = vi.fn().mockRejectedValue(new ApiError(415, 'unsupported_file_type', 'x'));
    render(<FileUpload label="Upload" onUpload={onUpload} />);
    await userEvent.upload(screen.getByLabelText('Upload'), pdf());
    expect(await screen.findByRole('alert')).toHaveTextContent('PDF, JPG');
  });

  it('is disabled and shows an external error / hint', () => {
    const { rerender } = render(<FileUpload label="Upload" disabled hint="PDF only" />);
    expect(screen.getByLabelText('Upload')).toBeDisabled();
    expect(screen.getByText('PDF only')).toBeInTheDocument();
    rerender(<FileUpload label="Upload" error="Bad file" />);
    expect(screen.getByRole('alert')).toHaveTextContent('Bad file');
  });
});

describe('resolveWebLink', () => {
  it('only allows known in-app routes', () => {
    expect(resolveWebLink('/employees/abc')).toBe('/employees/abc');
    expect(resolveWebLink('/profile')).toBeNull();
    expect(resolveWebLink('//evil.example')).toBeNull();
    expect(resolveWebLink('https://evil.example')).toBeNull();
    expect(resolveWebLink(null)).toBeNull();
  });
});
