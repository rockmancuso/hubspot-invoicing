# HubSpot Invoicing Lambda

This project contains an AWS Lambda function designed to integrate with HubSpot for automatically generating and emailing invoices to companies with expiring memberships.

## Overview

The system runs monthly, triggered by a CloudWatch Event. It performs the following key operations:

1.  **Authenticates** with HubSpot using API credentials stored securely in AWS Secrets Manager.
2.  **Retrieves Data**: Queries the HubSpot API to identify companies whose memberships (tracked via a "Next Renewal Date" custom property on the "Company Memberships" custom object) are due for renewal at the end of the current month.
3.  **Calculates Prices**: Determines the correct invoice amount based on the company's membership type (Distributor, Manufacturer, or Service Provider) and its specific pricing structure (e.g., base fees, per-territory charges, sales volume tiers).
4.  **Generates Invoices**: Creates new invoices within HubSpot using the HubSpot Invoices API, adding appropriate HubSpot products as line items.
5.  **Updates Data**: Writes the total invoiced amount back to a specified membership dues property on the company record in HubSpot for record-keeping.
6.  **Delivers Emails**: Utilizes HubSpot's email functionality to send the generated invoices to the primary contact associated with each company.
7.  **Reporting**: Generates a monthly summary report of all invoices created and stores it in an S3 bucket. Error notifications and reports can be emailed via Amazon SES.
8.  **Error Handling**: Implements robust error logging to CloudWatch and sends notifications for critical failures.

Refer to the [`hubspot-invoicing-architecture.md`](hubspot-invoicing-architecture.md) document for a detailed system architecture and design.

## Testing and Development

The Lambda function supports several testing modes that can be controlled via the event payload:

### Test Flags

- **`dry_run`**: When set to `true`, the function runs in dry-run mode without creating any HubSpot records or storing files in S3.
- **`pdf_test_limit`**: Limits the number of members processed for PDF generation testing.
- **`full_test_limit`**: Limits the number of members processed for full end-to-end testing.
- **`keep_draft`**: When set to `true`, invoices are created but kept in "draft" status instead of being set to "open". This is useful for testing invoice creation without making them payable.
- **`contact_id`**: Process a single individual contact by HubSpot ID.
- **`company_id`**: Process a single company membership by HubSpot company ID.
- **`pdf_only`**: Generate PDFs without creating invoices in HubSpot.

### Example Test Payloads

```json
// Dry run - no data written
{
  "dry_run": true
}

// PDF test with limited members
{
  "pdf_test_limit": 3
}

// Full test with limited members
{
  "full_test_limit": 2
}

// Keep invoices in draft status for testing
{
  "keep_draft": true,
  "full_test_limit": 2
}

// Process a single contact and generate PDF only
{
  "contact_id": "123",
  "pdf_only": true
}

// Process a single company
{
  "company_id": "456"
}
```

## Project Structure

```
/
├── src/
│   ├── index.js                # Lambda entry point
│   ├── hubspot/
│   │   ├── client.js           # HubSpot API client setup
│   │   ├── companies.js        # Company data retrieval
│   │   ├── contacts.js         # Contact data operations
│   │   └── invoices.js         # Invoice generation
│   ├── pricing/
│   │   ├── distributor.js      # Distributor pricing calculation
│   │   ├── manufacturer.js     # Manufacturer tier pricing
│   │   └── serviceProvider.js  # Service provider pricing
│   ├── utils/
│   │   ├── logger.js           # Logging utilities
│   │   ├── error-handler.js    # Error handling
│   │   └── reporting.js        # Report generation
│   └── config/
│       └── index.js            # Configuration management
├── tests/
│   ├── unit/
│   │   ├── pricing/
│   │   └── hubspot/
│   └── integration/
├── package.json                # Project dependencies and scripts
├── serverless.yml              # Optional: Infrastructure as Code (e.g., Serverless Framework)
├── hubspot-invoicing-architecture.md # Detailed architecture plan
└── README.md                   # This file
```

## Setup and Deployment

(Details to be added regarding AWS setup, environment variables, and deployment process.)

## Dependencies

-   `@hubspot/api-client`: For interacting with the HubSpot API.
-   `aws-sdk`: For interacting with AWS services like Secrets Manager, S3, SES, and CloudWatch.

## Configuration

The Lambda function will require configuration for:
-   HubSpot API Key (via Secrets Manager)
-   Names of relevant HubSpot custom properties (e.g., "Next Renewal Date", sales volume, territory counts, membership dues)
-   S3 bucket name for reports
-   SES email addresses for notifications and reports

(Further details to be added.)