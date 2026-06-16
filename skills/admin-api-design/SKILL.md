---
name: admin-api-design
description: tRPC API design patterns for Admin backend. Covers router structure, Zod validation, error handling with custom TRPCError classes, and controller patterns. Use when creating API endpoints or handling errors.
context: fork
version: 1.0.0
tags: [api, trpc, zod, express, backend, validation, error-handling]
author: Admin Team
user-invocable: false
---

# Admin API Design

tRPC API patterns for the Admin Nx monorepo backend.

## When to Use

- Creating new tRPC routers/procedures
- Defining Zod input/output schemas
- Implementing controller logic
- Handling errors properly
- Making external HTTP calls

## CRITICAL — `@admin-types` is COMPILE-TIME ONLY in the backend
`@admin-types` is a tsconfig path alias pointing at the TypeScript SOURCE (`libs/admin-types/src`); it resolves only at compile time. In backend code **import TYPES only — never a runtime VALUE**:
- ✅ `import { App, Region } from "@admin-types";` used as type annotations → tsc elides it, no runtime `require`.
- ❌ `import { SomeEnum } from "@admin-types"; ... z.nativeEnum(SomeEnum)` → emits `require("@admin-types")` → **CrashLoopBackOff: `Cannot find module '@admin-types'`** at runtime.
- Need a runtime enum in a Zod schema? Use `z.string()` (forward to the upstream service) or `z.enum([...local string literals...])`. Do NOT pull the enum object from `@admin-types`.
- (Frontend is fine — Vite bundles `@admin-types`. This rule is backend-only.)

## Technology Stack

- **tRPC 10.45.2** for type-safe APIs
- **Zod** for runtime validation
- **Express.js** as HTTP server
- **Winston** for logging
- **Axios** for external HTTP calls

## API Architecture

```
Request → tRPC Router → Controller → External Service
                ↓              ↓
         Zod Validation    Error Handling
                ↓              ↓
         Response ← TRPCError Classes
```

## tRPC Router Pattern

```typescript
// trpc/routes/featureRouter.ts
import { router, publicProcedure } from '../trpc';
import { z } from 'zod';
import { featureController } from '../controllers/featureController';
import { featureResponseSchema } from '../../models/interfaces/featureSchema';

const featureRouter = router({
  // GET - Query with input validation
  getById: publicProcedure
    .input(z.object({
      id: z.string().min(1, 'ID is required'),
    }))
    .output(featureResponseSchema)
    .query(async ({ input, ctx }) => {
      return await featureController.getById(ctx.req, ctx.res, input.id);
    }),

  // GET - List with pagination
  getAll: publicProcedure
    .input(z.object({
      page: z.number().min(1).default(1),
      limit: z.number().min(1).max(100).default(20),
      search: z.string().optional(),
    }))
    .output(z.array(featureResponseSchema))
    .query(async ({ input, ctx }) => {
      return await featureController.getAll(ctx.req, ctx.res, input);
    }),

  // POST - Create mutation
  create: publicProcedure
    .input(z.object({
      name: z.string().min(1, 'Name is required'),
      description: z.string().optional(),
    }))
    .output(featureResponseSchema)
    .mutation(async ({ input, ctx }) => {
      return await featureController.create(ctx.req, ctx.res, input);
    }),

  // PUT - Update mutation
  update: publicProcedure
    .input(z.object({
      id: z.string().min(1),
      name: z.string().min(1).optional(),
      description: z.string().optional(),
    }))
    .output(featureResponseSchema)
    .mutation(async ({ input, ctx }) => {
      return await featureController.update(ctx.req, ctx.res, input);
    }),

  // DELETE - Delete mutation
  delete: publicProcedure
    .input(z.object({
      id: z.string().min(1),
    }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ input, ctx }) => {
      return await featureController.delete(ctx.req, ctx.res, input.id);
    }),
});

export default featureRouter;
```

## Controller Pattern

```typescript
// trpc/controllers/featureController.ts
import { CreateExpressContextOptions } from '@trpc/server/adapters/express';
import { logger } from '../../utils/logger';
import { axiosRequest } from '../../utils/axiosRequestGeneric';
import { extractToken } from '../../utils/extractToken';
import { ThrowError, BadRequestError, NotFoundError } from '../Errors/TrpcErrors';
import { envConfig } from '../../utils/envConfig';

export const featureController = {
  getById: async (
    req: CreateExpressContextOptions['req'],
    res: CreateExpressContextOptions['res'],
    id: string
  ) => {
    try {
      if (!id) {
        throw new BadRequestError('ID is required');
      }

      const token = extractToken(req, res);
      logger.info(`Fetching feature by ID: ${id}`);

      const result = await axiosRequest(
        'GET',
        `${envConfig.apiBaseUrl}/features/${id}`,
        {
          headers: { Authorization: `Bearer ${token}` },
          errorMsg: 'Failed to fetch feature',
        }
      );

      if (!result) {
        throw new NotFoundError(`Feature with ID ${id} not found`);
      }

      return result;
    } catch (error) {
      logger.error('Failed to fetch feature', { id, error });
      ThrowError(error);
    }
  },

  create: async (
    req: CreateExpressContextOptions['req'],
    res: CreateExpressContextOptions['res'],
    data: { name: string; description?: string }
  ) => {
    try {
      const token = extractToken(req, res);
      logger.info('Creating new feature', { name: data.name });

      return await axiosRequest(
        'POST',
        `${envConfig.apiBaseUrl}/features`,
        {
          data,
          headers: { Authorization: `Bearer ${token}` },
          errorMsg: 'Failed to create feature',
        }
      );
    } catch (error) {
      logger.error('Failed to create feature', { data, error });
      ThrowError(error);
    }
  },
};
```

## Error Handling

### Custom Error Classes

```typescript
// trpc/Errors/TrpcErrors.ts
import { TRPCError } from '@trpc/server';

export class BadRequestError extends TRPCError {
  public httpStatus = 400;
  constructor(message = 'Bad Request') {
    super({ code: 'BAD_REQUEST', message });
  }
}

export class UnauthorizedError extends TRPCError {
  public httpStatus = 401;
  constructor(message = 'Unauthorized') {
    super({ code: 'UNAUTHORIZED', message });
  }
}

export class ForbiddenError extends TRPCError {
  public httpStatus = 403;
  constructor(message = 'Forbidden') {
    super({ code: 'FORBIDDEN', message });
  }
}

export class NotFoundError extends TRPCError {
  public httpStatus = 404;
  constructor(message = 'Not Found') {
    super({ code: 'NOT_FOUND', message });
  }
}

export class InternalServerError extends TRPCError {
  public httpStatus = 500;
  constructor(message = 'Internal Server Error') {
    super({ code: 'INTERNAL_SERVER_ERROR', message });
  }
}

export class ServiceUnavailableError extends TRPCError {
  public httpStatus = 503;
  constructor(message = 'Service Unavailable') {
    super({ code: 'INTERNAL_SERVER_ERROR', message });
  }
}
```

### Error Mapper Utility

```typescript
export function ThrowError(error: any): never {
  const status = error?.status ?? error?.httpStatus ?? 500;
  const message = extractErrorMessage(error);

  const errorMap: Record<number, (msg: string) => Error> = {
    400: (msg) => new BadRequestError(msg),
    401: (msg) => new UnauthorizedError(msg),
    403: (msg) => new ForbiddenError(msg),
    404: (msg) => new NotFoundError(msg),
    500: (msg) => new InternalServerError(msg),
    503: (msg) => new ServiceUnavailableError(msg),
  };

  const createError = errorMap[status];
  if (createError) {
    throw createError(message);
  }
  throw error;
}

export const extractErrorMessage = (error: any): string => {
  return (
    error.response?.data?.message ??
    error.message ??
    'Something went wrong'
  );
};
```

## Zod Schema Patterns

```typescript
// models/interfaces/featureSchema.ts
import { z } from 'zod';

// Response schema
export const featureResponseSchema = z.object({
  _id: z.string(),
  name: z.string(),
  description: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  status: z.enum(['active', 'inactive', 'pending']),
});

// Array of items
export const featuresResponseSchema = z.array(featureResponseSchema);

// Infer TypeScript type
export type Feature = z.infer<typeof featureResponseSchema>;

// Input schema with validation
export const createFeatureSchema = z.object({
  name: z.string()
    .min(1, 'Name is required')
    .max(100, 'Name must be less than 100 characters'),
  description: z.string()
    .max(500, 'Description must be less than 500 characters')
    .optional(),
});

// Partial schema for updates
export const updateFeatureSchema = createFeatureSchema.partial().extend({
  id: z.string().min(1),
});
```

## HTTP Client Utility

```typescript
// utils/axiosRequestGeneric.ts
import axios, { Method, AxiosRequestConfig } from 'axios';
import { logger } from './logger';

interface RequestOptions<T> {
  data?: any;
  params?: any;
  headers?: Record<string, string>;
  errorMsg?: string;
  responseTransform?: (data: any) => T;
}

export async function axiosRequest<T>(
  method: Method,
  url: string,
  options: RequestOptions<T> = {}
): Promise<T> {
  try {
    const config: AxiosRequestConfig = {
      method,
      url,
      data: options.data,
      params: options.params,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    };

    logger.debug(`HTTP ${method} ${url}`);
    const response = await axios(config);

    return options.responseTransform
      ? options.responseTransform(response.data)
      : response.data;
  } catch (error: any) {
    const statusCode = error.response?.status || 'Unknown';
    logger.error(`HTTP Error ${statusCode}`, { url, method });
    throw error;
  }
}
```

## DO / DON'T

### DO

```typescript
// Always validate inputs with Zod
.input(z.object({ id: z.string().min(1) }))

// Always use output schemas
.output(featureResponseSchema)

// Always use custom TRPCError classes
throw new NotFoundError('Resource not found');

// Always log operations
logger.info('Creating feature', { name });

// Always use ThrowError for error mapping
ThrowError(error);
```

### DON'T

```typescript
// DON'T skip input validation
.query(async ({ input }) => controller.get(input.id))

// DON'T use generic Error
throw new Error('Not found');

// DON'T use console.log
console.log('debug');

// DON'T log sensitive data
logger.info('User', { password });

// DON'T skip error handling
const data = await axios.get(url);
return data;
```

## Related References

- [rest.md](references/rest.md) - REST conventions
- [errors.md](references/errors.md) - Error handling patterns

## Capability Details

### trpc-router
**Keywords:** trpc, router, procedure, query, mutation
**Solves:**
- How to create tRPC endpoints?
- Router structure patterns

### zod-validation
**Keywords:** zod, schema, validation, input, output
**Solves:**
- How to validate API inputs?
- Zod schema patterns

### error-handling
**Keywords:** error, TRPCError, ThrowError, exception
**Solves:**
- How to handle API errors?
- Custom error classes
