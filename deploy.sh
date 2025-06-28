#!/bin/bash

# This script prepares and deploys the HubSpot Invoicing Lambda function.
# It now creates a lean deployment package by excluding the large Chromium
# dependency, which is provided by the Lambda Layer instead.

# --- Configuration ---
FUNCTION_NAME="HubSpotInvoicingProcessor"
AWS_REGION="us-east-1"
DIST_DIR="dist"
PACKAGE_DIR="${DIST_DIR}/package"

# --- THIS IS THE FIRST FIX ---
# The variable now holds ONLY the filename, not the path.
DATE=$(date +%Y%m%d%H%M%S)
ZIP_FILE_NAME="HubspotInvoicingLambda-${DATE}.zip"

# Exit immediately if a command exits with a non-zero status.
set -e

echo "--- Starting HubSpot Invoicing Lambda Deployment ---"

# --- 1. Preparation ---
echo "Step 1: Cleaning up old build artifacts..."
rm -rf "$DIST_DIR"
mkdir -p "$PACKAGE_DIR"

# --- 2. Build Lean Deployment Package ---
echo "Step 2: Building lean package..."

echo "--> Copying source files..."
cp -r src/ "$PACKAGE_DIR/"
cp package.json package-lock.json "$PACKAGE_DIR/"
if [ -d handlers ]; then
  echo "--> Copying additional handlers..."
  cp -r handlers "$PACKAGE_DIR/"
fi
if [ -d ui ]; then
  echo "--> Copying UI files..."
  cp -r ui "$PACKAGE_DIR/"
fi

cd "$PACKAGE_DIR"

echo "--> Installing production dependencies in staging area..."
npm install --production

echo "--> Removing Chromium from package to keep size down..."
rm -rf node_modules/@sparticuz

# --- THIS IS THE SECOND FIX ---
# Create the zip file inside the parent directory (`dist`).
echo "--> Creating final deployment ZIP..."
zip -r "../${ZIP_FILE_NAME}" .

cd ../..

echo "Lean package created successfully: ${DIST_DIR}/${ZIP_FILE_NAME}"

# --- 3. Deploy to AWS Lambda ---
echo "Step 3: Deploying to AWS Lambda function '${FUNCTION_NAME}'..."
# The path here is now correctly constructed.
aws lambda update-function-code \
  --function-name "$FUNCTION_NAME" \
  --zip-file "fileb://${DIST_DIR}/${ZIP_FILE_NAME}" \
  --region "$AWS_REGION"

echo "--- Deployment to AWS successful! ---"
echo "--- Process Complete ---"

# --- Optional Test Invocation ---
# ... (The rest of the script remains the same) ...
read -p "Do you want to run a test invocation now? (y/n) " -n 1 -r
echo

if [[ $REPLY =~ ^[Yy]$ ]]
then
  echo "Invoking function '${FUNCTION_NAME}' with a dry-run payload..."
  aws lambda invoke \
    --function-name "$FUNCTION_NAME" \
    --payload fileb://test-payload.json \
    response.json \
    --region "$AWS_REGION"
  
  echo "Invocation complete. See response.json for output."
  echo "--- Response Body ---"
  if command -v jq &> /dev/null
  then
      jq . response.json
  else
      cat response.json
  fi
  echo
  echo "---------------------"
fi