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

# First check if jwt module is installed
print_header "Checking for JWT Module"
if cd alfred_brain_001 && npm list jsonwebtoken > /dev/null 2>&1; then
  print_success "JWT module is installed"
else
  print_warning "JWT module is not installed. Installing..."
  cd alfred_brain_001
  npm install jsonwebtoken
  cd ..
fi

# Generate test token
print_header "Generating Test JWT Token"
cd alfred_brain_001
TOKEN=$(node ../create_token_on_ec2.js | grep "Bearer" | cut -d' ' -f2)
cd ..

if [ -z "$TOKEN" ]; then
  print_error "Failed to generate token"
  exit 1
fi

print_success "Token generated successfully"
echo "Token: ${TOKEN:0:20}...${TOKEN: -20}"

# Test authenticated endpoints
print_header "Testing Protected Endpoints"

echo "Testing scheduler status endpoint:"
RESULT=$(curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/terra/system/scheduler-status)
echo "$RESULT"
echo "$RESULT" | grep -q "success" && print_success "Endpoint works with authentication" || print_error "Endpoint failed"

print_header "Testing User Data Endpoints"

echo "Note: These endpoints require a real user ID in the database"
echo "If you want to test with an actual user, enter the user ID"
echo "Otherwise, press Enter to use a test ID"
read -p "User ID (or press Enter for test ID): " USER_ID

if [ -z "$USER_ID" ]; then
  USER_ID="123456789012345678901234"
  print_warning "Using test user ID: $USER_ID"
fi

echo "Testing user data endpoint:"
curl -s -H "Authorization: Bearer $TOKEN" "http://localhost:3000/api/terra/users/$USER_ID/data" | grep "success"

print_header "API Testing Summary"

echo "You can test any protected endpoint using:"
echo "curl -H \"Authorization: Bearer $TOKEN\" http://localhost:3000/api/terra/[endpoint]"

echo -e "\nCommon endpoints:"
echo "- /api/terra/system/scheduler-status"
echo "- /api/terra/users/:userId/data"
echo "- /api/terra/users/:userId/process"
echo "- /api/terra/admin/process-all"

echo -e "\nTest token is valid for 1 hour from creation time"
