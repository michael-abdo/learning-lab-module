#!/bin/bash

# Script to check available routes on the EC2 instance
# This helps identify the correct API endpoints

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
print_header "Checking Available Routes on EC2 Instance ${EC2_IP}"

# Prompt for SSH key file
read -p "Enter the path to your SSH key file (.pem): " SSH_KEY_FILE

if [ ! -f "$SSH_KEY_FILE" ]; then
  print_error "SSH key file not found: $SSH_KEY_FILE"
  exit 1
fi

# Ensure key has proper permissions
chmod 400 "$SSH_KEY_FILE"

# Create route checking script
cat > check_routes_on_ec2.sh << 'EOF'
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

# Check if we can find the terra routes file
print_header "Looking for Terra Routes File"
if [ -f "alfred_brain_001/backend/api/terraRoutes.js" ]; then
  echo "Found terra routes file, checking contents:"
  grep -n "router.*get\|router.*post\|router.*put\|router.*delete" alfred_brain_001/backend/api/terraRoutes.js
  
  # Also check terraController.js to see available methods
  echo -e "\nController methods:"
  grep -n "exports\." alfred_brain_001/backend/api/terraController.js | head -20
else
  print_error "Terra routes file not found"
  echo "Searching for any route files:"
  find alfred_brain_001 -name "*Routes.js" -type f
fi

# Test a few common endpoints
print_header "Testing Common API Endpoints"

echo "Testing /api/terra/system/scheduler-status:"
curl -s http://localhost:3000/api/terra/system/scheduler-status | grep "success" && print_success "Endpoint works" || print_error "Endpoint failed"

echo -e "\nTesting /api/terra/scheduler/status:"
curl -s http://localhost:3000/api/terra/scheduler/status | grep "success" && print_success "Endpoint works" || print_error "Endpoint failed"

# Get all app routes by checking expressjs app
print_header "Attempting to List All Routes"
echo "Checking for routes by examining the server.js file:"
if [ -f "alfred_brain_001/backend/server.js" ]; then
  grep -n "app.use" alfred_brain_001/backend/server.js
fi

# Test Terra API routes one by one
print_header "Testing Basic Terra API Endpoints"

echo "Testing /api/terra/health:"
curl -s http://localhost:3000/api/terra/health | grep "status" && print_success "Endpoint works" || print_error "Endpoint failed"

# Added dynamic route testing
print_header "Creating Test User for API Testing"
echo -e "Would you like to create a test user? (y/n): \c"
read CREATE_USER

if [ "$CREATE_USER" = "y" ]; then
  cat > create_test_user.js << 'ENDJS'
const mongoose = require('mongoose');
require('dotenv').config();

// Define a simple User schema
const userSchema = new mongoose.Schema({
  name: String,
  email: String,
  terra_user_id: String,
  reference_id: String,
  terra_connection: {
    connected: Boolean,
    provider: String,
    last_synced: Date,
    status: String
  },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now }
});

// Create model
const User = mongoose.model('User', userSchema);

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI)
  .then(async () => {
    console.log('Connected to MongoDB');
    
    // Create a test user
    const testUser = new User({
      name: 'Test User',
      email: 'test@example.com',
      terra_user_id: 'test_terra_user_123',
      reference_id: 'test_ref_123',
      terra_connection: {
        connected: true,
        provider: 'TEST',
        last_synced: new Date(),
        status: 'connected'
      }
    });
    
    // Save the user
    await testUser.save();
    console.log('Test user created:', testUser._id);
    
    // Disconnect
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  })
  .catch(err => {
    console.error('Error:', err);
  });
ENDJS

  echo "Creating test user..."
  cd alfred_brain_001
  node ../create_test_user.js
  cd ..
  rm create_test_user.js
  
  echo "Test user created. Now you can test endpoints that require a user ID."
fi
EOF

# Copy the script to EC2
print_header "Copying Route Checking Script to EC2"
scp -i "$SSH_KEY_FILE" -o StrictHostKeyChecking=no check_routes_on_ec2.sh "ec2-user@${EC2_IP}:~/"
print_success "Script transferred to EC2"

# Execute the script on EC2
print_header "Checking Routes on EC2"
ssh -i "$SSH_KEY_FILE" -o StrictHostKeyChecking=no "ec2-user@${EC2_IP}" "chmod +x check_routes_on_ec2.sh && ./check_routes_on_ec2.sh"

# Clean up
rm check_routes_on_ec2.sh
print_success "Route checking complete"