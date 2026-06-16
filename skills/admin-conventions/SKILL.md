---
name: admin-conventions
description: Mandatory coding conventions, syntax rules, naming standards, and folder structure for Admin Nx monorepo. Use when creating any new files.
---

# Admin Conventions Skill

Mandatory coding conventions and syntax rules for Admin Nx monorepo.

## MANDATORY SYNTAX RULES

### Arrow Function Components (REQUIRED)

**ALL React components MUST use this exact syntax:**

```typescript
// components/MyComponent/MyComponent.tsx
import { Box, Typography } from "@mui/material";
import useStyles from "./myComponentStyles";

interface Props {
  title: string;
  onAction: () => void;
  disabled?: boolean;
}

const MyComponent = ({ title, onAction, disabled = false }: Props) => {
  const { classes } = useStyles();

  return (
    <Box className={classes.container}>
      <Typography>{title}</Typography>
    </Box>
  );
};

export default MyComponent;
```

**FORBIDDEN syntaxes:**
```typescript
// ❌ NEVER use function keyword
function MyComponent(props: Props) { }

// ❌ NEVER use React.FC
const MyComponent: React.FC<Props> = (props) => { }

// ❌ NEVER use FC type
const MyComponent: FC<Props> = (props) => { }

// ❌ NEVER destructure in separate line
const MyComponent = (props: Props) => {
  const { title } = props;  // ❌
}
```

**REQUIRED syntax:**
```typescript
// ✅ Arrow function with destructured props inline
const MyComponent = ({ title, onAction }: Props) => { }

// ✅ Export default at bottom
export default MyComponent;
```

---

### Custom Hooks (REQUIRED)

**ALL custom hooks MUST use this exact syntax:**

```typescript
// hooks/useMyFeature.ts
import { useState, useCallback } from "react";

interface UseMyFeatureProps {
  initialValue: string;
  onComplete?: () => void;
}

interface UseMyFeatureReturn {
  value: string;
  setValue: (val: string) => void;
  reset: () => void;
}

export const useMyFeature = ({ initialValue, onComplete }: UseMyFeatureProps): UseMyFeatureReturn => {
  const [value, setValue] = useState(initialValue);

  const reset = useCallback(() => {
    setValue(initialValue);
    onComplete?.();
  }, [initialValue, onComplete]);

  return { value, setValue, reset };
};
```

**FORBIDDEN syntaxes:**
```typescript
// ❌ NEVER use function keyword
export function useMyFeature(props: Props) { }

// ❌ NEVER use default export for hooks
const useMyFeature = () => { }
export default useMyFeature;
```

**REQUIRED syntax:**
```typescript
// ✅ Named export with arrow function
export const useMyFeature = ({ ...props }: Props) => { }
```

---

### Style Files (REQUIRED)

**ALL style files MUST use this exact syntax:**

```typescript
// myComponentStyles.ts
import { makeStyles } from "tss-react/mui";

const useStyles = makeStyles()((theme) => ({
  container: {
    display: "flex",
    padding: theme.spacing(2),
  },
  title: {
    color: theme.palette.primary.main,
  },
}));

export default useStyles;
```

---

## Naming Conventions

### Files

| Type | Pattern | Example |
|------|---------|---------|
| Component | `PascalCase.tsx` | `FavoriteButton.tsx` |
| Styles | `camelCaseStyles.ts` | `favoriteButtonStyles.ts` |
| Hook | `useCamelCase.ts` | `useFavorites.ts` |
| Schema | `camelCaseSchema.ts` | `favoriteSchema.ts` |
| Slice | `camelCase.ts` | `favorites.ts` |
| Router | `camelCaseRouter.ts` | `favoritesRouter.ts` |
| Controller | `camelCaseController.ts` | `favoritesController.ts` |

### Variables

| Type | Pattern | Example |
|------|---------|---------|
| Component | `PascalCase` | `const FavoriteButton = () => {}` |
| Hook | `usePascalCase` | `export const useFavorites = () => {}` |
| Function | `camelCase` | `const handleClick = () => {}` |
| Constant | `SCREAMING_SNAKE` | `const CACHE_TTL = 300` |
| Interface | `PascalCase` | `interface Props {}` |
| Type | `PascalCase` | `type FavoriteItem = {}` |
| Enum | `PascalCase` | `enum FormKey {}` |
| Enum value | `SCREAMING_SNAKE` | `FormKey.USER_NAME` |

---

## Folder Structure

### Frontend

```
apps/admin_client/src/
├── components/
│   └── FeatureName/           # Feature folder (PascalCase)
│       ├── ComponentName/     # Component folder (PascalCase)
│       │   ├── ComponentName.tsx
│       │   ├── componentNameStyles.ts
│       │   └── index.ts
│       └── SubComponent/
│           ├── SubComponent.tsx
│           └── subComponentStyles.ts
├── hooks/
│   ├── useFeatureName.ts      # Feature hook
│   └── useCommonHook.ts       # Shared hooks
├── redux/
│   ├── slices/
│   │   └── featureName.ts     # Redux slice
│   ├── store.ts
│   ├── hooks.ts
│   └── sliceName.ts
├── trpc/
│   └── trpcProvider.tsx
└── contexts/
    └── FeatureContext.tsx
```

### Backend

```
apps/admin_backend/src/
├── trpc/
│   ├── routes/
│   │   ├── appRouter.ts        # Main router aggregator
│   │   └── featureRouter.ts    # Feature router
│   ├── controllers/
│   │   └── featureController.ts
│   └── Errors/
│       └── TrpcErrors.ts
├── models/
│   └── interfaces/
│       └── featureSchema.ts    # Zod schemas
├── redis/
│   └── cacheService.ts
├── utils/
│   ├── logger.ts
│   └── axiosRequestGeneric.ts
└── services/
    └── featureService.ts
```

---

## Import Order

```typescript
// 1. React imports
import { useState, useCallback, useEffect } from "react";

// 2. Third-party libraries
import { Box, Typography, Button } from "@mui/material";
import { useForm } from "react-hook-form";
import { z } from "zod";

// 3. Internal absolute imports (aliases)
import { trpc } from "@/trpc/trpcProvider";
import { useAppDispatch } from "@/redux/hooks";

// 4. Relative imports - types/interfaces first
import type { FeatureProps } from "./types";
import { FeatureSchema } from "./featureSchema";

// 5. Relative imports - components
import SubComponent from "./SubComponent";

// 6. Relative imports - styles (always last)
import useStyles from "./featureStyles";
```

---

## Export Patterns

### Components
```typescript
// Always default export
const MyComponent = ({ ... }: Props) => { };
export default MyComponent;
```

### Hooks
```typescript
// Always named export
export const useMyHook = ({ ... }: Props) => { };
```

### Types/Interfaces
```typescript
// Named exports
export interface Props { }
export type FeatureType = { };
```

### Schemas
```typescript
// Named exports for schema and inferred type
export const featureSchema = z.object({ });
export type FeatureType = z.infer<typeof featureSchema>;
```

### Redux Slices
```typescript
// Named exports for actions, default export for reducer
export const { setItems, addItem, removeItem } = slice.actions;
export default slice.reducer;
```

---

## TypeScript Rules

### Never Use

```typescript
// ❌ any type
const data: any = {};

// ❌ Implicit any
function handle(data) { }

// ❌ Non-null assertion when avoidable
const value = data!.property;

// ❌ Type assertion when avoidable
const value = data as MyType;
```

### Always Use

```typescript
// ✅ Explicit types
const data: FeatureData = {};

// ✅ Interface for objects
interface Props {
  title: string;
}

// ✅ Optional chaining
const value = data?.property;

// ✅ Nullish coalescing
const value = data ?? defaultValue;
```

---

## Summary Checklist

Before creating any file:

- [ ] Component uses arrow function: `const Name = ({ }: Props) => { }`
- [ ] Component has `export default Name` at bottom
- [ ] Hook uses named export: `export const useName = () => { }`
- [ ] Styles use default export: `export default useStyles`
- [ ] File name matches pattern (PascalCase for components, camelCase for others)
- [ ] Imports are in correct order
- [ ] No `any` types
- [ ] Props destructured inline
