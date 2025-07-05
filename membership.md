# CLA Membership System - Property Overview (FROM HUBSPOT INVOICING LAMBDA Function )

This document provides a comprehensive overview of all membership and user-profile related properties used in the CLA (Coin Laundry Association) membership system. This information is derived from the HubSpot invoicing codebase and is designed to help agents building new membership processing applications.

## Table of Contents

1. [Membership Types](#membership-types)
2. [Company Membership Properties](#company-membership-properties)
3. [Individual Membership Properties](#individual-membership-properties)
4. [Contact Properties](#contact-properties)
5. [Pricing Structure](#pricing-structure)
6. [HubSpot Object Relationships](#hubspot-object-relationships)
7. [Configuration Properties](#configuration-properties)

## Membership Types

The system supports four main membership types:

1. **Distributor** - Companies that distribute coin laundry equipment and supplies
2. **Manufacturer** - Companies that manufacture coin laundry equipment and products  
3. **Service Provider** - Companies that provide services to the coin laundry industry
4. **Individual** - Individual professionals in the coin laundry industry

## Company Membership Properties

### Core Company Properties
- **`name`** - Company name
- **`address`** - Company street address
- **`city`** - Company city
- **`state`** - Company state/province (used for home state determination)
- **`zip`** - Company postal code
- **`annual_sales_volume`** - Annual sales volume (used for business classification)
- **`number_of_territories`** - Number of territories the company operates in

### Membership Type Classification
- **`membership_type`** - Primary membership classification property
  - Values: "Distributor", "Manufacturer", "Service Provider"

### Membership Status & Renewal
- **`paid_through_date`** - Date when current membership expires (used for renewal tracking)
- **`membership_dues`** - Current membership dues amount (updated after invoice generation)

### Distributor-Specific Properties
- **`distributor_us_states`** - Multi-checkbox property for US states (semicolon-separated values like "CA;NV;AZ")
- **`distributor_canadian_provinces`** - Multi-checkbox property for Canadian provinces
- **`distributor_non_na_territories`** - Multi-checkbox property for non-North American territories

### Manufacturer-Specific Properties
- **`manufacturer_membership_level`** - Membership level property containing pricing information
  - Format: String values like "$1,500", "$3,500", "$5,000", "$7,500", "$10,000"
  - May include additional context like "$1,500 (<$5M)" where the price is extracted from before parentheses

## Individual Membership Properties

### Core Individual Properties
- **`firstname`** - Individual's first name
- **`lastname`** - Individual's last name
- **`email`** - Individual's email address
- **`address`** - Individual's street address
- **`city`** - Individual's city
- **`state`** - Individual's state/province
- **`zip`** - Individual's postal code

### Individual Membership Status
- **`paid_through_date`** - Date when individual membership expires (used for renewal tracking)

## Contact Properties

### Standard Contact Fields
- **`email`** - Contact email address
- **`firstname`** - Contact first name
- **`lastname`** - Contact last name
- **`address`** - Contact street address
- **`city`** - Contact city
- **`state`** - Contact state/province
- **`zip`** - Contact postal code

### Contact Associations
- **Primary Contact Association** - Links companies to their primary contact person
- **Association Type ID**: Configurable (typically numeric ID for 'company_to_contact' primary relationship)

## Pricing Structure

### Distributor Pricing
- **Base Fee**: $929 (configurable via `DISTRIBUTOR_BASE_FEE`)
- **Per Territory Fee**: $70 (configurable via `DISTRIBUTOR_TERRITORY_FEE`)
- **Home State**: Free (excluded from billing calculations)
- **Billing Logic**: Base fee + ($70 × number of additional territories excluding home state)

### Manufacturer Pricing
- **Dynamic Pricing**: Based on `manufacturer_membership_level` property
- **Available Tiers**: $1,500, $3,500, $5,000, $7,500, $10,000
- **Default Fee**: $1,500 (when membership level property is missing)
- **Product IDs**: Mapped to specific HubSpot product IDs for each tier

### Service Provider Pricing
- **Flat Fee**: $1,250 (configurable via `SERVICE_PROVIDER_FLAT_FEE`)
- **Fixed Rate**: No additional charges or tiers

### Individual Pricing
- **Flat Fee**: $349 (configurable via `INDIVIDUAL_MEMBERSHIP_FEE`)
- **Fixed Rate**: No additional charges

## HubSpot Object Relationships

### Company Membership Object (Custom Object)
- **Object Type ID**: `2-45511388`
- **Properties**:
  - `company_membership_name`
  - `company_name`
  - `status`
  - `paid_through_date`
  - `distributor_us_states`
  - `distributor_canadian_provinces`
  - `distributor_non_na_territories`
  - `manufacturer_membership_level`

### Invoice Object
- **Object Type ID**: Configurable (typically 'invoice' or numeric ID)
- **Properties**:
  - `hs_invoice_amount` - Invoice total amount
  - `hs_due_date` - Invoice due date
  - `hs_billing_contact_id` - Billing contact ID
  - `hs_currency_code` - Currency (default: USD)
  - `hs_status` - Invoice status (DRAFT, SENT, PAID)
  - `printable_invoice_url` - PDF invoice link

### Line Items Object
- **Object Type ID**: Configurable (typically 'line_items' or numeric ID)
- **Properties**: Individual line items for invoice breakdown

## Configuration Properties

### Environment Variables
The system uses environment variables for configuration, with these key properties:

#### HubSpot Property Mappings
- `HUBSPOT_NEXT_RENEWAL_DATE_PROPERTY` - Property name for renewal date
- `HUBSPOT_MEMBERSHIP_TYPE_PROPERTY` - Property name for membership type
- `HUBSPOT_MANUFACTURER_MEMBERSHIP_LEVEL_PROPERTY` - Property name for manufacturer level
- `HUBSPOT_INDIVIDUAL_PAID_THROUGH_DATE_PROPERTY` - Property name for individual renewal date

#### Distributor Territory Properties
- `HUBSPOT_DISTRIBUTOR_US_STATES_CHECKBOX_PROPERTY` - US states checkbox property
- `HUBSPOT_DISTRIBUTOR_CAN_PROVINCES_CHECKBOX_PROPERTY` - Canadian provinces checkbox property
- `HUBSPOT_DISTRIBUTOR_NON_NA_TERRITORIES_CHECKBOX_PROPERTY` - Non-NA territories checkbox property

#### Pricing Configuration
- `DISTRIBUTOR_BASE_FEE` - Distributor base membership fee
- `DISTRIBUTOR_TERRITORY_FEE` - Per-territory fee for distributors
- `MANUFACTURER_DEFAULT_FEE` - Default manufacturer fee when level is missing
- `SERVICE_PROVIDER_FLAT_FEE` - Service provider flat fee
- `INDIVIDUAL_MEMBERSHIP_FEE` - Individual membership fee

#### Association Type IDs
- `HUBSPOT_ASSOCIATION_TYPE_ID_INVOICE_TO_COMPANY` - Invoice-to-company association
- `HUBSPOT_ASSOCIATION_TYPE_ID_INVOICE_TO_CONTACT` - Invoice-to-contact association
- `HUBSPOT_PRIMARY_CONTACT_ASSOCIATION_TYPE_ID` - Primary contact association

## Data Processing Notes

### Territory Handling
- Distributor territories are stored as semicolon-separated values
- Home state is automatically excluded from billing calculations
- State names are normalized (e.g., "California" → "CA", "West Virginia" → "WV")

### Membership Level Parsing
- Manufacturer membership levels are parsed to extract dollar amounts
- Format: "$1,500 (<$5M)" → extracts $1500
- Handles various formats including currency symbols and commas

### Renewal Date Logic
- Uses `paid_through_date` property for both company and individual memberships
- Calculates target dates for invoice generation
- Supports month offset and day-of-month configuration

### Invoice Generation
- Creates HubSpot invoice records with line items
- Generates PDF invoices with payment links and QR codes
- Associates invoices with companies and contacts
- Updates membership dues property after successful invoice creation

## Integration Considerations

### Required Properties for New Memberships
When processing new memberships, ensure these properties are captured:

**For Companies:**
- Company name, address, city, state, zip
- Membership type (Distributor/Manufacturer/Service Provider)
- Annual sales volume
- Primary contact information
- Territory selections (for Distributors)
- Membership level (for Manufacturers)

**For Individuals:**
- First name, last name, email
- Address, city, state, zip
- Membership type (Individual)

### Validation Requirements
- All address fields should be validated for completeness
- Email addresses should be properly formatted
- Territory selections should be validated against allowed values
- Membership levels should match expected pricing tiers

### Data Consistency
- Ensure consistent state/province naming conventions
- Validate territory selections don't include invalid combinations
- Check that membership types align with business classifications
- Verify contact information completeness for billing purposes 