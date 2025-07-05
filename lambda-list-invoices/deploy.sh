#!/bin/bash

# Lambda deployment script for lambda-list-invoices
# This script creates a clean deployment package with only the required dependencies

set -e  # Exit on any error

echo "🚀 Starting deployment for lambda-list-invoices..."

# Clean up any existing deployment artifacts
echo "🧹 Cleaning up previous deployment artifacts..."
rm -rf node_modules
rm -f ../lambda-list-invoices.zip

# Install only the dependencies needed for this lambda function
echo "📦 Installing dependencies..."
npm install --production

# Create the deployment package
echo "📦 Creating deployment package..."
zip -r ../lambda-list-invoices.zip . \
  -x "*.git*" \
  -x "*.DS_Store*" \
  -x "*.log" \
  -x "deploy.sh" \
  -x "package-lock.json" \
  -x "README.md" \
  -x "*.test.js" \
  -x "*.spec.js" \
  -x "test/*" \
  -x "tests/*"

echo "✅ Deployment package created: ../lambda-list-invoices.zip"
echo "📊 Package size: $(du -h ../lambda-list-invoices.zip | cut -f1)"

# Optional: Clean up node_modules after packaging
echo "🧹 Cleaning up node_modules..."
rm -rf node_modules

echo "🎉 Deployment package ready!" 