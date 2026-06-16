---
name: admin-errors
description: Frontend error handling patterns for Admin app. Covers React Error Boundaries, tRPC error callbacks, Snackbar notifications, form validation errors, retry logic, and logging standards. Use when handling errors in React components or hooks.
context: fork
version: 1.0.0
tags: [errors, error-handling, error-boundary, snackbar, retry, frontend, logging]
author: Admin Team
user-invocable: false
---

# Admin Frontend Error Handling

Error handling patterns for the Admin Nx monorepo frontend.

> **Note:** Backend error handling (TRPCError classes, ThrowError, error mapping) is covered by `/admin-api-design`. This skill covers **frontend only**.

## When to Use

- Adding error handling to React components
- Handling tRPC query/mutation errors
- Showing error notifications to users
- Displaying form validation errors
- Implementing retry logic for failed requests
- Setting up Error Boundaries

---

## React Error Boundary

```typescript
// components/ErrorBoundary/ErrorBoundary.tsx
import { Component, ErrorInfo, ReactNode } from 'react';
import { Box, Typography, Button } from '@mui/material';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <Box sx={{ p: 3, textAlign: 'center' }}>
          <Typography variant="h6" color="error" gutterBottom>
            Something went wrong
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {this.state.error?.message}
          </Typography>
          <Button variant="outlined" onClick={this.handleReset}>
            Try Again
          </Button>
        </Box>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
```

**Usage:**
```typescript
<ErrorBoundary>
  <FeatureComponent />
</ErrorBoundary>

// With custom fallback
<ErrorBoundary fallback={<CustomErrorView />}>
  <FeatureComponent />
</ErrorBoundary>
```

---

## tRPC Error Handling

### Query Errors

```typescript
const { data, isLoading, error } = trpc.feature.getAll.useQuery(
  { page: 1, limit: 20 },
  {
    onError: (err) => {
      enqueueSnackbar(getErrorMessage(err), { variant: 'error' });
    },
    retry: (failureCount, error) => {
      // Don't retry on 4xx errors
      if (error.data?.httpStatus && error.data.httpStatus < 500) {
        return false;
      }
      return failureCount < 3;
    },
  }
);

// In component render
if (error) {
  return <ErrorState message={getErrorMessage(error)} onRetry={refetch} />;
}
```

### Mutation Errors

```typescript
const mutation = trpc.feature.create.useMutation({
  onSuccess: (data) => {
    enqueueSnackbar('Created successfully', { variant: 'success' });
    onSuccess?.(data);
  },
  onError: (err) => {
    enqueueSnackbar(getErrorMessage(err), { variant: 'error' });
  },
});

// Usage with error state
const handleSubmit = async (data: FormData) => {
  try {
    await mutation.mutateAsync(data);
  } catch {
    // Error already handled by onError callback
  }
};
```

### Error Message Extractor

```typescript
// utils/errorUtils.ts
import { TRPCClientError } from '@trpc/client';

export const getErrorMessage = (error: unknown): string => {
  if (error instanceof TRPCClientError) {
    return error.message || 'An error occurred';
  }
  if (error instanceof Error) {
    return error.message;
  }
  return 'An unexpected error occurred';
};

export const isNotFoundError = (error: unknown): boolean => {
  return error instanceof TRPCClientError && error.data?.code === 'NOT_FOUND';
};

export const isUnauthorizedError = (error: unknown): boolean => {
  return error instanceof TRPCClientError && error.data?.code === 'UNAUTHORIZED';
};
```

---

## Snackbar Notifications

```typescript
// Using notistack (already in Admin project)
import { useSnackbar } from 'notistack';

const FeatureComponent = ({ onSuccess }: Props) => {
  const { enqueueSnackbar } = useSnackbar();

  const handleAction = async () => {
    try {
      await mutation.mutateAsync(data);
      enqueueSnackbar('Action completed successfully', { variant: 'success' });
    } catch (err) {
      enqueueSnackbar(getErrorMessage(err), { variant: 'error' });
    }
  };
};
```

**Snackbar variants:**
| Variant | When to Use |
|---------|-------------|
| `success` | Action completed successfully |
| `error` | Action failed, user needs to know |
| `warning` | Action succeeded with caveats |
| `info` | Non-critical information |

**Rules:**
- Always show success feedback for user-initiated actions
- Always show error feedback for failed mutations
- Don't show snackbar for background query failures (use inline error state instead)
- Keep messages short and actionable

---

## Error States in Components

```typescript
// Reusable error state component
interface ErrorStateProps {
  message?: string;
  onRetry?: () => void;
}

const ErrorState = ({ message = 'Failed to load data', onRetry }: ErrorStateProps) => {
  return (
    <Box sx={{ p: 3, textAlign: 'center' }}>
      <Typography color="error" gutterBottom>
        {message}
      </Typography>
      {onRetry && (
        <Button variant="outlined" size="small" onClick={onRetry}>
          Retry
        </Button>
      )}
    </Box>
  );
};
```

**Component error handling pattern:**
```typescript
const FeatureList = () => {
  const { data, isLoading, error, refetch } = trpc.feature.getAll.useQuery();

  if (isLoading) return <CircularProgress />;
  if (error) return <ErrorState message={getErrorMessage(error)} onRetry={refetch} />;
  if (!data?.length) return <EmptyState message="No items found" />;

  return <DataTable rows={data} />;
};
```

---

## Form Validation Errors

```typescript
// With react-hook-form + Zod (see /admin-forms for full patterns)
const { control, handleSubmit, formState: { errors } } = useForm<FormData>({
  resolver: zodResolver(schema),
});

// Display field errors
<Controller
  name="name"
  control={control}
  render={({ field }) => (
    <TextField
      {...field}
      error={!!errors.name}
      helperText={errors.name?.message}
    />
  )}
/>

// Display server-side errors
const [serverError, setServerError] = useState<string | null>(null);

const onSubmit = async (data: FormData) => {
  setServerError(null);
  try {
    await mutation.mutateAsync(data);
  } catch (err) {
    setServerError(getErrorMessage(err));
  }
};

{serverError && (
  <Alert severity="error" sx={{ mb: 2 }}>
    {serverError}
  </Alert>
)}
```

---

## Retry Logic

```typescript
// Hook for retry with exponential backoff
import { useState, useCallback } from 'react';

const useRetry = (action: () => Promise<void>, maxRetries = 3) => {
  const [retryCount, setRetryCount] = useState(0);
  const [isRetrying, setIsRetrying] = useState(false);

  const retry = useCallback(async () => {
    if (retryCount >= maxRetries) return;

    setIsRetrying(true);
    const delay = Math.min(1000 * Math.pow(2, retryCount), 10000);

    await new Promise((resolve) => setTimeout(resolve, delay));

    try {
      await action();
      setRetryCount(0);
    } catch {
      setRetryCount((prev) => prev + 1);
    } finally {
      setIsRetrying(false);
    }
  }, [action, retryCount, maxRetries]);

  return { retry, retryCount, isRetrying, canRetry: retryCount < maxRetries };
};
```

**tRPC query retry config:**
```typescript
// Global retry config in trpc client setup
const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: '/api/trpc',
    }),
  ],
});

// Per-query retry
trpc.feature.getAll.useQuery(input, {
  retry: 3,                    // Retry 3 times
  retryDelay: (attempt) =>     // Exponential backoff
    Math.min(1000 * 2 ** attempt, 30000),
});
```

---

## Logging Standards

| Level | When to Use | Example |
|-------|-------------|---------|
| `console.error` | Unrecoverable errors, caught exceptions | `console.error('Failed to save:', error)` |
| `console.warn` | Recoverable issues, deprecations | `console.warn('Feature X is deprecated')` |
| `console.info` | Important business events | `console.info('User logged in')` |
| `console.debug` | Development details | `console.debug('Cache hit:', key)` |

**Rules:**
- Never log sensitive data (tokens, passwords, PII)
- Always include context (what was being done when error occurred)
- Use structured data: `console.error('Action failed', { userId, action, error })`
- Remove `console.log` before committing (use proper level instead)

---

## DO / DON'T

### DO

```typescript
// Show user-friendly error messages
enqueueSnackbar('Failed to save changes', { variant: 'error' });

// Handle loading/error/empty states
if (isLoading) return <CircularProgress />;
if (error) return <ErrorState onRetry={refetch} />;

// Use Error Boundaries for unexpected crashes
<ErrorBoundary><App /></ErrorBoundary>

// Extract error messages safely
const message = getErrorMessage(error);
```

### DON'T

```typescript
// DON'T show raw error messages to users
enqueueSnackbar(error.stack, { variant: 'error' });

// DON'T silently swallow errors
try { await action(); } catch {}

// DON'T forget error states in components
return <DataTable rows={data} />;  // What if data is undefined?

// DON'T retry on client errors (4xx)
retry: 3  // Without checking error type
```
