---
name: admin-routing
description: tRPC router architecture and procedure patterns for Admin backend. Use when creating API endpoints, routers, or procedures.
---

# Admin Backend Routing Skill

tRPC router architecture and procedure patterns for Admin Nx monorepo backend.

## Router Architecture

### Main Router Composition

The application uses tRPC with Express adapter. Routers are composed hierarchically:

```typescript
// appRouter.ts - Main router combining HTTP and WebSocket
import { router } from "./trpc";
import { httpAppRouter } from "./routes/httpAppRouter";
import { wsAppRouter } from "./routes/wsAppRouter";

export const appRouter = router({
  ...httpAppRouter._def.record,
  ...wsAppRouter._def.record,
});

export type AppRouter = typeof appRouter;
```

### HTTP Router Organization

Organize routers by domain/feature namespace:

```typescript
// httpAppRouter.ts
import { router } from "../trpc";
import { authorizationRouter } from "./authorizationRouter";
import { vpnRouter } from "./vpnRouter";
import { storeRoute } from "./storeRouter";
import { draftRouter } from "./draftRouter";
import { graphAccessRouter } from "./graphAccessRouter";

export const httpAppRouter = router({
  authorization: authorizationRouter,
  vpn: vpnRouter,
  store: storeRoute,
  draft: draftRouter,
  graphAccess: graphAccessRouter,
});
```

### WebSocket Router Pattern

Use observables for real-time subscriptions:

```typescript
// wsAppRouter.ts
import { observable } from "@trpc/server/observable";
import { wsRouter, wsProcedure } from "../wsRouter";
import { wsSubscribers } from "../../utils/wsSubscribers";

export const wsAppRouter = wsRouter({
  ping: wsProcedure.subscription(() =>
    observable<{ time: string }>((emit) => {
      const interval = setInterval(() => {
        emit.next({ time: new Date().toISOString() });
      }, 1000);
      return () => clearInterval(interval);
    })
  ),

  notifications: wsProcedure.subscription(() =>
    observable<string>((emit) => {
      const unsub = wsSubscribers.subscribe(async (data: any) => {
        emit.next(data);
      });
      return () => unsub();
    })
  ),
});
```

## Procedure Patterns

### Query Procedure (Read Operations)

```typescript
// authorizationRouter.ts
import { z } from "zod";
import { publicProcedure, router } from "../trpc";
import { authorizationController } from "../controllers/authorizationController";
import { actionsResponseSchema } from "../../models/interfaces/actionsResponseSchema";

export const authorizationRouter = router({
  userActions: publicProcedure
    .meta({
      openapi: {
        method: "GET",
        path: "/authorization.userActions",
        tags: ["Authorization"],
      },
    })
    .input(z.void())
    .output(actionsResponseSchema)
    .query(async ({ ctx }) => {
      return await authorizationController.getUserActions(ctx.req, ctx.res);
    }),
});
```

### Mutation Procedure (Write Operations)

```typescript
// draftRouter.ts
import { z } from "zod";
import { publicProcedure, router } from "../trpc";
import { draftController } from "../controllers/draftController";

export const draftRouter = router({
  generateSignedS3UploadUrl: publicProcedure
    .input(
      z.object({
        filename: z.string(),
        contentType: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      return await draftController.generateSignedS3UploadUrl(
        input.filename,
        input.contentType
      );
    }),

  publishMessageToParserQueue: publicProcedure
    .input(
      z.object({
        signedUrl: z.string(),
        user: z.string(),
        draftId: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      return await draftController.publishMessageToParserQueue(
        input.signedUrl,
        input.user,
        input.draftId
      );
    }),
});
```

### Procedure with Context Access

```typescript
// storeRouter.ts
export const storeRoute = router({
  getAllApps: publicProcedure
    .input(
      z.object({
        page: z.number().optional(),
        limit: z.number().optional(),
        search: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      // Access request/response from context
      return await storeController.getAllApps(
        ctx.req,
        ctx.res,
        input.page,
        input.limit,
        input.search
      );
    }),
});
```

## Naming Conventions

### Router Files
- `{domain}Router.ts` - e.g., `authorizationRouter.ts`, `vpnRouter.ts`
- Controllers: `{domain}Controller.ts`
- Schemas: `{domain}Schema.ts` or descriptive name like `publishAppSchema.ts`

### Procedure Names
- Use camelCase
- Queries: verb + noun - `getUserActions`, `getAllApps`, `getDraftById`
- Mutations: action verb + noun - `publishApp`, `createVpn`, `updateDraft`

### Router Namespace
- Use singular nouns: `authorization`, `vpn`, `store`, `draft`
- Avoid prefixes like `api` or `v1` in router names

## OpenAPI Integration

Add OpenAPI metadata for documentation:

```typescript
publicProcedure
  .meta({
    openapi: {
      method: "GET",
      path: "/store.getAllApps",
      tags: ["Store"],
      summary: "Get all applications",
      description: "Retrieves paginated list of all applications",
    },
  })
  .input(inputSchema)
  .output(outputSchema)
  .query(handler);
```

## Context Setup

```typescript
// context.ts
import { inferAsyncReturnType } from "@trpc/server";
import { CreateExpressContextOptions } from "@trpc/server/adapters/express";

export const createContext = ({ req, res }: CreateExpressContextOptions) => {
  const token = req.headers.authorization?.split(" ")[1] ?? null;
  return { req, res, token };
};

export type Context = inferAsyncReturnType<typeof createContext>;
```

## Router Registration in Express

```typescript
// app.ts
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "./trpc/routes/appRouter";
import { createContext } from "./trpc/context";

app.use(
  "/api",
  createExpressMiddleware({
    router: appRouter,
    createContext,
    onError({ error }) {
      const status = error.httpStatus ?? getStatusCode(error.code) ?? 500;
      logger.error(`${status}. ${extractErrorMessage(error)}`);
    },
  })
);
```

## Best Practices

1. **Keep routers thin** - Delegate logic to controllers
2. **Always define input/output schemas** - For type safety and OpenAPI docs
3. **Use meaningful procedure names** - Describe the action clearly
4. **Group related procedures** - In domain-specific routers
5. **Handle errors in controllers** - Not in router procedures
6. **Use context for request data** - Don't pass req/res directly when possible
