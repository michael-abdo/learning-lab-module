#!/bin/bash

# Script to test API endpoints on EC2 with direct approach
# This script doesn't rely on the directory structure

set -e

# Color definitions
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Print headers and messages
print_header() {
  echo -e "\n${BLUE}===== $1 =====${NC}\n"
}

print_success() {
  echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
  echo -e "${RED}✗ $1${NC}"
}

print_warning() {
  echo -e "${YELLOW}! $1${NC}"
}

# EC2 instance details
EC2_IP="100.24.120.188"
print_header "Testing API Endpoints on EC2 Instance ${EC2_IP}"

# Prompt for SSH key file
read -p "Enter the path to your SSH key file (.pem): " SSH_KEY_FILE

if [ ! -f "$SSH_KEY_FILE" ]; then
  print_error "SSH key file not found: $SSH_KEY_FILE"
  exit 1
fi

# Ensure key has proper permissions
chmod 400 "$SSH_KEY_FILE"

# Create test script that doesn't rely on the directory structure
cat > direct_api_test.sh << 'EOF'
#!/bin/bash

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Print functions
print_header() {
  echo -e "\n${BLUE}===== $1 =====${NC}\n"
}

print_success() {
  echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
  echo -e "${RED}✗ $1${NC}"
}

print_warning() {
  echo -e "${YELLOW}! $1${NC}"
}

# Test various API endpoints directly
print_header "Testing Basic API Endpoints"

# Test health endpoint
echo "Testing health endpoint:"
HEALTH_RESPONSE=$(curl -s http://localhost:3000/health)
echo "$HEALTH_RESPONSE" | grep -q "status" && print_success "Health endpoint working" || print_error "Health endpoint failed"
echo "$HEALTH_RESPONSE"

# Test basic Terra API without authentication
echo -e "\nTesting /api/terra:"
curl -s http://localhost:3000/api/terra
echo -e "\n"

# Find the server.js file to understand routes
print_header "Finding Application Files"
APP_DIR=$(find / -name "server.js" -type f -path "*/backend/*" 2>/dev/null | head -1 | xargs dirname)

if [ -n "$APP_DIR" ]; then
  print_success "Found application directory at: $APP_DIR"
  
  # Examine route setup
  echo -e "\nExamining route setup in server.js:"
  grep -n "app.use" "$APP_DIR/server.js"
  
  # Look for terra routes file
  TERRA_ROUTES_FILE="$APP_DIR/../api/terraRoutes.js"
  if [ -f "$TERRA_ROUTES_FILE" ]; then
    echo -e "\nFound Terra routes file. Available routes:"
    grep -n "router.*get\|router.*post\|router.*put\|router.*delete" "$TERRA_ROUTES_FILE"
  else
    print_warning "Terra routes file not found at expected location"
    echo "Searching for Terra routes file:"
    find / -name "terraRoutes.js" -type f 2>/dev/null
  fi
else
  print_warning "Could not find server.js file"
  echo "Let's search for key application files:"
  find / -name "server.js" -type f 2>/dev/null | grep -v "node_modules"
fi

# Test Terra API endpoints that don't require authentication
print_header "Testing Public Terra API Endpoints"

echo "Testing Terra public endpoints:"
echo -e "\n1. /api/terra/health:"
curl -s http://localhost:3000/api/terra/health && echo

echo -e "\n2. /api/terra/webhook (POST request):"
curl -s -X POST http://localhost:3000/api/terra/webhook -H "Content-Type: application/json" -d '{"test":true}' && echo

# Show available endpoints based on our findings
print_header "API Endpoints Summary"

echo "Based on our tests, here are the available endpoints:"
echo "1. Health Check (No Auth): http://$HOSTNAME:3000/health"
echo "2. Terra API Base (May need Auth): http://$HOSTNAME:3000/api/terra"
echo "3. Terra Webhook (No Auth): http://$HOSTNAME:3000/api/terra/webhook"
echo -e "\nMost Terra endpoints require authentication via JWT token."
echo "To access protected endpoints, you would need to:"
echo "1. Generate a JWT token with proper user credentials"
echo "2. Include the token in an Authorization header"
echo "3. Make requests to endpoints like /api/terra/system/scheduler-status"

# Display public URL
PUBLIC_IP=$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4)
echo -e "\nYour application is accessible at: http://${PUBLIC_IP}:3000"
echo "For example: http://${PUBLIC_IP}:3000/health"
EOF

# Copy the script to EC2
print_header "Copying Test Script to EC2"
scp -i "$SSH_KEY_FILE" -o StrictHostKeyChecking=no direct_api_test.sh "ec2-user@${EC2_IP}:~/"
print_success "Test script transferred to EC2"

# Execute the script on EC2
print_header "Testing API on EC2"
ssh -i "$SSH_KEY_FILE" -o StrictHostKeyChecking=no "ec2-user@${EC2_IP}" "chmod +x direct_api_test.sh && ./direct_api_test.sh"

# Clean up
rm direct_api_test.sh
print_success "API testing complete"