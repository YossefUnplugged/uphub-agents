---
name: admin-caching
description: Redis caching patterns with compression, prefetching, and invalidation. Use when implementing caching or Redis operations.
---

# Admin Backend Caching Skill

Redis caching patterns with compression, smart prefetching, and cache invalidation for Admin Nx monorepo.

## Cache Key Management

### Enums for Type-Safe Keys

```typescript
// redisKeys.ts
export enum RedisCacheOperations {
  ADMIN_APPS = "adminApps",
  APPLICATIONS = "applications",
  APPLICATION_VERSION_DETAILS = "applicationVersionDetails",
  GET_VPN_LOCATIONS = "getVpnLocations",
  USER_PERMISSIONS = "userPermissions",
  DRAFT_LIST = "draftList",
}

export enum RedisCachePrefixes {
  DEFAULT = "admin_cache",
  STORE = "store",
  VPN = "vpn",
  AUTH = "auth",
  DRAFT = "draft",
}

export enum RedisCacheTTL {
  SHORT = 300,           // 5 minutes
  MEDIUM = 1800,         // 30 minutes
  LONG = 3600,           // 1 hour
  STORE_ADMIN_APPS = 900, // 15 minutes
  VPN_LOCATIONS = 7200,   // 2 hours
  USER_PERMISSIONS = 600, // 10 minutes
}
```

### Key Generation

```typescript
// redisKeys.ts
export const generateRedisKey = (
  operation: RedisCacheOperations,
  prefix?: RedisCachePrefixes,
  params?: Record<string, any>
): string => {
  const keyPrefix = prefix || RedisCachePrefixes.DEFAULT;
  const paramString = params
    ? `:${Object.entries(params)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => `${k}=${v}`)
        .join("&")}`
    : "";
  return `${keyPrefix}:${operation}${paramString}`;
};

// Examples:
// generateRedisKey(RedisCacheOperations.ADMIN_APPS, RedisCachePrefixes.STORE, { page: 1, limit: 10 })
// => "store:adminApps:limit=10&page=1"
```

## Cache Service

### Smart Cache with Compression

```typescript
// cacheService.ts
import Redis from "ioredis";
import { gzip, gunzip } from "zlib";
import { promisify } from "util";
import { logger } from "../utils/logger";
import {
  RedisCacheOperations,
  RedisCachePrefixes,
  RedisCacheTTL,
  generateRedisKey,
} from "./redisKeys";

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

const COMPRESSION_THRESHOLD = 1024; // Compress if > 1KB

interface CacheOptions {
  ttl?: number;
  prefix?: RedisCachePrefixes;
  backgroundRefresh?: boolean;
  compress?: boolean;
}

class RedisCacheService {
  private redis: Redis;
  private memoryCache: Map<string, { data: any; expiry: number }>;

  constructor() {
    this.redis = new Redis({
      host: process.env["REDIS_HOST"] || "localhost",
      port: parseInt(process.env["REDIS_PORT"] || "6379"),
      retryStrategy: (times) => Math.min(times * 50, 2000),
    });
    this.memoryCache = new Map();
  }

  async withSmartCache<T>(
    operation: RedisCacheOperations,
    fetchFn: () => Promise<T>,
    params?: Record<string, any>,
    options: CacheOptions = {}
  ): Promise<T> {
    const {
      ttl = RedisCacheTTL.MEDIUM,
      prefix = RedisCachePrefixes.DEFAULT,
      backgroundRefresh = false,
      compress = true,
    } = options;

    const cacheKey = generateRedisKey(operation, prefix, params);

    try {
      // Check memory cache first (for hot data)
      const memCached = this.getFromMemory<T>(cacheKey);
      if (memCached !== null) {
        logger.debug(`Memory cache hit: ${cacheKey}`);
        return memCached;
      }

      // Check Redis cache
      const cached = await this.get<T>(cacheKey, compress);
      if (cached !== null) {
        logger.debug(`Redis cache hit: ${cacheKey}`);

        // Store in memory for hot access
        this.setInMemory(cacheKey, cached, Math.min(ttl, 60));

        // Background refresh if enabled and cache is getting stale
        if (backgroundRefresh) {
          this.backgroundRefresh(cacheKey, fetchFn, ttl, prefix, compress);
        }

        return cached;
      }

      // Cache miss - fetch fresh data
      logger.debug(`Cache miss: ${cacheKey}`);
      const freshData = await fetchFn();

      // Store in both caches
      await this.set(cacheKey, freshData, ttl, compress);
      this.setInMemory(cacheKey, freshData, Math.min(ttl, 60));

      return freshData;
    } catch (error) {
      logger.error(`Cache error for ${cacheKey}, falling back to fetch`);
      return fetchFn();
    }
  }

  private async get<T>(key: string, decompress: boolean): Promise<T | null> {
    const raw = await this.redis.getBuffer(key);
    if (!raw) return null;

    try {
      if (decompress && this.isCompressed(raw)) {
        const decompressed = await gunzipAsync(raw);
        return JSON.parse(decompressed.toString());
      }
      return JSON.parse(raw.toString());
    } catch {
      return null;
    }
  }

  private async set(
    key: string,
    value: any,
    ttl: number,
    compress: boolean
  ): Promise<void> {
    const stringified = JSON.stringify(value);

    if (compress && stringified.length > COMPRESSION_THRESHOLD) {
      const compressed = await gzipAsync(stringified);
      await this.redis.setex(key, ttl, compressed);
    } else {
      await this.redis.setex(key, ttl, stringified);
    }
  }

  private isCompressed(buffer: Buffer): boolean {
    // Gzip magic number: 0x1f 0x8b
    return buffer[0] === 0x1f && buffer[1] === 0x8b;
  }

  private getFromMemory<T>(key: string): T | null {
    const cached = this.memoryCache.get(key);
    if (!cached) return null;
    if (Date.now() > cached.expiry) {
      this.memoryCache.delete(key);
      return null;
    }
    return cached.data;
  }

  private setInMemory(key: string, data: any, ttlSeconds: number): void {
    this.memoryCache.set(key, {
      data,
      expiry: Date.now() + ttlSeconds * 1000,
    });
  }

  private async backgroundRefresh<T>(
    key: string,
    fetchFn: () => Promise<T>,
    ttl: number,
    prefix: RedisCachePrefixes,
    compress: boolean
  ): Promise<void> {
    // Check remaining TTL
    const remainingTtl = await this.redis.ttl(key);
    const refreshThreshold = ttl * 0.2; // Refresh when < 20% TTL remaining

    if (remainingTtl > 0 && remainingTtl < refreshThreshold) {
      // Fire and forget background refresh
      setImmediate(async () => {
        try {
          logger.debug(`Background refresh: ${key}`);
          const freshData = await fetchFn();
          await this.set(key, freshData, ttl, compress);
          this.setInMemory(key, freshData, Math.min(ttl, 60));
        } catch (error) {
          logger.warn(`Background refresh failed for ${key}`);
        }
      });
    }
  }

  // Cache invalidation methods
  async invalidate(
    operation: RedisCacheOperations,
    prefix?: RedisCachePrefixes
  ): Promise<void> {
    const pattern = `${prefix || RedisCachePrefixes.DEFAULT}:${operation}*`;
    const keys = await this.redis.keys(pattern);

    if (keys.length > 0) {
      await this.redis.del(...keys);
      // Also clear from memory cache
      keys.forEach((key) => this.memoryCache.delete(key));
      logger.info(`Invalidated ${keys.length} cache keys for pattern: ${pattern}`);
    }
  }

  async invalidateByPattern(pattern: string): Promise<void> {
    const keys = await this.redis.keys(pattern);
    if (keys.length > 0) {
      await this.redis.del(...keys);
      keys.forEach((key) => this.memoryCache.delete(key));
      logger.info(`Invalidated ${keys.length} keys matching: ${pattern}`);
    }
  }

  async invalidateAll(prefix: RedisCachePrefixes): Promise<void> {
    const pattern = `${prefix}:*`;
    await this.invalidateByPattern(pattern);
  }
}

export const redisCacheService = new RedisCacheService();
```

## Usage in Controllers

### Basic Caching

```typescript
// storeController.ts
import { redisCacheService } from "../../redis/cacheService";
import {
  RedisCacheOperations,
  RedisCachePrefixes,
  RedisCacheTTL,
} from "../../redis/redisKeys";

export const storeController = {
  getAllApps: async (req, res, page?: number, limit?: number, search?: string) => {
    try {
      const token = extractToken(req, res);

      return await redisCacheService.withSmartCache<AppView[]>(
        RedisCacheOperations.ADMIN_APPS,
        async () => {
          return await axiosRequest<AppView[]>(
            "GET",
            `${envConfig.storeBaseUrl}/api/apps`,
            {
              params: { page, limit, search },
              headers: { Authorization: `Bearer ${token}` },
            }
          );
        },
        { page, limit, search }, // Cache key params
        {
          ttl: RedisCacheTTL.STORE_ADMIN_APPS,
          prefix: RedisCachePrefixes.STORE,
          backgroundRefresh: true,
        }
      );
    } catch (error) {
      logger.error("Failed to fetch applications");
      ThrowError(error);
    }
  },
};
```

### Caching with Response Transformation

```typescript
export const vpnController = {
  getLocations: async () => {
    return await redisCacheService.withSmartCache<VpnLocation[]>(
      RedisCacheOperations.GET_VPN_LOCATIONS,
      async () => {
        const response = await axiosRequest<{ locations: VpnLocation[] }>(
          "GET",
          `${envConfig.vpnBaseUrl}/api/locations`
        );
        // Transform before caching
        return response.locations.filter((loc) => loc.active);
      },
      undefined, // No params
      {
        ttl: RedisCacheTTL.VPN_LOCATIONS,
        prefix: RedisCachePrefixes.VPN,
      }
    );
  },
};
```

## Cache Invalidation Patterns

### Event-Driven Invalidation

```typescript
// Webhook handler in app.ts
app.post("/admin-back/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  try {
    const result = await processWebhook(
      req.body as Buffer,
      req.header("X-Webhook-Signature")
    );

    if (result.valid && !result.ignored) {
      const { collection, operation, documentId } = result.payload;

      // Invalidate based on collection
      switch (collection) {
        case "applications":
          await redisCacheService.invalidate(
            RedisCacheOperations.ADMIN_APPS,
            RedisCachePrefixes.STORE
          );
          await redisCacheService.invalidate(
            RedisCacheOperations.APPLICATION_VERSION_DETAILS,
            RedisCachePrefixes.STORE
          );
          break;

        case "vpn_servers":
          await redisCacheService.invalidate(
            RedisCacheOperations.GET_VPN_LOCATIONS,
            RedisCachePrefixes.VPN
          );
          break;

        case "drafts":
          await redisCacheService.invalidate(
            RedisCacheOperations.DRAFT_LIST,
            RedisCachePrefixes.DRAFT
          );
          break;
      }
    }

    res.status(200).send("OK");
  } catch (err) {
    logger.error("Webhook processing error:", (err as Error).message);
    res.status(500).send("Error");
  }
});
```

### Manual Invalidation After Mutations

```typescript
export const draftController = {
  publishDraft: async (req, res, draftId: string) => {
    try {
      const token = extractToken(req, res);

      const result = await axiosRequest<PublishResult>(
        "POST",
        `${envConfig.draftServerBaseUrl}/api/drafts/${draftId}/publish`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      // Invalidate related caches after mutation
      await Promise.all([
        redisCacheService.invalidate(
          RedisCacheOperations.DRAFT_LIST,
          RedisCachePrefixes.DRAFT
        ),
        redisCacheService.invalidate(
          RedisCacheOperations.ADMIN_APPS,
          RedisCachePrefixes.STORE
        ),
      ]);

      return result;
    } catch (error) {
      logger.error("Failed to publish draft");
      ThrowError(error);
    }
  },
};
```

## Prefetching Patterns

### Paginated Data Prefetch

```typescript
class RedisCacheService {
  // ... existing methods

  async prefetchNextPages<T>(
    operation: RedisCacheOperations,
    fetchFn: (page: number) => Promise<T>,
    currentPage: number,
    totalPages: number,
    options: CacheOptions = {}
  ): Promise<void> {
    const pagesToPrefetch = Math.min(3, totalPages - currentPage);

    for (let i = 1; i <= pagesToPrefetch; i++) {
      const nextPage = currentPage + i;
      const cacheKey = generateRedisKey(operation, options.prefix, { page: nextPage });

      // Check if already cached
      const exists = await this.redis.exists(cacheKey);
      if (!exists) {
        // Prefetch in background
        setImmediate(async () => {
          try {
            const data = await fetchFn(nextPage);
            await this.set(cacheKey, data, options.ttl || RedisCacheTTL.MEDIUM, true);
            logger.debug(`Prefetched page ${nextPage} for ${operation}`);
          } catch {
            // Ignore prefetch failures
          }
        });
      }
    }
  }
}

// Usage in controller
export const storeController = {
  getAllApps: async (req, res, page = 1, limit = 20) => {
    const result = await redisCacheService.withSmartCache<PaginatedApps>(
      RedisCacheOperations.ADMIN_APPS,
      () => fetchApps(page, limit),
      { page, limit },
      { ttl: RedisCacheTTL.STORE_ADMIN_APPS, prefix: RedisCachePrefixes.STORE }
    );

    // Prefetch next pages in background
    if (result.totalPages > page) {
      redisCacheService.prefetchNextPages(
        RedisCacheOperations.ADMIN_APPS,
        (p) => fetchApps(p, limit),
        page,
        result.totalPages,
        { ttl: RedisCacheTTL.STORE_ADMIN_APPS, prefix: RedisCachePrefixes.STORE }
      );
    }

    return result;
  },
};
```

## Best Practices

1. **Use enums for cache keys** - Prevents typos and enables autocomplete
2. **Set appropriate TTLs** - Shorter for frequently changing data, longer for static
3. **Enable compression for large payloads** - Reduces memory usage
4. **Use background refresh** - Prevents cache stampedes
5. **Invalidate after mutations** - Keep cache consistent with database
6. **Use memory cache for hot data** - Reduces Redis round-trips
7. **Log cache hits/misses** - Helps optimize caching strategy
8. **Gracefully handle Redis failures** - Fall back to direct fetch
9. **Prefetch predictable data** - Improves user experience for pagination
10. **Use patterns for bulk invalidation** - More efficient than individual deletes
