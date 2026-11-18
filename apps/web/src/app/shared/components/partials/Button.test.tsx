import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Button } from './Button';

describe('Button', () => {
  it('calls onClick when clicked', async () => {
    const handleClick = vi.fn();
    render(<Button title="Save" type="button" onClick={handleClick} />);

    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('does not call onClick when disabled', async () => {
    const handleClick = vi.fn();
    render(<Button title="Save" isDisabled onClick={handleClick} />);

    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(screen.getByRole('button')).toBeDisabled();
    expect(handleClick).not.toHaveBeenCalled();
  });
});
