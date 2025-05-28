#!/bin/bash

# Script to test API endpoints on EC2
# This script tests the Alfred Brain API endpoints on your EC2 instance

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
print_header "Testing API Endpoints on EC2 Instance ${EC2_IP}"

# Prompt for SSH key file
read -p "Enter the path to your SSH key file (.pem): " SSH_KEY_FILE

if [ ! -f "$SSH_KEY_FILE" ]; then
  print_error "SSH key file not found: $SSH_KEY_FILE"
  exit 1
fi

# Ensure key has proper permissions
chmod 400 "$SSH_KEY_FILE"

# Create test script
cat > test_api_on_ec2.sh << 'EOF'
#!/bin/bash

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
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

# Test health endpoint
print_header "Testing Health Endpoint"
HEALTH_RESPONSE=$(curl -s http://localhost:3000/health)
echo "$HEALTH_RESPONSE" | grep -q "status" && print_success "Health endpoint returned status" || print_error "Health endpoint failed"
echo "$HEALTH_RESPONSE"

# Test Terra scheduler status
print_header "Testing Terra Scheduler Status"
SCHEDULER_RESPONSE=$(curl -s http://localhost:3000/api/terra/scheduler/status)
echo "$SCHEDULER_RESPONSE" | grep -q "activeJobs" && print_success "Scheduler status endpoint working" || print_error "Scheduler status endpoint failed"
echo "$SCHEDULER_RESPONSE"

# Check MongoDB status from health response
print_header "Checking MongoDB Connection"
echo "$HEALTH_RESPONSE" | grep -q "\"mongodb\":{\"status\":\"connected\"" && print_success "MongoDB is connected" || print_error "MongoDB is not connected"

# Print summary
print_header "API Test Summary"
echo "Application is running on port 3000"
echo "Public URL: http://${EC2_HOSTNAME}:3000"
echo "To access the API from your browser or other tools, use this URL"
echo "For example: http://${EC2_HOSTNAME}:3000/health"
EOF

# Add EC2 hostname to the script
ssh -i "$SSH_KEY_FILE" -o StrictHostKeyChecking=no "ec2-user@${EC2_IP}" "echo EC2_HOSTNAME=\$(curl -s http://169.254.169.254/latest/meta-data/public-hostname) >> test_api_on_ec2.sh"

# Copy the script to EC2
print_header "Copying Test Script to EC2"
scp -i "$SSH_KEY_FILE" -o StrictHostKeyChecking=no test_api_on_ec2.sh "ec2-user@${EC2_IP}:~/"
print_success "Test script transferred to EC2"

# Execute the script on EC2
print_header "Testing API on EC2"
ssh -i "$SSH_KEY_FILE" -o StrictHostKeyChecking=no "ec2-user@${EC2_IP}" "chmod +x test_api_on_ec2.sh && ./test_api_on_ec2.sh"

# Clean up
rm test_api_on_ec2.sh
print_success "API testing complete"