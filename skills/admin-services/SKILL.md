---
name: admin-services
description: Controller/service layer patterns, HTTP utilities, and token management. Use when creating controllers, services, or API utilities.
---

# Admin Backend Services Skill

Controller/service layer patterns, HTTP utilities, and token management for Admin Nx monorepo.

## Controller Pattern

Controllers act as the service layer, encapsulating all business logic. Use functional object pattern (not classes):

```typescript
// draftController.ts
import { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import { axiosRequest } from "../../utils/axiosRequestGeneric";
import { extractToken } from "../../utils/extractToken";
import { envConfig } from "../../utils/envConfig";
import { logger } from "../../utils/logger";
import { BadRequestError, ThrowError } from "../Errors/TrpcErrors";
import { Draft } from "../../models/interfaces/draftResponseSchema";

export const draftController = {
  generateSignedS3UploadUrl: async (
    filename: string,
    contentType: string
  ): Promise<string> => {
    try {
      const response = await axiosRequest<{ url: string }>(
        "POST",
        `${envConfig.draftServerBaseUrl}/api/upload/signed-url`,
        {
          data: { filename, contentType },
          errorMsg: "Failed to generate signed URL",
        }
      );
      return response.url;
    } catch (error) {
      logger.error("Failed to generate signed S3 upload URL");
      ThrowError(error);
    }
  },

  getDraftById: async (
    req: CreateExpressContextOptions["req"],
    res: CreateExpressContextOptions["res"],
    id: string
  ): Promise<Draft> => {
    try {
      if (!id) {
        throw new BadRequestError("Missing Resource Id.");
      }
      const token = extractToken(req, res);
      return await axiosRequest<Draft>(
        "GET",
        `${envConfig.draftServerBaseUrl}/api/applications/drafts/id?id=${id}`,
        {
          headers: { Authorization: `Bearer ${token}` },
          errorMsg: "Failed to fetch draft by ID.",
        }
      );
    } catch (error) {
      logger.error("Failed to fetch draft by ID.");
      ThrowError(error);
    }
  },

  publishMessageToParserQueue: async (
    signedUrl: string,
    user: string,
    draftId: string
  ) => {
    try {
      // Queue publishing logic
      await publishToQueue({
        queueName: QueueNames.PARSER,
        timestamp: new Date(),
        uploadedBy: user,
        appDraftId: draftId,
        appUrl: signedUrl,
      });
      return { success: true };
    } catch (error) {
      logger.error("Failed to publish message to parser queue");
      ThrowError(error);
    }
  },
};
```

## Generic HTTP Request Utility

Type-safe axios wrapper with built-in error handling:

```typescript
// axiosRequestGeneric.ts
import axios, { AxiosRequestConfig, Method } from "axios";
import { ThrowError, extractErrorMessage } from "../trpc/Errors/TrpcErrors";
import { logger } from "./logger";

interface RequestOptions<T> {
  data?: any;
  params?: any;
  headers?: Record<string, string>;
  errorMsg?: string;
  responseTransform?: (data: any) => T;
  axiosConfig?: AxiosRequestConfig;
}

export async function axiosRequest<T>(
  method: Method,
  url: string,
  options: RequestOptions<T> = {}
): Promise<T> {
  const {
    data,
    params,
    headers = {},
    errorMsg = "Request failed",
    responseTransform,
    axiosConfig = {},
  } = options;

  try {
    const response = await axios({
      method,
      url,
      data,
      params,
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
      ...axiosConfig,
    });

    const result = response.data;
    return responseTransform ? responseTransform(result) : result;
  } catch (error: any) {
    logger.error(`${errorMsg}: ${extractErrorMessage(error)}`);
    ThrowError(error);
  }
}
```

### Usage Examples

```typescript
// Simple GET request
const apps = await axiosRequest<AppView[]>(
  "GET",
  `${envConfig.storeBaseUrl}/api/apps`
);

// GET with query params
const drafts = await axiosRequest<Draft[]>(
  "GET",
  `${envConfig.draftServerBaseUrl}/api/drafts`,
  {
    params: { page: 1, limit: 10, status: "pending" },
    headers: { Authorization: `Bearer ${token}` },
  }
);

// POST with body
const result = await axiosRequest<CreateResponse>(
  "POST",
  `${envConfig.vpnBaseUrl}/api/vpn/create`,
  {
    data: { name: "my-vpn", region: "us-east" },
    headers: { Authorization: `Bearer ${token}` },
    errorMsg: "Failed to create VPN",
  }
);

// With response transformation
const names = await axiosRequest<string[]>(
  "GET",
  `${envConfig.storeBaseUrl}/api/apps`,
  {
    responseTransform: (data) => data.map((app: AppView) => app.name),
  }
);
```

## Token Extraction

Centralized token extraction with validation:

```typescript
// extractToken.ts
import { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import { UnauthorizedError } from "../trpc/Errors/TrpcErrors";

export const extractToken = (
  req: CreateExpressContextOptions["req"],
  res: CreateExpressContextOptions["res"]
): string => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    throw new UnauthorizedError("Missing or invalid Authorization header.");
  }

  const token = authHeader.split(" ")[1];

  if (!token) {
    throw new UnauthorizedError("Token is Required.");
  }

  return token;
};
```

### Usage in Controllers

```typescript
export const storeController = {
  getAllApps: async (req, res, page?: number, limit?: number) => {
    try {
      const token = extractToken(req, res);

      return await axiosRequest<AppView[]>(
        "GET",
        `${envConfig.storeBaseUrl}/api/apps`,
        {
          params: { page, limit },
          headers: { Authorization: `Bearer ${token}` },
          errorMsg: "Failed to fetch applications",
        }
      );
    } catch (error) {
      logger.error("Failed to fetch applications");
      ThrowError(error);
    }
  },
};
```

## Environment Configuration

Centralized configuration with defaults:

```typescript
// envConfig.ts
export const envConfig = {
  // External service URLs
  storeBaseUrl: process.env["STORE_SERVICE_URL"],
  vpnAdminServiceBaseUrl: process.env["VPN_ADMIN_SERVICE_URL"],
  draftServerBaseUrl: process.env["DRAFT_SERVER_BASE_URL"],
  graphAccessBaseUrl: process.env["GRAPH_ACCESS_SERVICE_URL"],

  // Authentication
  token: process.env["DS_TOKEN"],
  webhookSecret: process.env["WEBHOOK_SECRET"],

  // Redis configuration
  redisHost: process.env["REDIS_HOST"] || "localhost",
  redisPort: parseInt(process.env["REDIS_PORT"] || "6379"),
  redisCacheTtl: parseInt(process.env["REDIS_CACHE_TTL"] || "3600"),

  // RabbitMQ configuration
  rabbitMqUrl: process.env["RABBITMQ_URL"] || "amqp://localhost",

  // Server configuration
  port: parseInt(process.env["PORT"] || "3000"),
  nodeEnv: process.env["NODE_ENV"] || "development",
};
```

## Logging Strategy

Winston-based logging with timestamps and stack traces:

```typescript
// logger.ts
import { createLogger, format, transports } from "winston";

const { combine, timestamp, printf, colorize, errors } = format;

const logFormat = printf(({ level, message, timestamp, stack }) => {
  return `[${timestamp}] ${level}: ${stack || message}`;
});

export const logger = createLogger({
  level: process.env["LOG_LEVEL"] || "info",
  format: combine(
    colorize(),
    timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    errors({ stack: true }),
    logFormat
  ),
  transports: [new transports.Console()],
});
```

### Logging Best Practices

```typescript
// Log at method entry for important operations
logger.info(`Fetching apps for user: ${userId}`);

// Log errors before throwing
logger.error(`Failed to fetch draft by ID: ${id}`);
ThrowError(error);

// Log with context
logger.warn(`Cache miss for key: ${cacheKey}`);

// Log external service calls
logger.debug(`Calling external API: ${url}`);
```

## Service Organization

### File Structure

```
apps/admin_backend/
  src/
    trpc/
      controllers/
        authorizationController.ts
        draftController.ts
        storeController.ts
        vpnController.ts
        graphAccessController.ts
      routes/
        appRouter.ts
        httpAppRouter.ts
        wsAppRouter.ts
        authorizationRouter.ts
        draftRouter.ts
        storeRouter.ts
        vpnRouter.ts
      Errors/
        TrpcErrors.ts
      context.ts
      trpc.ts
    utils/
      axiosRequestGeneric.ts
      envConfig.ts
      extractToken.ts
      logger.ts
      utilsEditAppUtils.ts
      utilsPublishApp.ts
    models/
      interfaces/
        appSchema.ts
        draftResponseSchema.ts
        publishAppSchema.ts
```

## Domain-Specific Utilities

Create utility files for complex domain logic:

```typescript
// utilsPublishApp.ts
import { PublishAppPayload } from "../models/interfaces/publishAppSchema";
import { AppView } from "../models/interfaces/appSchema";

export const buildPublishPayload = (
  formData: PublishAppPayload,
  existingApp?: AppView
): Record<string, any> => {
  const payload: Record<string, any> = {
    applicationId: formData.applicationId,
    version: formData.version,
    privacyRating: formData.privacyRating,
    // ... transform form data to API payload
  };

  if (existingApp) {
    // Merge with existing app data
    payload.previousVersion = existingApp.version;
  }

  return payload;
};

export const validatePublishRequirements = (
  app: AppView,
  requirements: string[]
): { valid: boolean; missing: string[] } => {
  const missing = requirements.filter((req) => !app[req]);
  return {
    valid: missing.length === 0,
    missing,
  };
};
```

## Best Practices

1. **Controllers are service objects** - Export as singleton objects, not classes
2. **Always use try-catch** - Wrap all async operations
3. **Log before throwing** - Log the error context before calling ThrowError
4. **Validate at entry** - Check required parameters at method start
5. **Use generic HTTP utility** - Don't use axios directly in controllers
6. **Extract tokens centrally** - Use extractToken utility, not manual parsing
7. **Keep configuration centralized** - All env vars in envConfig
8. **Create domain utilities** - For complex business logic transformations
