#!/bin/bash

# Enhanced Lambda Deployment Script
# Creates ZIP packages and deploys Lambda functions with interactive selection

set -e  # Exit on any error

export AWS_PAGER=""                    # Disable pager globally
export AWS_CLI_AUTO_PROMPT="off"      # Disable auto-prompts
export AWS_DEFAULT_OUTPUT="json"      # Set default output format

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Function names (update these to match your actual function names)
LIST_FUNCTION="HubSpotInvoicingListInvoices"
GET_FUNCTION="HubSpotInvoicingGetInvoice"
DOWNLOAD_FUNCTION="HubSpotInvoicingDownloadInvoice"

# Function to print colored output
print_status() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_header() {
    echo -e "${PURPLE}🚀 $1${NC}"
}

# Function to create ZIP package for a lambda function
create_zip_package() {
    local function_dir=$1
    local zip_name=$2
    
    print_info "Creating ZIP package for $function_dir..."
    
    # Navigate to function directory
    cd "$function_dir" || {
        print_error "Failed to navigate to $function_dir"
        return 1
    }
    
    # Clean up any existing deployment artifacts
    print_info "Cleaning up previous deployment artifacts..."
    rm -rf node_modules
    rm -f "../$zip_name"
    
    # Install only the dependencies needed for this lambda function
    print_info "Installing dependencies..."
    npm install --production
    
    # Create the deployment package
    print_info "Creating deployment package..."
    zip -r "../$zip_name" . \
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
    
    # Get package size
    local package_size=$(du -h "../$zip_name" | cut -f1)
    print_status "Deployment package created: ../$zip_name (Size: $package_size)"
    
    # Clean up node_modules after packaging
    print_info "Cleaning up node_modules..."
    rm -rf node_modules
    
    # Return to original directory
    cd - > /dev/null
    
    print_status "ZIP package ready for $function_dir"
}

# Function to deploy a lambda function
deploy_lambda() {
    local function_name=$1
    local zip_file=$2
    
    print_info "Deploying $function_name..."
    
    if aws lambda get-function --function-name "$function_name" >/dev/null 2>&1; then
        aws lambda update-function-code \
            --function-name "$function_name" \
            --zip-file "fileb://$zip_file"
        print_status "Updated $function_name"
    else
        print_warning "Function $function_name not found. Please create it first or update the function name."
        return 1
    fi
}

# Function to show interactive menu
show_menu() {
    echo ""
    print_header "HubSpot Invoicing Lambda Deployment"
    echo ""
    echo "Which Lambda functions would you like to deploy?"
    echo ""
    echo "1) lambda-download-invoice"
    echo "2) lambda-get-invoice"
    echo "3) lambda-list-invoices"
    echo "4) All three functions"
    echo "5) Exit"
    echo ""
    echo -n "Enter your choice (1-5): "
}

# Function to process deployment for a specific function
deploy_single_function() {
    local choice=$1
    
    case $choice in
        1)
            print_header "Deploying lambda-download-invoice"
            create_zip_package "lambda-download-invoice" "lambda-download-invoice.zip"
            deploy_lambda "$DOWNLOAD_FUNCTION" "lambda-download-invoice.zip"
            ;;
        2)
            print_header "Deploying lambda-get-invoice"
            create_zip_package "lambda-get-invoice" "lambda-get-invoice.zip"
            deploy_lambda "$GET_FUNCTION" "lambda-get-invoice.zip"
            ;;
        3)
            print_header "Deploying lambda-list-invoices"
            create_zip_package "lambda-list-invoices" "lambda-list-invoices.zip"
            deploy_lambda "$LIST_FUNCTION" "lambda-list-invoices.zip"
            ;;
        *)
            print_error "Invalid choice: $choice"
            return 1
            ;;
    esac
}

# Function to deploy all functions
deploy_all_functions() {
    print_header "Deploying all three Lambda functions"
    
    # Create all ZIP packages first
    print_info "Creating ZIP packages for all functions..."
    
    create_zip_package "lambda-download-invoice" "lambda-download-invoice.zip"
    create_zip_package "lambda-get-invoice" "lambda-get-invoice.zip"
    create_zip_package "lambda-list-invoices" "lambda-list-invoices.zip"
    
    # Deploy all functions
    print_info "Deploying all functions to AWS Lambda..."
    
    deploy_lambda "$DOWNLOAD_FUNCTION" "lambda-download-invoice.zip"
    deploy_lambda "$GET_FUNCTION" "lambda-get-invoice.zip"
    deploy_lambda "$LIST_FUNCTION" "lambda-list-invoices.zip"
}

# Main execution
main() {
    # Check if AWS CLI is installed
    if ! command -v aws &> /dev/null; then
        print_error "AWS CLI is not installed. Please install it first."
        exit 1
    fi
    
    # Check if AWS credentials are configured
    if ! aws sts get-caller-identity &> /dev/null; then
        print_error "AWS credentials are not configured. Please run 'aws configure' first."
        exit 1
    fi
    
    # Check if zip command is available
    if ! command -v zip &> /dev/null; then
        print_error "zip command is not available. Please install it first."
        exit 1
    fi
    
    # Interactive menu loop
    while true; do
        show_menu
        read -r choice
        
        case $choice in
            1|2|3)
                deploy_single_function "$choice"
                ;;
            4)
                deploy_all_functions
                ;;
            5)
                print_info "Exiting deployment script."
                exit 0
                ;;
            *)
                print_error "Invalid choice. Please enter a number between 1 and 5."
                continue
                ;;
        esac
        
        echo ""
        print_status "Deployment completed successfully!"
        echo ""
        echo "📋 Next steps:"
        echo "1. Verify environment variables are set for each function:"
        echo "   - S3_REPORTS_BUCKET_NAME (required)"
        echo "2. Test the endpoints"
        echo "3. Check CloudWatch logs for any errors"
        echo ""
        
        # Ask if user wants to deploy another function
        echo -n "Would you like to deploy another function? (y/n): "
        read -r continue_deploy
        
        if [[ ! "$continue_deploy" =~ ^[Yy]$ ]]; then
            print_info "Exiting deployment script."
            exit 0
        fi
    done
}

# Run main function
main "$@" 