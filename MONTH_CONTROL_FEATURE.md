# Month Control Feature for Invoice Generation

## Overview

The month control feature allows you to control which month's expiring memberships should generate invoices. This is particularly useful for generating invoices early, giving members plenty of time to renew before their membership expires.

## Configuration Options

### Environment Variables

Add these environment variables to control invoice generation timing:

```bash
# Month offset (0 = current month, 1 = next month, 2 = two months ahead, etc.)
INVOICE_GENERATION_MONTH_OFFSET=1

# Day of month (0 = last day of month, 1-31 = specific day)
INVOICE_GENERATION_DAY_OF_MONTH=0
```

### Default Behavior

If not configured, the system defaults to:
- `INVOICE_GENERATION_MONTH_OFFSET=0` (current month)
- `INVOICE_GENERATION_DAY_OF_MONTH=0` (last day of month)

This means invoices are generated for members expiring on the last day of the current month.

## Common Use Cases

### 1. Early Billing (Recommended)

Generate invoices this month for members expiring next month:

```bash
INVOICE_GENERATION_MONTH_OFFSET=1
INVOICE_GENERATION_DAY_OF_MONTH=0
```

**Example**: If run in January, this will generate invoices for members expiring on January 31st (last day of January).

### 2. Very Early Billing

Generate invoices this month for members expiring in two months:

```bash
INVOICE_GENERATION_MONTH_OFFSET=2
INVOICE_GENERATION_DAY_OF_MONTH=0
```

**Example**: If run in January, this will generate invoices for members expiring on February 28th/29th.

### 3. Specific Day Billing

Generate invoices for members expiring on a specific day of next month:

```bash
INVOICE_GENERATION_MONTH_OFFSET=1
INVOICE_GENERATION_DAY_OF_MONTH=15
```

**Example**: If run in January, this will generate invoices for members expiring on February 15th.

### 4. Current Month Billing (Default)

Generate invoices for members expiring this month:

```bash
INVOICE_GENERATION_MONTH_OFFSET=0
INVOICE_GENERATION_DAY_OF_MONTH=0
```

## Testing the Configuration

Run the test script to see how different configurations affect the target date:

```bash
node test-month-control.js
```

This will show you:
- Current date and month
- Target dates for different configurations
- Days from now to the target date
- Example environment variable settings

## How It Works

1. **Target Date Calculation**: The system calculates a target date based on your configuration
2. **Membership Search**: It searches for members whose expiration date matches the target date
3. **Invoice Generation**: Invoices are generated for those members

### Date Calculation Logic

```javascript
// Example: INVOICE_GENERATION_MONTH_OFFSET=1, INVOICE_GENERATION_DAY_OF_MONTH=0
// If today is January 15, 2024:
// - Target month = January + 1 = February
// - Target day = last day of February = February 29, 2024 (leap year)
// - Target timestamp = February 29, 2024 00:00:00 UTC
```

## Implementation Details

The feature modifies these functions:

- `calculateTargetDate()` in `src/hubspot/invoices.js` - Calculates the target date
- `getExpiringCompanyMemberships()` in `src/hubspot/companies.js` - Uses target date for company searches
- `getExpiringIndividualMemberships()` in `src/hubspot/contacts.js` - Uses target date for individual searches

## Migration from Current System

The current system generates invoices for members expiring at the end of the current month. To maintain this behavior, either:

1. **Don't set the new environment variables** (uses defaults)
2. **Explicitly set**: `INVOICE_GENERATION_MONTH_OFFSET=0` and `INVOICE_GENERATION_DAY_OF_MONTH=0`

## Best Practices

1. **Start with offset=1**: Generate invoices one month early to give members time to renew
2. **Test first**: Use the test script to verify your configuration
3. **Monitor results**: Check the logs to ensure the correct members are being processed
4. **Consider business cycles**: Align with your billing and renewal processes

## Troubleshooting

### No invoices generated
- Check that the target date matches members' expiration dates in HubSpot
- Verify the environment variables are set correctly
- Run the test script to confirm the target date calculation

### Wrong members getting invoices
- Verify the expiration date properties in HubSpot match your configuration
- Check that the target date calculation is correct for your use case
- Review the logs to see which target date is being used

### Date format issues
- The system uses UTC timestamps for consistency
- HubSpot date properties should be in the same format as the target date
- Use the test script to verify date calculations 