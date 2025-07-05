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
- **`contact_id`**: Process only the specified contact ID.
- **`company_id`**: Process only the specified company ID.
- **`pdf_only`**: Generates the PDF invoice but does not create HubSpot records.
- **`clear_state`**: Clears any stored processing state so a run starts fresh.
- **`contact_id`**: Process only the single individual contact by HubSpot ID.
- **`company_id`**: Process only the single company membership by HubSpot company ID.
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

// Generate an invoice only for a specific contact
{
  "contact_id": "123",
  "pdf_only": false
}

// Generate an invoice only for a specific company and skip HubSpot creation
{
  "company_id": "456",
  "pdf_only": true
  
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
├── hubspot-invoicing-architecture.md # Detailed architecture plan
└── README.md                   # This file
```

## Setup and Deployment

The project is made up of two pieces: the invoice processing Lambda and a small
web UI that calls a new API endpoint.  The UI can be hosted from an S3 bucket
while the API is exposed through Amazon API Gateway which triggers this Lambda.

### 1. Deploy the Lambda

1. Run `./deploy.sh` to build the deployment package and upload it to AWS.
2. Set the environment variables listed in the **Configuration** section on the
   Lambda function.  Secrets such as the HubSpot API key should be stored in
   **AWS Secrets Manager** and referenced by name.
3. Increase the function timeout to at least five minutes so large batches can
   complete.

### 2. Deploy the UI

1. Build the UI (from the `ui/` directory if present) with `npm run build`.
2. Create an S3 bucket configured for static website hosting and upload the
   contents of the build directory.
3. (Optional) Front the bucket with a CloudFront distribution for HTTPS access.
4. Update the API endpoint URL in the UI configuration to point to the API
   Gateway stage created in the next step.

### 3. Create the API Gateway Endpoint

1. Create a new **HTTP API** in API Gateway.
2. Add a `POST /generate` route that integrates with the Lambda function.
3. Enable CORS so the static UI can call the API from the browser.
4. Deploy the API to a stage and note the invoke URL.

### 4. Example API Call

```bash
curl -X POST https://vth5uby0o0.execute-api.us-east-1.amazonaws.com/prod/generate \
  -d '{"contact_id":"123","pdf_only":true}'
```

This triggers the Lambda to generate a PDF for a single contact without creating
records in HubSpot.

For a deeper look at the required AWS resources see
[`docs/API_INFRASTRUCTURE_GUIDE.md`](docs/API_INFRASTRUCTURE_GUIDE.md).

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
## React UI

A lightweight React single-page application is located in the `ui/` directory. It provides two pages:

- **Invoice List** – displays invoices retrieved from `/invoices` and provides links to view or download each invoice.
- **Generate** – form interface to trigger the `/generate` endpoint with options for run type, limits and optional IDs.

### Building and Deploying

```bash
cd ui
npm install
npm run build
```

Set the `S3_BUCKET` environment variable to your destination bucket and run:

```bash
npm run deploy
```

This syncs the `ui/dist` directory to the specified S3 bucket. If you use CloudFront, create an invalidation after syncing.

### Environment Variables

The UI reads the API base URL from `VITE_API_URL` at build time. Set this variable to the domain hosting the API endpoints (e.g. `https://api.example.com`).
