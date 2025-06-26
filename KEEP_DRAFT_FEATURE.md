# Keep Draft Feature

## Overview

The `keep_draft` flag is a new testing feature that allows you to create invoices in HubSpot without setting them to "open" status. This is particularly useful for testing purposes when you want to verify invoice creation without making the invoices payable.

## How It Works

When the `keep_draft` flag is set to `true` in the Lambda event payload:

1. **Invoice Creation**: Invoices are created normally in HubSpot with all associations (contact, company, line items)
2. **Status Control**: Instead of setting the invoice status to "open", the invoice remains in "draft" status
3. **PDF Generation**: PDFs are still generated and stored in S3
4. **Payment Links**: Payment links may not be available since the invoice is not in "open" status

## Usage

### Lambda Event Payload

```json
{
  "keep_draft": true,
  "full_test_limit": 2
}
```

### Parameters

- **`keep_draft`** (boolean): When `true`, invoices are kept in draft status
- **`full_test_limit`** (optional, number): Limits the number of members processed for testing

## Benefits

1. **Safe Testing**: Test invoice creation without creating payable invoices
2. **Data Validation**: Verify that all invoice data, associations, and PDFs are generated correctly
3. **HubSpot Integration**: Test the full HubSpot integration without affecting billing
4. **Development**: Useful during development and testing phases

## Example Scenarios

### Scenario 1: Development Testing
```json
{
  "keep_draft": true,
  "full_test_limit": 1
}
```
- Creates 1 invoice in draft status
- Generates PDF and stores in S3
- Tests all associations and data flow

### Scenario 2: Production Testing
```json
{
  "keep_draft": true,
  "full_test_limit": 5
}
```
- Creates 5 invoices in draft status
- Allows testing with multiple membership types
- Validates pricing calculations

### Scenario 3: Combined with Other Flags
```json
{
  "keep_draft": true,
  "dry_run": false,
  "full_test_limit": 3
}
```
- Creates real HubSpot records (not dry run)
- Keeps invoices in draft status
- Processes 3 members

## Logging

When `keep_draft` is enabled, you'll see these log messages:

```
--- KEEPING INVOICES IN DRAFT STATUS --- Invoices will not be set to "open" status.
Creating HubSpot invoice record for Company ID: 123, Contact ID: 456, Amount: 929, Keep Draft: true
Step 3: Updating invoice properties (keeping in draft status)...
Invoice 789 updated with properties: { hs_due_date: '2024-02-15' }
Invoice kept in draft status - invoice is not yet payable
```

## Important Notes

1. **Payment Links**: Invoices in draft status may not have payment links available
2. **HubSpot Workflow**: Draft invoices won't trigger HubSpot's automatic email workflows
3. **Manual Review**: You can manually review and approve draft invoices in HubSpot
4. **Status Change**: You can manually change invoice status from draft to open in HubSpot when ready

## Testing Workflow

1. **Run with `keep_draft: true`** to create test invoices
2. **Review invoices** in HubSpot to verify data and associations
3. **Check PDFs** in S3 to ensure proper generation
4. **Manually approve** invoices in HubSpot when ready for production
5. **Run without `keep_draft`** for production use

## Related Files

- `src/index.js`: Lambda handler with flag processing
- `src/hubspot/invoices.js`: Invoice creation logic with status control
- `test-keep-draft.json`: Example test payload
- `README.md`: Updated documentation 