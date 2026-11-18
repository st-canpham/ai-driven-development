import { AxiosError, AxiosHeaders } from 'axios';
import { describe, expect, it } from 'vitest';
import { normalizeError } from './error.utils';

describe('normalizeError', () => {
  it('uses the server message for an HTTP error response', () => {
    const error = new AxiosError('Conflict', '409', undefined, undefined, {
      status: 409,
      statusText: 'Conflict',
      data: { message: 'Room already booked' },
      headers: {},
      config: { headers: new AxiosHeaders() },
    });

    expect(normalizeError(error)).toEqual({
      status: 409,
      message: 'Room already booked',
      code: '409',
    });
  });

  it('returns a network error when there is no response', () => {
    expect(normalizeError(new AxiosError('Network Error'))).toEqual({
      status: null,
      message: 'Network error. Please try again.',
    });
  });

  it('returns a generic error for non-Axios errors', () => {
    expect(normalizeError(new Error('boom')).message).toBe(
      'An unexpected error occurred.',
    );
  });
});
