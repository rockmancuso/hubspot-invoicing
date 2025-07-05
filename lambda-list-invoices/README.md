# Lambda List Invoices

This AWS Lambda function lists invoice objects stored in S3 and returns their metadata.

## Function Overview

The `lambda-list-invoices` function:
- Lists objects in the configured S3 bucket with an optional prefix
- Retrieves metadata for each object
- Returns a JSON array of objects with their keys and metadata

## Dependencies

This function only requires:
- `aws-sdk` - For S3 operations

## Configuration

The function uses the following environment variables:
- `S3_REPORTS_BUCKET_NAME` - The S3 bucket containing invoice objects
- `AWS_REGION` - AWS region (defaults to 'us-east-1')

## Deployment

### Option 1: Using the deployment script (Recommended)

```bash
./deploy.sh
```

This script will:
1. Clean up any existing artifacts
2. Install only production dependencies
3. Create a deployment package excluding unnecessary files
4. Show the package size
5. Clean up node_modules

### Option 2: Using the clean deployment script

```bash
./deploy-clean.sh
```

This script uses a `.zipignore` file for even cleaner packaging.

### Option 3: Manual deployment

```bash
# Install dependencies
npm install --production

# Create deployment package
zip -r ../lambda-list-invoices.zip . \
  -x "*.git*" \
  -x "*.DS_Store*" \
  -x "*.log" \
  -x "deploy*.sh" \
  -x "package-lock.json" \
  -x "README.md" \
  -x "*.test.js" \
  -x "*.spec.js" \
  -x "test/*" \
  -x "tests/*"

# Clean up
rm -rf node_modules
```

## Usage

The function expects an API Gateway event with optional query parameters:
- `prefix` - Optional S3 key prefix to filter objects

### Example Request
```json
{
  "queryStringParameters": {
    "prefix": "invoices/2024/"
  }
}
```

### Example Response
```json
{
  "statusCode": 200,
  "body": "[{\"key\": \"invoices/2024/invoice-001.pdf\", \"metadata\": {\"company\": \"Example Corp\"}}]"
}
```

## File Structure

```
lambda-list-invoices/
├── index.js              # Main lambda handler
├── config/               # Configuration management
│   └── index.js
├── utils/                # Utility functions
│   ├── logger.js
│   ├── errorHandler.js
│   ├── configValidator.js
│   ├── reporting.js
│   └── storage.js
├── package.json          # Dependencies
├── deploy.sh            # Deployment script
├── deploy-clean.sh      # Alternative deployment script
├── .zipignore           # Files to exclude from deployment
└── README.md            # This file
```

## Troubleshooting

### Package Size Issues
If your deployment package is too large, ensure you're:
1. Using `npm install --production` to exclude dev dependencies
2. Excluding unnecessary files with the deployment script
3. Not including dependencies from other lambda functions

### Common Issues
- **Missing S3 bucket configuration**: Ensure `S3_REPORTS_BUCKET_NAME` is set
- **Permission errors**: Verify the lambda has S3 read permissions
- **Large package size**: Use the provided deployment scripts to create clean packages 