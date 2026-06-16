---
name: admin-state
description: Redux Toolkit state management and tRPC client patterns. Use when creating Redux slices, selectors, or tRPC queries.
---

# Admin State Management Skill

Redux Toolkit state management and tRPC client patterns for Admin Nx monorepo frontend.

> Custom hook syntax (named export with arrow function, no default export, no `function` keyword) follows **admin-conventions** (the single source of truth).

---

## Redux Toolkit Architecture

### Store Configuration

```typescript
// redux/store.ts
import { configureStore, combineReducers } from "@reduxjs/toolkit";
import { persistStore, persistReducer } from "redux-persist";
import sessionStorage from "redux-persist/lib/storage/session";
import { SliceName } from "./sliceName";

// Import all slices
import userReducer from "./slices/user";
import appsReducer from "./slices/apps";
import draftsReducer from "./slices/drafts";
import notificationsReducer from "./slices/notifications";

const rootReducer = combineReducers({
  [SliceName.USER]: userReducer,
  [SliceName.APPS]: appsReducer,
  [SliceName.DRAFTS]: draftsReducer,
  [SliceName.NOTIFICATIONS]: notificationsReducer,
});

const persistConfig = {
  key: "admin",
  storage: sessionStorage,
  whitelist: [SliceName.USER, SliceName.DRAFTS], // Only persist these
};

const persistedReducer = persistReducer(persistConfig, rootReducer);

export const store = configureStore({
  reducer: persistedReducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: ["persist/PERSIST", "persist/REHYDRATE"],
      },
    }),
});

export const persistor = persistStore(store);

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
```

### Slice Name Enum

```typescript
// redux/sliceName.ts
export enum SliceName {
  USER = "user",
  APPS = "apps",
  DRAFTS = "drafts",
  CURRENT_APP = "currentApp",
  REGIONS = "regions",
  NOTIFICATIONS = "notifications",
  ACTIONS = "actions",
  ROLES = "roles",
}
```

## Slice Pattern

### Basic Slice

```typescript
// redux/slices/apps.ts
import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { SliceName } from "../sliceName";
import { AppView } from "@admin-types";

interface AppsState {
  apps: AppView[];
  loading: boolean;
  error: string | null;
}

const initialState: AppsState = {
  apps: [],
  loading: false,
  error: null,
};

const appsSlice = createSlice({
  name: SliceName.APPS,
  initialState,
  reducers: {
    setApps(state, action: PayloadAction<AppView[]>) {
      state.apps = action.payload;
      state.loading = false;
      state.error = null;
    },
    addApp(state, action: PayloadAction<AppView>) {
      state.apps.push(action.payload);
    },
    updateApp(state, action: PayloadAction<AppView>) {
      const index = state.apps.findIndex((app) => app.id === action.payload.id);
      if (index !== -1) {
        state.apps[index] = action.payload;
      }
    },
    removeApp(state, action: PayloadAction<string>) {
      state.apps = state.apps.filter((app) => app.id !== action.payload);
    },
    setLoading(state, action: PayloadAction<boolean>) {
      state.loading = action.payload;
    },
    setError(state, action: PayloadAction<string | null>) {
      state.error = action.payload;
      state.loading = false;
    },
    resetAppsState() {
      return initialState;
    },
  },
});

export const {
  setApps,
  addApp,
  updateApp,
  removeApp,
  setLoading,
  setError,
  resetAppsState,
} = appsSlice.actions;

export default appsSlice.reducer;
```

### Slice with Smart Merge

```typescript
// redux/slices/drafts.ts
import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { SliceName } from "../sliceName";
import { Draft } from "@admin-types";

interface DraftsState {
  drafts: Draft[];
  currentDraft: Draft | null;
}

const initialState: DraftsState = {
  drafts: [],
  currentDraft: null,
};

const draftsSlice = createSlice({
  name: SliceName.DRAFTS,
  initialState,
  reducers: {
    setDrafts(state, action: PayloadAction<Draft[]>) {
      state.drafts = action.payload;
    },
    setCurrentDraft(state, action: PayloadAction<Draft | null>) {
      state.currentDraft = action.payload;
    },
    addDraft(state, action: PayloadAction<Draft>) {
      state.drafts.push(action.payload);
    },
    updateDraft(state, action: PayloadAction<{ draft: Draft }>) {
      const { draft } = action.payload;
      const index = state.drafts.findIndex((d) => d.id === draft.id);

      if (index !== -1) {
        // Smart merge - only update non-null, non-empty values
        const existingDraft = state.drafts[index];
        const mergedDraft = { ...existingDraft };

        Object.keys(draft).forEach((key) => {
          const value = draft[key as keyof Draft];
          if (value !== null && value !== undefined && value !== "") {
            (mergedDraft as any)[key] = value;
          }
        });

        state.drafts[index] = mergedDraft;
      }
    },
    removeDraft(state, action: PayloadAction<string>) {
      state.drafts = state.drafts.filter((draft) => draft.id !== action.payload);
    },
    resetDraftsState() {
      return initialState;
    },
  },
});

export const {
  setDrafts,
  setCurrentDraft,
  addDraft,
  updateDraft,
  removeDraft,
  resetDraftsState,
} = draftsSlice.actions;

export default draftsSlice.reducer;
```

### User Slice with Auth

```typescript
// redux/slices/user.ts
import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { SliceName } from "../sliceName";
import { Action, User } from "@admin-types";

interface UserState {
  user: User | null;
  token: string | null;
  actions: Action[];
  isAuthenticated: boolean;
}

const initialState: UserState = {
  user: null,
  token: null,
  actions: [],
  isAuthenticated: false,
};

const userSlice = createSlice({
  name: SliceName.USER,
  initialState,
  reducers: {
    setUser(state, action: PayloadAction<User>) {
      state.user = action.payload;
      state.isAuthenticated = true;
    },
    setToken(state, action: PayloadAction<string>) {
      state.token = action.payload;
    },
    setUserActions(state, action: PayloadAction<Action[]>) {
      state.actions = action.payload;
    },
    logout() {
      return initialState;
    },
  },
});

export const { setUser, setToken, setUserActions, logout } = userSlice.actions;
export default userSlice.reducer;
```

## Typed Hooks

```typescript
// redux/hooks.ts
import { TypedUseSelectorHook, useDispatch, useSelector } from "react-redux";
import type { RootState, AppDispatch } from "./store";

export const useAppDispatch = () => useDispatch<AppDispatch>();
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;
```

### Usage in Components

```typescript
import { useAppDispatch, useAppSelector } from "../../redux/hooks";
import { setApps, addApp } from "../../redux/slices/apps";
import { SliceName } from "../../redux/sliceName";

const MyComponent = () => {
  const dispatch = useAppDispatch();

  // Select state
  const apps = useAppSelector((state) => state[SliceName.APPS].apps);
  const isLoading = useAppSelector((state) => state[SliceName.APPS].loading);
  const user = useAppSelector((state) => state[SliceName.USER].user);

  // Dispatch actions
  const handleAddApp = (app: AppView) => {
    dispatch(addApp(app));
  };

  return <div>{/* ... */}</div>;
};
```

## tRPC Client Setup

### Provider Configuration

```typescript
// trpc/trpcProvider.tsx
import { createTRPCReact, httpBatchLink, wsLink, splitLink } from "@trpc/react-query";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { AppRouter } from "@admin-backend";

export const trpc = createTRPCReact<AppRouter>();

const getToken = () => {
  const state = JSON.parse(sessionStorage.getItem("persist:admin") || "{}");
  const user = JSON.parse(state.user || "{}");
  return user.token;
};

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

const trpcClient = trpc.createClient({
  links: [
    splitLink({
      condition: (op) => op.type === "subscription",
      true: wsLink({
        url: `${import.meta.env.VITE_WS_URL}/ws`,
      }),
      false: httpBatchLink({
        url: `${import.meta.env.VITE_API_URL}/api`,
        headers: () => ({
          Authorization: `Bearer ${getToken()}`,
        }),
      }),
    }),
  ],
});

export const TrpcProvider = ({ children }: { children: React.ReactNode }) => (
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  </trpc.Provider>
);
```

## tRPC Query Patterns

### Basic Query

```typescript
const { data, isLoading, error, refetch } = trpc.store.getAllApps.useQuery({
  page: 1,
  limit: 10,
});
```

### Query with Redux Sync

```typescript
import { useAppDispatch } from "../../redux/hooks";
import { setApps, setLoading, setError } from "../../redux/slices/apps";

const useAppsData = () => {
  const dispatch = useAppDispatch();

  const { data, isLoading, error } = trpc.store.getAllApps.useQuery(undefined, {
    onSuccess: (data) => {
      dispatch(setApps(data));
    },
    onError: (error) => {
      dispatch(setError(error.message));
    },
  });

  useEffect(() => {
    dispatch(setLoading(isLoading));
  }, [isLoading, dispatch]);

  return { data, isLoading, error };
};
```

### Conditional Query

```typescript
const { data } = trpc.authorization.getAllActions.useQuery(undefined, {
  enabled: shouldFetch && hasPermission, // Only fetch when conditions are met
  staleTime: 5 * 60 * 1000, // 5 minutes cache
  keepPreviousData: true,
});
```

### Permission-Based Query

```typescript
import { useHasPermission } from "../../hooks/useHasPermission";
import { ActionName } from "@admin-types";

const MyComponent = () => {
  const canViewApps = useHasPermission(ActionName.VIEW_APPS);

  const { data: apps } = trpc.store.getAllApps.useQuery(undefined, {
    enabled: canViewApps,
  });

  return canViewApps ? <AppList apps={apps} /> : <NoPermission />;
};
```

## tRPC Mutation Patterns

### Basic Mutation

```typescript
const createAppMutation = trpc.store.createApp.useMutation({
  onSuccess: (data) => {
    showNotification("App created successfully", "success");
    dispatch(addApp(data));
  },
  onError: (error) => {
    showNotification(`Error: ${error.message}`, "error");
  },
});

// Usage
const handleCreate = async (formData: CreateAppInput) => {
  await createAppMutation.mutateAsync(formData);
};
```

### Mutation with Error Status Handling

```typescript
const deleteMutation = trpc.store.deleteApp.useMutation({
  onError: (err: any) => {
    const statusCode = err.cause?.status || err.data?.httpStatus;

    if (statusCode === 403) {
      showNotification("Permission denied", "error");
    } else if (statusCode === 404) {
      showNotification("Item not found", "error");
    } else {
      showNotification("Failed to delete", "error");
    }
  },
  onSuccess: () => {
    showNotification("Deleted successfully", "success");
    refetchApps();
  },
});
```

### Mutation with Optimistic Update

```typescript
const updateMutation = trpc.store.updateApp.useMutation({
  onMutate: async (newData) => {
    // Cancel outgoing refetches
    await queryClient.cancelQueries(["store.getAllApps"]);

    // Snapshot previous value
    const previousApps = queryClient.getQueryData(["store.getAllApps"]);

    // Optimistically update
    queryClient.setQueryData(["store.getAllApps"], (old: AppView[] | undefined) =>
      old?.map((app) => (app.id === newData.id ? { ...app, ...newData } : app))
    );

    return { previousApps };
  },
  onError: (err, newData, context) => {
    // Rollback on error
    queryClient.setQueryData(["store.getAllApps"], context?.previousApps);
  },
  onSettled: () => {
    queryClient.invalidateQueries(["store.getAllApps"]);
  },
});
```

## Custom Hooks

### useHasPermission

```typescript
// hooks/useHasPermission.ts
import { useAppSelector } from "../redux/hooks";
import { SliceName } from "../redux/sliceName";
import { ActionName, Action } from "@admin-types";

export const hasPermission = (actions: Action[], actionName: ActionName): boolean => {
  return actions.some((action) => action.name === actionName);
};

export const useHasPermission = (actionName: ActionName): boolean => {
  const actions = useAppSelector((state) => state[SliceName.USER].actions);
  return hasPermission(actions, actionName);
};
```

### useSnackbarNotification

```typescript
// hooks/useSnackbarNotification.ts
import { useSnackbar, VariantType } from "notistack";

export const useSnackbarNotification = () => {
  const { enqueueSnackbar } = useSnackbar();

  return (message: string, variant: VariantType) => {
    enqueueSnackbar(message, {
      variant,
      anchorOrigin: {
        vertical: "bottom",
        horizontal: "right",
      },
      autoHideDuration: 3000,
    });
  };
};
```

### usePermissionQueryOptions

```typescript
// hooks/usePermissionQueryOptions.ts
import { useHasPermission } from "./useHasPermission";
import { ActionName } from "@admin-types";

export const usePermissionQueryOptions = (actionName: ActionName) => {
  const hasPermission = useHasPermission(actionName);

  return {
    enabled: hasPermission,
    staleTime: 5 * 60 * 1000, // 5 minutes
    keepPreviousData: true,
  };
};

// Usage
const queryOptions = usePermissionQueryOptions(ActionName.VIEW_ACTIONS);
const { data } = trpc.authorization.getAllActions.useQuery(undefined, queryOptions);
```

### Data Management Hook

```typescript
// hooks/useActionsManagement.ts
import { useAppDispatch, useAppSelector } from "../redux/hooks";
import { setUserActions } from "../redux/slices/user";
import { trpc } from "../trpc/trpcProvider";
import { useHasPermission } from "./useHasPermission";
import { ActionName } from "@admin-types";

export const useActionsManagement = () => {
  const dispatch = useAppDispatch();
  const canManageActions = useHasPermission(ActionName.MANAGE_ACTIONS);

  // Query
  const actionsQuery = trpc.authorization.getAllActions.useQuery(undefined, {
    enabled: canManageActions,
    onSuccess: (data) => {
      dispatch(setUserActions(data));
    },
  });

  // Mutations
  const createAction = trpc.authorization.createAction.useMutation({
    onSuccess: () => {
      actionsQuery.refetch();
    },
  });

  const updateAction = trpc.authorization.updateAction.useMutation({
    onSuccess: () => {
      actionsQuery.refetch();
    },
  });

  const deleteAction = trpc.authorization.deleteAction.useMutation({
    onSuccess: () => {
      actionsQuery.refetch();
    },
  });

  return {
    actions: actionsQuery.data ?? [],
    isLoading: actionsQuery.isLoading,
    error: actionsQuery.error,
    createAction,
    updateAction,
    deleteAction,
    refetch: actionsQuery.refetch,
  };
};
```

## Context Pattern

### Simple Context

```typescript
// contexts/VpnCreateContext.tsx
import { createContext, useContext, useState, ReactNode } from "react";

interface VpnCreateContextType {
  isOpen: boolean;
  openDialog: () => void;
  closeDialog: () => void;
}

const VpnCreateContext = createContext<VpnCreateContextType | undefined>(undefined);

export const VpnCreateProvider = ({ children }: { children: ReactNode }) => {
  const [isOpen, setIsOpen] = useState(false);

  const openDialog = () => setIsOpen(true);
  const closeDialog = () => setIsOpen(false);

  return (
    <VpnCreateContext.Provider value={{ isOpen, openDialog, closeDialog }}>
      {children}
    </VpnCreateContext.Provider>
  );
};

export const useVpnCreate = () => {
  const context = useContext(VpnCreateContext);
  if (!context) {
    throw new Error("useVpnCreate must be used within VpnCreateProvider");
  }
  return context;
};
```

## File Structure

```
src/
  redux/
    store.ts              # Store configuration
    hooks.ts              # Typed useDispatch, useSelector
    sliceName.ts          # Slice name enum
    slices/
      user.ts             # User/auth state
      apps.ts             # Apps state
      drafts.ts           # Drafts state
      notifications.ts    # UI notifications
  trpc/
    trpcProvider.tsx      # tRPC client setup
  hooks/
    useHasPermission.ts
    useSnackbarNotification.ts
    usePermissionQueryOptions.ts
  contexts/
    VpnCreateContext.tsx
```

## Best Practices

1. **Slice names as enum** - Use `SliceName` enum for consistency
2. **Typed hooks** - Always use `useAppSelector` and `useAppDispatch`
3. **Redux for shared state** - Use Redux for state accessed by multiple components
4. **tRPC for server state** - Let tRPC handle caching, not Redux
5. **Sync on success** - Dispatch to Redux in `onSuccess` callbacks
6. **Permission-gated queries** - Use `enabled` option with permission checks
7. **Smart merging** - Skip null/empty values when updating state
8. **Reset actions** - Provide reset action for logout/cleanup
9. **Context for UI state** - Use React Context for component-local state
10. **Custom hooks** - Extract query/mutation logic into reusable hooks
