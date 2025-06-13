# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an AWS Lambda function that automates HubSpot invoice generation for companies with expiring memberships. The system runs monthly via CloudWatch Events, calculates pricing based on membership type (Distributor, Manufacturer, Service Provider), and generates invoices using the HubSpot API.

## Commands

```bash
# Run locally
npm start

# Install dependencies  
npm install

# Note: No test command configured - update package.json if tests are added
```

## Architecture

### Core Flow
1. **Data Retrieval**: Query HubSpot for companies with memberships expiring at month-end
2. **Price Calculation**: Apply membership-specific pricing rules
3. **Invoice Generation**: Create invoices via HubSpot API with line items
4. **Reporting**: Generate monthly summary reports stored in S3

### Module Structure
- `src/index.js` - Lambda entry point orchestrating the complete invoice generation flow
- `src/hubspot/` - HubSpot API integration (client, companies, contacts, invoices)
- `src/pricing/` - Membership-specific pricing calculations:
  - Distributor: $929 base + $70 per territory
  - Manufacturer: Tiered pricing based on sales volume ($1,500-$10,000)
  - Service Provider: Flat $1,250
- `src/utils/` - Logging, error handling, and S3 report generation
- `src/config/` - Centralized environment variable management

### Key Dependencies
- `@hubspot/api-client` for HubSpot API integration
- `aws-sdk` for S3, SES, and Secrets Manager

## Configuration

All configuration is centralized in `src/config/index.js` using environment variables. Critical configs include:
- HubSpot API credentials (via AWS Secrets Manager or env var)
- HubSpot property names for membership data
- S3 bucket for reports
- SES email settings for notifications

## Error Handling

The system implements comprehensive error handling:
- Individual company failures don't stop batch processing
- Detailed CloudWatch logging with company IDs for troubleshooting
- Optional SES notifications for critical failures
- Monthly reports include both successful and failed invoices

## HubSpot Integration

Uses custom properties on Company objects:
- Membership type (Distributor/Manufacturer/Service Provider)
- Next renewal date for filtering
- Territory counts (Distributors) or membership levels (Manufacturers)
- Membership dues amount (updated after invoice creation)