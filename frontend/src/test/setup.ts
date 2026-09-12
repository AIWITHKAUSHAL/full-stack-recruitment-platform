import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  localStorage.clear();
});

// jsdom implements neither of these, and several components use them.
Object.defineProperty(window, 'scrollTo', { value: vi.fn(), writable: true, configurable: true });

// configurable: true matters — @testing-library/user-event installs its own
// clipboard stub in setup(), and a non-configurable property makes it throw.
if (!navigator.clipboard) {
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
    writable: true,
    configurable: true,
  });
}
