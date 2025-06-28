# API and Infrastructure Setup

This guide describes the additional AWS resources required when exposing the
invoice Lambda through an HTTP API and hosting the optional web UI.

## 1. Lambda Functions

- **HubSpotInvoicingProcessor** – main function that generates invoices.
- **(Optional) HubSpotInvoicingUIHandler** – lightweight handler used by the UI
  to trigger invoice generation.  This can simply proxy the event body to the
  main processor.

Package both handlers in `deploy.sh` by copying a `handlers/` directory if it
exists.

## 2. API Gateway

1. Create a new **HTTP API**.
2. Add a `POST /generate` route that invokes the `HubSpotInvoicingUIHandler` or
   directly invokes `HubSpotInvoicingProcessor`.
3. Enable CORS for `POST` requests from your UI domain.
4. Deploy to a stage (e.g. `prod`) and note the invoke URL.

## 3. S3 Static Web UI

1. Build the UI with `npm run build`.
2. Create an S3 bucket with static website hosting enabled.
3. Upload the contents of the build directory.
4. Optionally create a CloudFront distribution for HTTPS.
5. Configure the UI to call the API Gateway URL from above.

## 4. IAM Permissions

Ensure the Lambda role has permission to write to CloudWatch, read your HubSpot
secret from Secrets Manager, access S3 for PDF storage and reports, and if using
Mailgun, allow outbound internet access via a NAT gateway or VPC endpoint.

---

After provisioning these resources, deploy the Lambda with `deploy.sh` and test
the `/generate` endpoint using `curl` or the provided web UI.
