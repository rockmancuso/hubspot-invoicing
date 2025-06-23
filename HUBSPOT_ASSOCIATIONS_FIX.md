# HubSpot V4 Associations API Fix

## 🐛 Issues Fixed

### 1. **Incorrect Parameter Structure**
**Before (❌ Wrong):**
```javascript
await hubspotClient.crm.associations.v4.basicApi.create(
  config.HUBSPOT_INVOICE_OBJECT_TYPE_ID,
  invoiceId,
  'contacts',
  contactId,
  [{  // ❌ WRONG: Wrapped in array
    associationCategory: 'HUBSPOT_DEFINED',
    associationTypeId: config.HUBSPOT_ASSOCIATION_TYPE_ID_INVOICE_TO_CONTACT || 1
  }]
);
```

**After (✅ Correct):**
```javascript
await hubspotClient.crm.associations.v4.basicApi.create(
  'invoice',  // ✅ Use object type name, not ID
  invoiceId.toString(),
  'contact',  // ✅ Use object type name, not ID
  contactId.toString(),
  {  // ✅ Direct object, not wrapped in array
    associationCategory: 'HUBSPOT_DEFINED',
    associationTypeId: parseInt(associationTypeId, 10)
  }
);
```

### 2. **Undefined Configuration Values**
**Before (❌ No validation):**
```javascript
// Could cause undefined errors if config values are missing
associationTypeId: config.HUBSPOT_ASSOCIATION_TYPE_ID_INVOICE_TO_CONTACT || 1
```

**After (✅ With validation):**
```javascript
// Validates all required config values before proceeding
function validateInvoiceConfig() {
  const requiredConfigs = [
    'HUBSPOT_INVOICE_OBJECT_TYPE_ID',
    'HUBSPOT_ASSOCIATION_TYPE_ID_INVOICE_TO_CONTACT',
    'HUBSPOT_ASSOCIATION_TYPE_ID_INVOICE_TO_COMPANY',
    'HUBSPOT_ASSOCIATION_TYPE_ID_INVOICE_TO_LINE_ITEM'
  ];
  // Throws error if any are missing
}
```

### 3. **Object Type Name Mapping**
**Before (❌ Using object type IDs):**
```javascript
// Using object type IDs like 'p_invoice' or numeric IDs
config.HUBSPOT_INVOICE_OBJECT_TYPE_ID  // Could be 'p_invoice' or '123'
```

**After (✅ Using V4 API names):**
```javascript
// Maps to correct V4 API object type names
function getObjectTypeName(objectTypeId) {
  const objectTypeMap = {
    'invoice': 'invoice',
    'p_invoice': 'invoice',
    'contacts': 'contact',
    'companies': 'company',
    'line_items': 'line_item'
  };
  return objectTypeMap[objectTypeId] || objectTypeId;
}
```

## 🔧 Required Environment Variables

You need to set these environment variables:

```bash
# HubSpot Association Type IDs (REQUIRED)
HUBSPOT_ASSOCIATION_TYPE_ID_INVOICE_TO_CONTACT=177
HUBSPOT_ASSOCIATION_TYPE_ID_INVOICE_TO_COMPANY=179
HUBSPOT_ASSOCIATION_TYPE_ID_INVOICE_TO_LINE_ITEM=3
HUBSPOT_ASSOCIATION_TYPE_ID_CONTACT_TO_INVOICE=177
```

## 🔍 How to Find Association Type IDs

1. **Go to your HubSpot portal**
2. **Navigate to Settings > Objects > Invoices**
3. **Check the Associations tab**
4. **Note the Association Type IDs for:**
   - Invoice to Contact
   - Invoice to Company  
   - Invoice to Line Item
5. **Set these values in your environment variables**

## 🧪 Testing Your Configuration

### 1. Validate Configuration
```bash
node validate-config.js
```

### 2. Test Association Structure
```bash
node test-associations.js
```

## 📁 Files Modified

### 1. `src/hubspot/invoices.js`
- ✅ Fixed V4 associations API calls
- ✅ Added configuration validation
- ✅ Added object type name mapping
- ✅ Added error handling for missing parameters
- ✅ Created reusable `createAssociation()` function

### 2. `src/utils/configValidator.js` (New)
- ✅ Configuration validation utility
- ✅ Detailed error reporting
- ✅ Environment variable templates

### 3. `validate-config.js` (New)
- ✅ Standalone configuration validator
- ✅ Helpful error messages and guidance

### 4. `test-associations.js` (New)
- ✅ Tests association API structure
- ✅ Validates object type mapping
- ✅ Shows example API calls

## 🚀 Usage Examples

### Creating an Invoice with Associations
```javascript
const { createInvoice } = require('./src/hubspot/invoices');

const invoiceData = {
  contactId: '123456',
  companyId: '789012',
  invoiceAmount: 1500,
  lineItems: [
    {
      name: 'Membership Fee',
      quantity: 1,
      price: 1500,
      description: 'Annual membership'
    }
  ],
  pdfLink: 'https://example.com/invoice.pdf'
};

const invoice = await createInvoice(hubspotClient, invoiceData);
```

### Validating Configuration
```javascript
const { validateHubSpotConfig } = require('./src/utils/configValidator');

const results = validateHubSpotConfig();
if (results.missing.length > 0) {
  console.log('Missing configs:', results.missing);
}
```

## 🔒 Security Notes

- **Never hardcode API keys** in your code
- **Use environment variables** or AWS Secrets Manager
- **Validate all configuration** before making API calls
- **Handle errors gracefully** to avoid exposing sensitive information

## 📚 Additional Resources

- [HubSpot V4 Associations API Documentation](https://developers.hubspot.com/docs/api/crm/associations)
- [HubSpot Node.js SDK](https://developers.hubspot.com/docs/api/crm/associations#batch-create-associations)
- [HubSpot Object Types Reference](https://developers.hubspot.com/docs/api/crm/properties)

## ✅ Checklist

- [ ] Set `HUBSPOT_ASSOCIATION_TYPE_ID_INVOICE_TO_CONTACT`
- [ ] Set `HUBSPOT_ASSOCIATION_TYPE_ID_INVOICE_TO_COMPANY`
- [ ] Set `HUBSPOT_ASSOCIATION_TYPE_ID_INVOICE_TO_LINE_ITEM`
- [ ] Run `node validate-config.js` to verify
- [ ] Test with a small invoice creation
- [ ] Monitor logs for any remaining errors

## 🆘 Troubleshooting

### "Missing required configuration" Error
- Run `node validate-config.js` to see what's missing
- Check your environment variables
- Verify association type IDs in your HubSpot portal

### "Association creation failed" Error
- Verify object IDs exist in HubSpot
- Check association type IDs are correct
- Ensure you have proper API permissions

### "Object type not found" Error
- Verify object type names in the mapping function
- Check if you're using custom object types
- Update the `getObjectTypeName()` function if needed 