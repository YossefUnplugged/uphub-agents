# Admin Web — Component Recipes (1:1 from the AAA / administration UI)

Every block below is the **actual** shipping pattern from `apps/admin_client/src/components/administration` (the AAA permission manager) — the canonical admin design system. Match it exactly. Source file cited per block.

> **Reuse before you rebuild.** These already exist as reusable components — pass props, don't re-implement:
> - **Table** → `administration/GenericTable/GenericTable.tsx`
> - **Search** → `administration/TableSearch/TableSearch.tsx`
> - **Add/Edit dialog + form** → `administration/ItemDetailsPanel/AddItemDialog/`
> - **Tabs** → `administration/NavigationTab/NavigationTab.tsx`
> Build new only when the ticket needs something these can't do — and then match the tokens below.

---

## 1. Buttons — primary (contained) + cancel (outlined)
Source: `AddItemDialog/AddItemDialogStyles.ts` + `AddItemDialog.tsx`

```typescript
// styles
submitButton: {                       // primary / confirm
    textTransform: "none",
    fontSize: "14px",
    fontWeight: 500,
    padding: "8px 24px",
    minWidth: "100px",
    backgroundColor: "#495dc5",
    color: "white",
    "&:hover": { backgroundColor: "#3d4fa3" },
    "&:disabled": { backgroundColor: "#495dc550", color: "white" },
},
cancelButton: {                       // secondary / dismiss
    textTransform: "none",
    fontSize: "14px",
    fontWeight: 500,
    padding: "8px 16px",
    minWidth: "80px",
    color: "#495dc5",
    borderColor: "#495dc5",
    "&:hover": { borderColor: "#3d4fa3", backgroundColor: "#495dc510" },
    "&:disabled": { color: "#495dc550", borderColor: "#495dc550" },
},
```
```tsx
<Button onClick={onClose} disabled={isLoading} variant="outlined" className={classes.cancelButton}>Cancel</Button>
<Button type="submit" variant="contained" disabled={isLoading || isSubmitting} className={classes.submitButton}>
    {isLoading ? "Adding..." : "Add"}
</Button>
```
**Rules:** primary is `variant="contained"` `#495dc5` → hover `#3d4fa3`; secondary is `variant="outlined"` `#495dc5`. Always `textTransform: "none"`, weight 500, size 14. Disabled = the colour at 50% (`#495dc550`). Label shows progress text while submitting ("Adding..." / "Updating...").

---

## 2. Inputs & form fields — RHF Controller + MUI
Source: `tablesForms/ActionFormFields/ActionFormFields.tsx`

```tsx
// Text input
<FormControl fullWidth margin="normal" error={!!errors[ActionFormKey.NAME]}>
    <Controller
        name={ActionFormKey.NAME}
        control={control}
        render={({ field }) => (
            <TextField {...field} label="Action Name" fullWidth error={!!errors[ActionFormKey.NAME]} />
        )}
    />
    {errors[ActionFormKey.NAME] && <FormHelperText>{errors[ActionFormKey.NAME]?.message}</FormHelperText>}
</FormControl>

// Select / dropdown (InputLabel goes OUTSIDE the Controller; styled menu via selectPaper)
<FormControl fullWidth margin="normal" error={!!errors[ActionFormKey.METHOD]}>
    <InputLabel>Method</InputLabel>
    <Controller
        name={ActionFormKey.METHOD}
        control={control}
        render={({ field }) => (
            <Select {...field} label="Method" error={!!errors[ActionFormKey.METHOD]}
                MenuProps={{ PaperProps: { className: classes.selectPaper } }}>
                {HTTP_METHODS.map((m) => <MenuItem key={m} value={m}>{m}</MenuItem>)}
            </Select>
        )}
    />
    {errors[ActionFormKey.METHOD] && <FormHelperText>{errors[ActionFormKey.METHOD]?.message}</FormHelperText>}
</FormControl>
```
```typescript
// styled select menu — Source: AddItemDialogStyles.ts
selectPaper: {
    "& .MuiMenuItem-root": {
        borderBottom: "1px solid #495dc530",
        "&:last-child": { borderBottom: "none" },
        "&:hover": { backgroundColor: "#495dc510" },
    },
},
```
**Rules:** every field is `<FormControl fullWidth margin="normal" error={!!errors[key]}>` wrapping a RHF `<Controller>`; default MUI outlined look (no custom radius inside dialogs); errors via `<FormHelperText>`; field keys come from an enum (`ActionFormKey`), never raw strings. Validation is Zod via the form's resolver (see admin-forms). For a standalone **search** input use the pill style in §6, not this.

---

## 3. Table — the DataGrid
Source: `GenericTable/GenericTable.tsx` + `GenericTableStyles.ts` + `dataGridSxStyles.ts`

Prefer **reusing `GenericTable`**:
```tsx
<GenericTable
    data={rows}
    columns={columns}              // optional; auto-extracted if omitted
    onRowClick={(row) => openDetails(row)}
    onEdit={(row) => openEdit(row)}
    onDelete={(row) => confirmDelete(row)}
    editAction={Actions.FOO_EDIT}   // gates the edit icon via PermissionControl
    deleteAction={Actions.FOO_DELETE}
/>
```
If you must build a DataGrid yourself, match these exactly:
```typescript
// GenericTableStyles.ts → dataGrid
dataGrid: {
    width: "100%", height: "70%", padding: "1.2%", direction: "ltr",
    borderRadius: "15px", backgroundColor: "white", border: "1px solid #495dc5",
    "& .MuiDataGrid-columnHeaders": {
        fontSize: "20px", backgroundColor: "#f5f5f5",
        borderBottom: "2px solid #e0e0e0", fontWeight: "bold", color: "#000",
    },
    "& .MuiDataGrid-row": {
        backgroundColor: "white", cursor: "pointer",
        "&:hover": { backgroundColor: "#f0f0f0" },
    },
    "& .MuiDataGrid-row.Mui-selected": { backgroundColor: "#495dc524" },
    "& .MuiDataGrid-cell": { borderBottom: "1px solid #e0e0e0", color: "#666", fontSize: "14px" },
},
```
```typescript
// dataGridSxStyles.ts — passed via sx; hides footer + separators, sticky headers
border: "none",
"& .MuiDataGrid-columnHeaders": { position: "sticky", top: 0, zIndex: 1 },
"& .MuiDataGrid-footerContainer": { display: "none" },
"& .MuiDataGrid-columnSeparator": { display: "none" },
```
**Action column** (sticky-right edit/delete, gated, stops row-click):
```tsx
{ field: "actions", type: "actions", flex: 1, minWidth: 100, sortable: false,
  align: "right", renderHeader: () => null,
  renderCell: (params) => (
    <div className={classes.actionsContainer}>
      <PermissionControl actionName={editAction} mode="disable">
        {({ disabled }) => (
          <IconButton size="small" disabled={disabled} className={classes.iconButton}
            onClick={(e) => { e.stopPropagation(); onEdit(params.row); }}>
            <img src={EditIcon} className={disabled ? classes.editIconDisabled : classes.editIcon} />
          </IconButton>
        )}
      </PermissionControl>
      {/* delete icon: same shape, DeleteIcon, deleteAction */}
    </div>
  ),
}
```
**Rules:** DataGrid from `@mui/x-data-grid`; white, radius 15, **`border: 1px solid #495dc5`**; headers `#f5f5f5` fontSize 20 bold; rows pointer + hover `#f0f0f0`; selected `#495dc524`; cells `#666` 14px divider `#e0e0e0`; footer + column separators hidden; rows clickable (`onRowClick`); edit/delete are `IconButton`s in a sticky-right actions column, each wrapped in `<PermissionControl>` and calling `e.stopPropagation()`. Empty state = centered Typography "No data available", `#757575` 16px.

---

## 4. Dialog + form (add / edit)
Source: `AddItemDialog/AddItemDialog.tsx` + styles

```tsx
<Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
    <form onSubmit={handleSubmit}>
        <DialogTitle className={classes.dialogTitle}>{mode === "edit" ? `Edit ${title}` : title}</DialogTitle>
        <DialogContent className={classes.dialogContent}>{renderFormFields()}</DialogContent>
        <DialogActions className={classes.dialogActions}>
            <Button onClick={onClose} variant="outlined" className={classes.cancelButton}>Cancel</Button>
            <Button type="submit" variant="contained" className={classes.submitButton}>{mode === "edit" ? "Update" : "Add"}</Button>
        </DialogActions>
    </form>
</Dialog>
```
```typescript
dialogTitle:   { fontSize: "20px", fontWeight: 600, padding: "20px 24px" },
dialogContent: { padding: "20px 24px" },
dialogActions: { padding: "16px 24px", gap: "12px" },
```
**Rules:** `Dialog maxWidth="sm" fullWidth`; wrap the body in a `<form onSubmit>` so the submit button is `type="submit"`; title weight 600 / 20px; one create dialog reused for add **and** edit (title + button label switch on `mode`).

---

## 5. Tabs (segmented pill)
Source: `NavigationTab/NavigationTab.styles.ts`

```typescript
tab: {
    backgroundColor: "#C8CCDC80", color: "black",
    height: "20px", borderRadius: "30px", fontSize: "12px", minWidth: "45px",
    padding: "12px", textTransform: "initial", fontWeight: "normal",
    "&:hover": { backgroundColor: "#495dc5", color: "white" },
},
selectedTab: { backgroundColor: "#495dc5", color: "white" },
```
**Rules:** pill (radius 30), idle `#C8CCDC80` / black, hover + selected `#495dc5` / white, 12px, `textTransform: "initial"`.

---

## 6. Search field (pill)
Source: `TableSearch/TableSearch.styles.ts` (identical in `Store/appSearch`)

```typescript
searchBar: {
    "& .MuiInputBase-root": {
        height: "30px", borderRadius: "20px", fontSize: "12px", direction: "ltr",
        minWidth: "180px", maxWidth: "100%",
        border: "1px solid #C8CCDC",
        "&.Mui-focused": { border: "1px solid #495dc5!important" },
    },
},
```
**Rules:** height 30, radius 20, hairline `#C8CCDC`, focus `#495dc5`, 12px. This is the ONLY input that uses the pill/20-radius look; dialog form inputs use the default outlined look (§2).

---

## Token cross-check (the values that repeat everywhere)
`#495dc5` primary · `#3d4fa3` primary-hover · `#495dc550` disabled · `#495dc524` selected-row/app-tint · `#495dc510`/`#495dc530` menu hover/divider · `#C8CCDC` input hairline · `#f5f5f5` table header · `#e0e0e0` table divider · `#666`/`#757575` muted text · white surfaces · Poppins. Card/table radius 15, search/input-pill radius 20, tab pill radius 30, buttons rectangular (no pill in AAA).
