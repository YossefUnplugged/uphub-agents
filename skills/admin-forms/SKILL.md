---
name: admin-forms
description: React Hook Form + Zod validation patterns. Use when creating forms, validation schemas, or form components.
---

# Admin Forms Skill

React Hook Form + Zod validation patterns for Admin Nx monorepo frontend.

> Component syntax (arrow function with inline destructured props, no `React.FC`, default export) and export patterns follow **admin-conventions** (the single source of truth).

---

## Form Architecture

### Standard Form Setup

Use FormProvider with useForm and Zod validation:

```typescript
// components/MyFeature/myForm.tsx
import { useForm, FormProvider } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { MyFormSchema, defaultValues, MyFormKey } from "./myFormSchema";
import type { MyFormTypes } from "./myFormSchema";

const MyForm = () => {
  const methods = useForm<MyFormTypes>({
    resolver: zodResolver(MyFormSchema),
    defaultValues,
    mode: "onChange",
  });

  const { handleSubmit, watch, setValue, formState: { errors, isValid } } = methods;

  const onSubmit = async (data: MyFormTypes) => {
    // Handle submission
  };

  return (
    <FormProvider {...methods}>
      <form onSubmit={handleSubmit(onSubmit)}>
        {/* Form fields */}
      </form>
    </FormProvider>
  );
};
```

## Schema Pattern

### Field Keys Enum

Always define field keys as an enum for type safety and refactoring:

```typescript
// myFormSchema.ts
import { z } from "zod";

export enum MyFormKey {
  NAME = "name",
  EMAIL = "email",
  DESCRIPTION = "description",
  CATEGORY = "category",
  IS_ACTIVE = "isActive",
  RATING = "rating",
  PORT = "port",
  URL = "url",
}
```

### Zod Schema Definition

```typescript
export const MyFormSchema = z.object({
  // Required string
  [MyFormKey.NAME]: z.string().min(1, "Name is required"),

  // Email validation
  [MyFormKey.EMAIL]: z.string().email("Invalid email format"),

  // Optional with default
  [MyFormKey.DESCRIPTION]: z.string().default(""),

  // Enum/select field
  [MyFormKey.CATEGORY]: z.enum(["category1", "category2", "category3"]),

  // Boolean
  [MyFormKey.IS_ACTIVE]: z.boolean().default(false),

  // Number with range
  [MyFormKey.RATING]: z.preprocess(
    (val) => (val === "" ? undefined : Number(val)),
    z.number().min(0).max(5).optional()
  ),

  // Port number validation
  [MyFormKey.PORT]: z.preprocess(
    (val) => (val === "" ? undefined : Number(val)),
    z.number().min(1).max(65535).optional()
  ),

  // URL validation
  [MyFormKey.URL]: z.string().url("Invalid URL").optional().or(z.literal("")),
});

// Type inference
export type MyFormTypes = z.infer<typeof MyFormSchema>;
```

### Default Values Export

```typescript
export const defaultValues: MyFormTypes = {
  [MyFormKey.NAME]: "",
  [MyFormKey.EMAIL]: "",
  [MyFormKey.DESCRIPTION]: "",
  [MyFormKey.CATEGORY]: "category1",
  [MyFormKey.IS_ACTIVE]: false,
  [MyFormKey.RATING]: undefined,
  [MyFormKey.PORT]: undefined,
  [MyFormKey.URL]: "",
};
```

## Conditional Validation

### Discriminated Unions

Use discriminated unions for forms with conditional fields:

```typescript
const SupportedAppSchema = z.object({
  unsupported: z.literal(false),
  version: z.string().min(1, "Version required for supported apps"),
  downloadUrl: z.string().url("Valid URL required"),
});

const UnsupportedAppSchema = z.object({
  unsupported: z.literal(true),
  reason: z.string().min(1, "Reason required for unsupported apps"),
});

export const AppFormSchema = z.discriminatedUnion("unsupported", [
  SupportedAppSchema,
  UnsupportedAppSchema,
]);
```

### SuperRefine for Cross-Field Validation

```typescript
export const VpnFormSchema = z
  .object({
    protocol: z.enum(["http", "https"]),
    sniUrl: z.string().optional(),
    sniPort: z.preprocess(
      (val) => (val === "" ? undefined : Number(val)),
      z.number().min(1).max(65535).optional()
    ),
  })
  .superRefine((data, ctx) => {
    if (data.protocol === "https") {
      if (!data.sniUrl) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "SNI URL is required for HTTPS protocol",
          path: ["sniUrl"],
        });
      }
      if (!data.sniPort) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "SNI Port is required for HTTPS protocol",
          path: ["sniPort"],
        });
      }
    }
  });
```

## Form Field Components

### Controller Pattern with MUI

```typescript
import { Controller, useFormContext } from "react-hook-form";
import { TextField, FormControl, FormHelperText } from "@mui/material";
import { MyFormKey, MyFormTypes } from "./myFormSchema";

interface FormTextFieldProps {
  name: MyFormKey;
  label: string;
  placeholder?: string;
  multiline?: boolean;
  rows?: number;
  disabled?: boolean;
}

const FormTextField = ({
  name,
  label,
  placeholder,
  multiline = false,
  rows = 1,
  disabled = false,
}: FormTextFieldProps) => {
  const { control, formState: { errors } } = useFormContext<MyFormTypes>();

  return (
    <Controller
      name={name}
      control={control}
      render={({ field }) => (
        <FormControl fullWidth error={!!errors[name]}>
          <TextField
            {...field}
            label={label}
            placeholder={placeholder}
            multiline={multiline}
            rows={rows}
            disabled={disabled}
            error={!!errors[name]}
            size="small"
          />
          {errors[name] && (
            <FormHelperText>{errors[name]?.message}</FormHelperText>
          )}
        </FormControl>
      )}
    />
  );
};
```

### Select Field Component

```typescript
import { Controller, useFormContext } from "react-hook-form";
import { FormControl, InputLabel, Select, MenuItem, FormHelperText } from "@mui/material";

interface FormSelectProps {
  name: MyFormKey;
  label: string;
  options: { value: string; label: string }[];
  disabled?: boolean;
}

const FormSelect = ({ name, label, options, disabled }: FormSelectProps) => {
  const { control, formState: { errors } } = useFormContext<MyFormTypes>();

  return (
    <Controller
      name={name}
      control={control}
      render={({ field }) => (
        <FormControl fullWidth error={!!errors[name]} size="small">
          <InputLabel>{label}</InputLabel>
          <Select {...field} label={label} disabled={disabled}>
            {options.map((option) => (
              <MenuItem key={option.value} value={option.value}>
                {option.label}
              </MenuItem>
            ))}
          </Select>
          {errors[name] && (
            <FormHelperText>{errors[name]?.message}</FormHelperText>
          )}
        </FormControl>
      )}
    />
  );
};
```

### Autocomplete Field Component

```typescript
import { Controller, useFormContext } from "react-hook-form";
import { Autocomplete, TextField, Chip } from "@mui/material";
import { omit } from "lodash-es";

interface MultiSelectAutocompleteProps<T> {
  name: MyFormKey;
  label: string;
  options: T[];
  getOptionLabel: (option: T) => string;
  isOptionEqualToValue: (option: T, value: T) => boolean;
  disabled?: boolean;
}

const MultiSelectAutocomplete = <T,>({
  name,
  label,
  options,
  getOptionLabel,
  isOptionEqualToValue,
  disabled,
}: MultiSelectAutocompleteProps<T>) => {
  const { control, formState: { errors } } = useFormContext();

  return (
    <Controller
      name={name}
      control={control}
      render={({ field }) => (
        <Autocomplete
          {...omit(field, "ref")}
          multiple
          options={options}
          getOptionLabel={getOptionLabel}
          isOptionEqualToValue={isOptionEqualToValue}
          disabled={disabled}
          onChange={(_, value) => field.onChange(value)}
          renderInput={(params) => (
            <TextField
              {...params}
              label={label}
              error={!!errors[name]}
              helperText={errors[name]?.message?.toString()}
              size="small"
            />
          )}
          renderTags={(value, getTagProps) =>
            value.map((option, index) => (
              <Chip
                {...getTagProps({ index })}
                key={index}
                label={getOptionLabel(option)}
                size="small"
              />
            ))
          }
        />
      )}
    />
  );
};
```

## Form Submission Patterns

### With tRPC Mutation

```typescript
import { trpc } from "../../trpc/trpcProvider";
import { useSnackbarNotification } from "../../hooks/useSnackbarNotification";

const MyForm = () => {
  const showNotification = useSnackbarNotification();
  const createMutation = trpc.myDomain.create.useMutation({
    onSuccess: () => {
      showNotification("Created successfully", "success");
      methods.reset(defaultValues);
    },
    onError: (error) => {
      const statusCode = error.cause?.status;
      if (statusCode === 403) {
        showNotification("Permission denied", "error");
      } else {
        showNotification("Failed to create", "error");
      }
    },
  });

  const onSubmit = async (data: MyFormTypes) => {
    await createMutation.mutateAsync(data);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      {/* Fields */}
      <Button
        type="submit"
        disabled={!isValid || createMutation.isLoading}
      >
        {createMutation.isLoading ? "Saving..." : "Save"}
      </Button>
    </form>
  );
};
```

### Form in Dialog

```typescript
import { Dialog, DialogTitle, DialogContent, DialogActions, Button } from "@mui/material";

interface FormDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const FormDialog = ({ open, onClose, onSuccess }: FormDialogProps) => {
  const methods = useForm<MyFormTypes>({
    resolver: zodResolver(MyFormSchema),
    defaultValues,
  });

  const mutation = trpc.myDomain.create.useMutation({
    onSuccess: () => {
      onSuccess();
      onClose();
      methods.reset();
    },
  });

  const handleClose = () => {
    methods.reset();
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>Create Item</DialogTitle>
      <FormProvider {...methods}>
        <form onSubmit={methods.handleSubmit((data) => mutation.mutate(data))}>
          <DialogContent>
            <FormTextField name={MyFormKey.NAME} label="Name" />
            {/* More fields */}
          </DialogContent>
          <DialogActions>
            <Button onClick={handleClose}>Cancel</Button>
            <Button
              type="submit"
              variant="contained"
              disabled={mutation.isLoading}
            >
              Create
            </Button>
          </DialogActions>
        </form>
      </FormProvider>
    </Dialog>
  );
};
```

## Dynamic Form Values

### Watch and SetValue

```typescript
const MyForm = () => {
  const { watch, setValue } = useFormContext<MyFormTypes>();

  // Watch specific field
  const protocol = watch(MyFormKey.PROTOCOL);

  // Watch multiple fields
  const [name, category] = watch([MyFormKey.NAME, MyFormKey.CATEGORY]);

  // Conditional setValue
  useEffect(() => {
    if (protocol === "https") {
      setValue(MyFormKey.PORT, 443);
    } else {
      setValue(MyFormKey.PORT, 80);
    }
  }, [protocol, setValue]);

  return (
    <>
      <FormSelect name={MyFormKey.PROTOCOL} label="Protocol" options={protocols} />
      {protocol === "https" && (
        <FormTextField name={MyFormKey.SNI_URL} label="SNI URL" />
      )}
    </>
  );
};
```

### Populating from API Data

```typescript
const EditForm = ({ itemId }: { itemId: string }) => {
  const { data: item, isLoading } = trpc.myDomain.getById.useQuery({ id: itemId });

  const methods = useForm<MyFormTypes>({
    resolver: zodResolver(MyFormSchema),
    defaultValues,
  });

  // Populate form when data loads
  useEffect(() => {
    if (item) {
      methods.reset({
        [MyFormKey.NAME]: item.name,
        [MyFormKey.EMAIL]: item.email,
        [MyFormKey.CATEGORY]: item.category,
      });
    }
  }, [item, methods]);

  if (isLoading) return <CircularProgress />;

  return <FormProvider {...methods}>{/* Form content */}</FormProvider>;
};
```

## File Structure

```
components/
  MyFeature/
    myForm/
      myForm.tsx           # Main form component
      myFormSchema.ts      # Zod schema + types + defaults
      myFormStyles.ts      # tss-react styles
      formFields/          # Reusable field components (if complex)
        FormTextField.tsx
        FormSelect.tsx
```

## Best Practices

1. **Always use enum keys** - Never use magic strings for field names
2. **Export schema and types separately** - Schema for validation, types for TypeScript
3. **Preprocess numbers** - Handle empty string to undefined conversion
4. **Use defaultValues export** - Keep defaults with schema, not in component
5. **Controller for MUI components** - Don't use register() with MUI
6. **Reset on dialog close** - Always reset form state when closing dialogs
7. **Handle loading states** - Disable submit during mutation
8. **Use FormProvider** - For nested form field components
9. **Discriminated unions** - For conditional form sections
10. **SuperRefine** - For cross-field validation logic
