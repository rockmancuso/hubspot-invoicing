# API and Infrastructure Setup

This guide describes the additional AWS resources required when exposing the
invoice Lambda functions through an HTTP API and hosting the optional web UI.

## 1. Lambda Functions

The system consists of multiple specialized Lambda functions:

- **`generate-invoice`** – Main function that generates invoices from HubSpot data
- **`list-invoices`** – Lists invoice objects stored in S3 with metadata
- **`get-invoice`** – Retrieves a specific invoice by ID
- **`download-invoice`** – Downloads/streams invoice files (PDFs)

Each function should be deployed separately with its own deployment package.

## 2. API Gateway

1. Create a new **HTTP API**.
2. Add the following routes:
   - `POST /generate` → `generate-invoice` Lambda
   - `GET /invoices` → `list-invoices` Lambda
   - `GET /invoices/{id}` → `get-invoice` Lambda
   - `GET /invoices/{id}/download` → `download-invoice` Lambda
3. Enable CORS for all routes from your UI domain.
4. Deploy to a stage (e.g. `prod`) and note the invoke URL.

### Route Parameters
- `{id}` should be configured as a path parameter in API Gateway
- Ensure proper parameter mapping to Lambda event objects

## 3. Lambda Environment Variables

### generate-invoice
- `HUBSPOT_API_KEY` or `HUBSPOT_API_KEY_SECRET_ID`
- `S3_REPORTS_BUCKET_NAME`
- Various HubSpot configuration variables (see config files)

### list-invoices
- `S3_REPORTS_BUCKET_NAME` (required)
- `AWS_REGION` (optional, defaults to us-east-1)

### get-invoice
- `S3_REPORTS_BUCKET_NAME` (required)
- `AWS_REGION` (optional)

### download-invoice
- `S3_REPORTS_BUCKET_NAME` (required)
- `AWS_REGION` (optional)

## 4. S3 Static Web UI

1. Build the UI with `npm run build`.
2. Create an S3 bucket with static website hosting enabled.
3. Upload the contents of the build directory.
4. Optionally create a CloudFront distribution for HTTPS.
5. Configure the UI to call the API Gateway URL from above.

## 5. IAM Permissions

### Lambda Execution Role
Ensure each Lambda function's execution role has:

- **CloudWatch Logs**: Write permissions for logging
- **S3 Access**: 
  - Read/Write access to your invoice bucket
  - Read access for list-invoices and get-invoice
  - Read access for download-invoice
- **Secrets Manager**: Read access to HubSpot API key (for generate-invoice)
- **Internet Access**: If using external APIs (HubSpot, Mailgun)

### S3 Bucket Policy
Configure bucket policy to allow Lambda access and optionally public read access for downloads.

## 6. Deployment

Each Lambda function has its own deployment script:
```bash
# Deploy each function
cd lambda-generate-invoice && ./deploy.sh
cd lambda-list-invoices && ./deploy.sh
cd lambda-get-invoice && ./deploy.sh
cd lambda-download-invoice && ./deploy.sh
```

## 7. Testing

Test each endpoint:
```bash
# Generate invoice
curl -X POST https://your-api-gateway-url/prod/generate

# List invoices
curl https://your-api-gateway-url/prod/invoices

# Get specific invoice
curl https://your-api-gateway-url/prod/invoices/invoice-123

# Download invoice
curl https://your-api-gateway-url/prod/invoices/invoice-123/download
```

---

After provisioning these resources, deploy all Lambda functions and test each endpoint using `curl` or the provided web UI.
