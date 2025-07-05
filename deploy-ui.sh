#!/bin/bash
cd ui
export S3_BUCKET=s3://hubspot-invoicing-ui
export VITE_API_URL=https://vth5uby0o0.execute-api.us-east-1.amazonaws.com
npm run deploy
