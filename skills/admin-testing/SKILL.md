---
name: admin-testing
description: Testing patterns for Admin Nx monorepo. Covers Vitest unit tests, React Testing Library for components, tRPC mocking, and E2E testing patterns. Use when writing tests or setting up test infrastructure.
context: fork
version: 1.0.0
tags: [testing, vitest, rtl, react-testing-library, trpc, unit-test, e2e]
author: Admin Team
user-invocable: false
---

# Admin Testing Patterns

Testing strategies for the Admin Nx monorepo.

## When to Use

- Writing unit tests for components
- Writing unit tests for hooks
- Testing tRPC procedures
- Mocking API calls
- Setting up test infrastructure

## Technology Stack

- **Vitest** - Test runner (configured in Nx)
- **React Testing Library (RTL)** - Component testing
- **@testing-library/user-event** - User interaction simulation
- **MSW (Mock Service Worker)** - API mocking (recommended)
- **@trpc/server** - tRPC procedure testing

## Test File Organization

```
apps/admin_client/src/
├── components/
│   └── feature/
│       ├── FeatureComponent.tsx
│       ├── featureComponentStyles.ts
│       └── __tests__/
│           └── FeatureComponent.test.tsx
├── hooks/
│   ├── useFeature.ts
│   └── __tests__/
│       └── useFeature.test.ts
└── test/
    ├── setup.ts              # Test setup file
    ├── mocks/
    │   └── handlers.ts       # MSW handlers
    └── utils/
        └── testUtils.tsx     # Custom render, etc.
```

## Component Testing Pattern

```typescript
// __tests__/FeatureComponent.test.tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import FeatureComponent from '../FeatureComponent';
import { renderWithProviders } from '../../../test/utils/testUtils';

describe('FeatureComponent', () => {
  const defaultProps = {
    id: 'test-id',
    onClose: vi.fn(),
    onSuccess: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders correctly', () => {
    renderWithProviders(<FeatureComponent {...defaultProps} />);

    expect(screen.getByText('Feature Title')).toBeInTheDocument();
  });

  it('displays loading state', () => {
    renderWithProviders(<FeatureComponent {...defaultProps} />);

    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('handles user interaction', async () => {
    const user = userEvent.setup();
    renderWithProviders(<FeatureComponent {...defaultProps} />);

    const button = screen.getByRole('button', { name: /submit/i });
    await user.click(button);

    expect(defaultProps.onSuccess).toHaveBeenCalled();
  });

  it('displays error state', async () => {
    // Mock error response
    renderWithProviders(<FeatureComponent {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText(/error/i)).toBeInTheDocument();
    });
  });
});
```

## Hook Testing Pattern

```typescript
// __tests__/useFeature.test.ts
import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useFeature } from '../useFeature';
import { createTestWrapper } from '../../../test/utils/testUtils';

describe('useFeature', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns initial state', () => {
    const { result } = renderHook(() => useFeature({ id: 'test' }), {
      wrapper: createTestWrapper(),
    });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('fetches data on mount', async () => {
    const { result } = renderHook(() => useFeature({ id: 'test' }), {
      wrapper: createTestWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toBeDefined();
  });

  it('handles action correctly', async () => {
    const onSuccess = vi.fn();
    const { result } = renderHook(
      () => useFeature({ id: 'test', onSuccess }),
      { wrapper: createTestWrapper() }
    );

    await act(async () => {
      await result.current.handleAction();
    });

    expect(onSuccess).toHaveBeenCalled();
  });
});
```

## Test Utilities Setup

```typescript
// test/utils/testUtils.tsx
import React, { ReactElement, ReactNode } from 'react';
import { render, RenderOptions } from '@testing-library/react';
import { Provider } from 'react-redux';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider, createTheme } from '@mui/material';
import { configureStore } from '@reduxjs/toolkit';
import userReducer from '../../redux/slices/user';

// Create test store
const createTestStore = (preloadedState = {}) => {
  return configureStore({
    reducer: {
      user: userReducer,
    },
    preloadedState,
  });
};

// Create test query client
const createTestQueryClient = () => {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        cacheTime: 0,
      },
      mutations: {
        retry: false,
      },
    },
  });
};

// Providers wrapper
interface WrapperProps {
  children: ReactNode;
}

const AllTheProviders = ({ children }: WrapperProps) => {
  const store = createTestStore();
  const queryClient = createTestQueryClient();
  const theme = createTheme();

  return (
    <Provider store={store}>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider theme={theme}>
          {children}
        </ThemeProvider>
      </QueryClientProvider>
    </Provider>
  );
};

// Custom render with providers
const customRender = (
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>
) => render(ui, { wrapper: AllTheProviders, ...options });

// Create wrapper for renderHook
export const createTestWrapper = () => {
  return ({ children }: WrapperProps) => (
    <AllTheProviders>{children}</AllTheProviders>
  );
};

export * from '@testing-library/react';
export { customRender as render, renderWithProviders: customRender };
```

## tRPC Mocking Pattern

```typescript
// test/mocks/trpcMocks.ts
import { vi } from 'vitest';

// Mock tRPC hooks
export const mockTrpcQuery = (data: any, options = {}) => {
  return {
    data,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
    ...options,
  };
};

export const mockTrpcMutation = (options = {}) => {
  return {
    mutate: vi.fn(),
    mutateAsync: vi.fn().mockResolvedValue({}),
    isPending: false,
    isError: false,
    error: null,
    ...options,
  };
};

// Mock trpc provider
vi.mock('../../../trpc/trpcProvider', () => ({
  trpc: {
    feature: {
      getById: {
        useQuery: vi.fn(() => mockTrpcQuery({ id: '1', name: 'Test' })),
      },
      getAll: {
        useQuery: vi.fn(() => mockTrpcQuery([])),
      },
      create: {
        useMutation: vi.fn(() => mockTrpcMutation()),
      },
    },
    useUtils: vi.fn(() => ({
      feature: {
        getAll: { invalidate: vi.fn() },
        getById: { invalidate: vi.fn() },
      },
    })),
  },
}));
```

## Form Testing Pattern

```typescript
// __tests__/AddItemDialog.test.tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import AddItemDialog from '../AddItemDialog';
import { renderWithProviders } from '../../../test/utils/testUtils';

describe('AddItemDialog', () => {
  const defaultProps = {
    open: true,
    onClose: vi.fn(),
    onSuccess: vi.fn(),
  };

  it('validates required fields', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AddItemDialog {...defaultProps} />);

    const submitButton = screen.getByRole('button', { name: /submit/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText(/name is required/i)).toBeInTheDocument();
    });
  });

  it('submits form with valid data', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AddItemDialog {...defaultProps} />);

    // Fill form
    await user.type(screen.getByLabelText(/name/i), 'Test Item');
    await user.type(screen.getByLabelText(/description/i), 'Test Description');

    // Submit
    const submitButton = screen.getByRole('button', { name: /submit/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(defaultProps.onSuccess).toHaveBeenCalled();
    });
  });

  it('closes dialog on cancel', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AddItemDialog {...defaultProps} />);

    const cancelButton = screen.getByRole('button', { name: /cancel/i });
    await user.click(cancelButton);

    expect(defaultProps.onClose).toHaveBeenCalled();
  });
});
```

## Test Naming Conventions

```typescript
// Use descriptive test names
describe('ComponentName', () => {
  // Group by feature/behavior
  describe('rendering', () => {
    it('renders loading state when data is fetching', () => {});
    it('renders error message when request fails', () => {});
    it('renders data when request succeeds', () => {});
  });

  describe('user interactions', () => {
    it('calls onSubmit when form is submitted', () => {});
    it('shows validation error for invalid input', () => {});
    it('disables submit button while loading', () => {});
  });

  describe('accessibility', () => {
    it('has proper ARIA labels', () => {});
    it('is keyboard navigable', () => {});
  });
});
```

## DO / DON'T

### DO

```typescript
// Use screen queries
const button = screen.getByRole('button', { name: /submit/i });

// Use userEvent for interactions
const user = userEvent.setup();
await user.click(button);

// Use waitFor for async assertions
await waitFor(() => {
  expect(screen.getByText('Success')).toBeInTheDocument();
});

// Test behavior, not implementation
expect(screen.getByText('Item saved')).toBeInTheDocument();

// Clean up mocks
beforeEach(() => vi.clearAllMocks());
```

### DON'T

```typescript
// DON'T use fireEvent (prefer userEvent)
fireEvent.click(button);

// DON'T test implementation details
expect(component.state.isLoading).toBe(true);

// DON'T use getBy for elements that might not exist
const error = screen.getByText('Error');  // Use queryByText instead

// DON'T forget to wait for async operations
expect(mockFn).toHaveBeenCalled();  // Wrap in waitFor
```

## Capability Details

### component-testing
**Keywords:** component test, RTL, render, screen
**Solves:**
- How to test React components?
- Component testing patterns

### hook-testing
**Keywords:** hook test, renderHook, act
**Solves:**
- How to test custom hooks?
- Hook testing patterns

### trpc-mocking
**Keywords:** trpc mock, api mock, msw
**Solves:**
- How to mock tRPC calls in tests?
- API mocking strategies
