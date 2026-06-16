---
name: admin-components
description: MUI component patterns and tss-react styling. Use when creating React components, dialogs, tables, or styling.
---

# Admin Components Skill

MUI component patterns and tss-react styling for Admin Nx monorepo frontend.

> Component syntax (arrow function with inline destructured props, no `React.FC`, default export), export patterns, and file naming follow **admin-conventions** (the single source of truth).

---

## Component Architecture

### Standard Component Structure

```typescript
// components/MyFeature/MyComponent.tsx
import { Typography, Button, Box } from "@mui/material";
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
      <Typography className={classes.title}>{title}</Typography>
      <Button
        className={classes.actionButton}
        onClick={onAction}
        disabled={disabled}
        variant="contained"
      >
        Action
      </Button>
    </Box>
  );
};

export default MyComponent;
```

## tss-react Styling Pattern

### Basic Style Definition

```typescript
// myComponentStyles.ts
import { makeStyles } from "tss-react/mui";

const useStyles = makeStyles()(() => ({
  container: {
    display: "flex",
    flexDirection: "column",
    gap: "16px",
    padding: "24px",
  },
  title: {
    fontSize: "18px",
    fontWeight: 600,
    color: "#333",
  },
  actionButton: {
    borderRadius: "8px",
    textTransform: "none",
  },
}));

export default useStyles;
```

### Styles with Theme Access

```typescript
import { makeStyles } from "tss-react/mui";

const useStyles = makeStyles()((theme) => ({
  container: {
    backgroundColor: theme.palette.background.paper,
    borderRadius: theme.shape.borderRadius,
    padding: theme.spacing(3),
  },
  primaryText: {
    color: theme.palette.primary.main,
  },
  errorState: {
    color: theme.palette.error.main,
    border: `1px solid ${theme.palette.error.light}`,
  },
}));
```

### Styles with Parameters

```typescript
import { makeStyles } from "tss-react/mui";

interface StyleParams {
  isActive: boolean;
  size: "small" | "medium" | "large";
}

const useStyles = makeStyles<StyleParams>()((theme, { isActive, size }) => ({
  container: {
    backgroundColor: isActive ? theme.palette.primary.light : "transparent",
    padding: size === "small" ? "8px" : size === "medium" ? "16px" : "24px",
  },
  indicator: {
    width: "8px",
    height: "8px",
    borderRadius: "50%",
    backgroundColor: isActive ? theme.palette.success.main : theme.palette.grey[400],
  },
}));

// Usage in component
const MyComponent = ({ isActive }: { isActive: boolean }) => {
  const { classes } = useStyles({ isActive, size: "medium" });
  return <div className={classes.container}>...</div>;
};
```

### MUI Component Overrides

```typescript
const useStyles = makeStyles()(() => ({
  customInput: {
    width: "100%",
    "& .MuiInputBase-root": {
      fontSize: "14px",
      borderRadius: "12px",
      direction: "ltr",
    },
    "& .MuiOutlinedInput-notchedOutline": {
      borderColor: "#e0e0e0",
    },
    "&:hover .MuiOutlinedInput-notchedOutline": {
      borderColor: "#1976d2",
    },
  },
  customButton: {
    "& .MuiButton-startIcon": {
      marginRight: "4px",
    },
  },
}));
```

## Reusable Component Patterns

### AddButton Component

```typescript
// common/AddButton.tsx
import { Button, Typography } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import useStyles from "./addButtonStyles";

interface AddButtonProps {
  text: string;
  onClick: () => void;
  disabled?: boolean;
}

const AddButton = ({ text, onClick, disabled = false }: AddButtonProps) => {
  const { classes } = useStyles();

  return (
    <Button
      className={classes.addButton}
      onClick={onClick}
      disabled={disabled}
      startIcon={<AddIcon />}
    >
      <Typography className={classes.buttonText}>{text}</Typography>
    </Button>
  );
};

export default AddButton;
```

### Permission Control (Render Prop Pattern)

```typescript
// components/permissionControl/permissionControl.tsx
import { ReactNode } from "react";
import { Tooltip } from "@mui/material";
import { useHasPermission } from "../../hooks/useHasPermission";
import { ActionName } from "@admin-types";

interface PermissionControlProps {
  action: ActionName;
  mode?: "disable" | "remove";
  children: (props: { disabled: boolean }) => ReactNode;
  tooltipText?: string;
}

const PermissionControl = ({
  action,
  mode = "disable",
  children,
  tooltipText = "You don't have permission for this action",
}: PermissionControlProps) => {
  const hasPermission = useHasPermission(action);

  if (mode === "remove" && !hasPermission) {
    return null;
  }

  const content = children({ disabled: !hasPermission });

  if (!hasPermission && mode === "disable") {
    return <Tooltip title={tooltipText}>{content}</Tooltip>;
  }

  return <>{content}</>;
};

export default PermissionControl;
```

Usage:
```typescript
<PermissionControl action={ActionName.CREATE_APP}>
  {({ disabled }) => (
    <Button onClick={handleCreate} disabled={disabled}>
      Create App
    </Button>
  )}
</PermissionControl>
```

### GenericTable Component

```typescript
// components/GenericTable/GenericTable.tsx
import { DataGrid, GridColDef, GridRenderCellParams } from "@mui/x-data-grid-pro";
import { IconButton, Tooltip } from "@mui/material";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import PermissionControl from "../permissionControl/permissionControl";
import useStyles from "./genericTableStyles";
import { ActionName } from "@admin-types";

interface GenericTableProps<T> {
  data: T[];
  columns: GridColDef[];
  loading?: boolean;
  onEdit?: (row: T) => void;
  onDelete?: (row: T) => void;
  editPermission?: ActionName;
  deletePermission?: ActionName;
  getRowId?: (row: T) => string | number;
}

const GenericTable = <T extends { id?: string | number }>({
  data,
  columns,
  loading = false,
  onEdit,
  onDelete,
  editPermission,
  deletePermission,
  getRowId = (row) => row.id!,
}: GenericTableProps<T>) => {
  const { classes } = useStyles();

  const actionColumn: GridColDef = {
    field: "actions",
    headerName: "Actions",
    width: 120,
    sortable: false,
    renderCell: (params: GridRenderCellParams<T>) => (
      <div className={classes.actionsCell}>
        {onEdit && (
          <PermissionControl action={editPermission!} mode="disable">
            {({ disabled }) => (
              <Tooltip title="Edit">
                <IconButton
                  size="small"
                  onClick={() => onEdit(params.row)}
                  disabled={disabled}
                >
                  <EditIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
          </PermissionControl>
        )}
        {onDelete && (
          <PermissionControl action={deletePermission!} mode="disable">
            {({ disabled }) => (
              <Tooltip title="Delete">
                <IconButton
                  size="small"
                  onClick={() => onDelete(params.row)}
                  disabled={disabled}
                  color="error"
                >
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
          </PermissionControl>
        )}
      </div>
    ),
  };

  const allColumns = [...columns, ...(onEdit || onDelete ? [actionColumn] : [])];

  return (
    <DataGrid
      className={classes.dataGrid}
      rows={data}
      columns={allColumns}
      loading={loading}
      getRowId={getRowId}
      disableRowSelectionOnClick
      pageSizeOptions={[10, 25, 50]}
      initialState={{
        pagination: { paginationModel: { pageSize: 10 } },
      }}
    />
  );
};

export default GenericTable;
```

## Dialog/Modal Pattern

### Standard Dialog Structure

```typescript
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  IconButton,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import useStyles from "./myDialogStyles";

interface MyDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  onConfirm?: () => void;
  confirmText?: string;
  loading?: boolean;
}

const MyDialog = ({
  open,
  onClose,
  title,
  children,
  onConfirm,
  confirmText = "Confirm",
  loading = false,
}: MyDialogProps) => {
  const { classes } = useStyles();

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle className={classes.dialogTitle}>
        {title}
        <IconButton
          className={classes.closeButton}
          onClick={onClose}
          size="small"
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent className={classes.dialogContent}>
        {children}
      </DialogContent>
      <DialogActions className={classes.dialogActions}>
        <Button onClick={onClose} disabled={loading}>
          Cancel
        </Button>
        {onConfirm && (
          <Button
            onClick={onConfirm}
            variant="contained"
            disabled={loading}
          >
            {loading ? "Loading..." : confirmText}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
};
```

### Confirmation Dialog

```typescript
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, Typography } from "@mui/material";
import WarningIcon from "@mui/icons-material/Warning";

interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  loading?: boolean;
}

const ConfirmDialog = ({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = "Delete",
  loading = false,
}: ConfirmDialogProps) => {
  const { classes } = useStyles();

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle className={classes.warningTitle}>
        <WarningIcon color="warning" />
        {title}
      </DialogTitle>
      <DialogContent>
        <Typography>{message}</Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={loading}>
          Cancel
        </Button>
        <Button
          onClick={onConfirm}
          color="error"
          variant="contained"
          disabled={loading}
        >
          {loading ? "Deleting..." : confirmText}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
```

## Loading States

### Loading Overlay

```typescript
import { CircularProgress, Box, Typography } from "@mui/material";

interface LoadingOverlayProps {
  message?: string;
}

const LoadingOverlay = ({ message = "Loading..." }: LoadingOverlayProps) => {
  const { classes } = useStyles();

  return (
    <Box className={classes.loadingOverlay}>
      <CircularProgress size={40} />
      <Typography className={classes.loadingText}>{message}</Typography>
    </Box>
  );
};

// Styles
const useStyles = makeStyles()(() => ({
  loadingOverlay: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "16px",
    minHeight: "200px",
  },
  loadingText: {
    color: "#666",
  },
}));
```

### Conditional Loading

```typescript
const MyComponent = ({ id }: { id: string }) => {
  const { data, isLoading, error } = trpc.myDomain.getById.useQuery({ id });

  if (isLoading) {
    return <LoadingOverlay message="Loading data..." />;
  }

  if (error) {
    return <ErrorDisplay error={error} />;
  }

  return <div>{/* Render data */}</div>;
};
```

## Layout Components

### Page Container

```typescript
import { Box, Typography } from "@mui/material";
import useStyles from "./pageContainerStyles";

interface PageContainerProps {
  title: string;
  actions?: ReactNode;
  children: ReactNode;
}

const PageContainer = ({ title, actions, children }: PageContainerProps) => {
  const { classes } = useStyles();

  return (
    <Box className={classes.pageContainer}>
      <Box className={classes.header}>
        <Typography variant="h5" className={classes.title}>
          {title}
        </Typography>
        {actions && <Box className={classes.actions}>{actions}</Box>}
      </Box>
      <Box className={classes.content}>{children}</Box>
    </Box>
  );
};
```

### Card Container

```typescript
import { Paper, Typography, Box } from "@mui/material";

interface CardContainerProps {
  title?: string;
  children: ReactNode;
  className?: string;
}

const CardContainer = ({ title, children, className }: CardContainerProps) => {
  const { classes, cx } = useStyles();

  return (
    <Paper className={cx(classes.card, className)}>
      {title && (
        <Typography className={classes.cardTitle}>{title}</Typography>
      )}
      <Box className={classes.cardContent}>{children}</Box>
    </Paper>
  );
};
```

## Icon Button Patterns

```typescript
import { IconButton, Tooltip } from "@mui/material";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import RefreshIcon from "@mui/icons-material/Refresh";
import AddIcon from "@mui/icons-material/Add";

// With tooltip
<Tooltip title="Edit item">
  <IconButton onClick={handleEdit} size="small">
    <EditIcon fontSize="small" />
  </IconButton>
</Tooltip>

// Disabled with tooltip (requires span wrapper)
<Tooltip title={disabled ? "No permission" : "Delete item"}>
  <span>
    <IconButton onClick={handleDelete} disabled={disabled} size="small" color="error">
      <DeleteIcon fontSize="small" />
    </IconButton>
  </span>
</Tooltip>

// Loading state
<IconButton onClick={handleRefresh} disabled={isLoading}>
  {isLoading ? <CircularProgress size={20} /> : <RefreshIcon />}
</IconButton>
```

## File Structure

```
components/
  MyFeature/
    MyComponent/
      MyComponent.tsx           # Main component
      myComponentStyles.ts      # tss-react styles
      index.ts                  # Export barrel
    SubComponent/
      SubComponent.tsx
      subComponentStyles.ts
  common/
    AddButton/
      AddButton.tsx
      addButtonStyles.ts
    LoadingOverlay/
      LoadingOverlay.tsx
      loadingOverlayStyles.ts
    ConfirmDialog/
      ConfirmDialog.tsx
      confirmDialogStyles.ts
```

## Best Practices

1. **Separate styles file** - Always create `*Styles.ts` file for tss-react
2. **Use cx for conditional classes** - `const { classes, cx } = useStyles()`
3. **Tooltip on disabled** - Wrap disabled buttons in span for tooltip to work
4. **Permission control** - Use render prop pattern for permission-based UI
5. **Loading states** - Always handle loading with visual feedback
6. **MUI size consistency** - Use "small" for dense UIs, default otherwise
7. **Theme access** - Use theme for colors, spacing, breakpoints
8. **Composition over inheritance** - Build complex components from simple ones
