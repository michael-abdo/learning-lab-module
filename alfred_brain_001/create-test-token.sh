#!/bin/bash

# Script to create a test token and test protected endpoints
# This helps test the Alfred Brain API with authentication

set -e

# Color definitions
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
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

# EC2 instance details
EC2_IP="100.24.120.188"
print_header "Creating Test Token on EC2 Instance ${EC2_IP}"

# Prompt for SSH key file
read -p "Enter the path to your SSH key file (.pem): " SSH_KEY_FILE

if [ ! -f "$SSH_KEY_FILE" ]; then
  print_error "SSH key file not found: $SSH_KEY_FILE"
  exit 1
fi

# Ensure key has proper permissions
chmod 400 "$SSH_KEY_FILE"

# Create JWT token generator script
cat > create_token_on_ec2.js << 'EOF'
// Simple JWT token generator for testing
const jwt = require('jsonwebtoken');

// Secret key for JWT (should match what's in authMiddleware.js)
// For testing only - normally this would be in environment variables
const JWT_SECRET = 'test-secret-key';

// Create a test user payload
const testUser = {
  _id: '123456789012345678901234', // 24-character MongoDB-style ID
  name: 'Test User',
  email: 'test@example.com',
  role: 'admin' // Admin role to access protected endpoints
};

// Generate token
const token = jwt.sign(testUser, JWT_SECRET, { expiresIn: '1h' });

console.log('Test JWT Token:');
console.log(token);
console.log('\nUse this token in the Authorization header:');
console.log(`Authorization: Bearer ${token}`);
EOF

# Create test script
cat > test_api_with_token.sh << 'EOF'
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
EOF

# Copy files to EC2
print_header "Copying Scripts to EC2"
scp -i "$SSH_KEY_FILE" -o StrictHostKeyChecking=no create_token_on_ec2.js test_api_with_token.sh "ec2-user@${EC2_IP}:~/"
print_success "Scripts transferred to EC2"

# Execute the test script on EC2
print_header "Testing API with Authentication"
ssh -i "$SSH_KEY_FILE" -o StrictHostKeyChecking=no "ec2-user@${EC2_IP}" "chmod +x test_api_with_token.sh && ./test_api_with_token.sh"

# Clean up
rm create_token_on_ec2.js test_api_with_token.sh
print_success "API testing with authentication complete"