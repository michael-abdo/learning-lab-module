#!/bin/bash

# Updated script to update .env file on EC2 instance
# This securely transfers your local .env file to the EC2 instance

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
  exit 1
}

# EC2 instance details
EC2_IP="100.24.120.188"
print_header "Updating .env file on EC2 instance ${EC2_IP}"

# Prompt for SSH key file
read -p "Enter the path to your SSH key file (.pem): " SSH_KEY_FILE

if [ ! -f "$SSH_KEY_FILE" ]; then
  print_error "SSH key file not found: $SSH_KEY_FILE"
fi

# Ensure key has proper permissions
chmod 400 "$SSH_KEY_FILE"

# Check if local .env file exists
if [ ! -f ".env" ]; then
  print_error "Local .env file not found"
fi

print_header "Transferring .env file to EC2 instance"

# Copy .env file to EC2
scp -i "$SSH_KEY_FILE" -o StrictHostKeyChecking=no .env "ec2-user@${EC2_IP}:~/"
print_success "Transferred .env file to EC2 home directory"

# Create script to copy .env file to the right location and restart the app
cat > update_env_on_ec2.sh << 'EOF'
#!/bin/bash

# Copy .env file to application directory
if [ -d "alfred_brain_001" ]; then
  echo "Copying .env file to application directory..."
  cp .env alfred_brain_001/
  echo "✓ .env file copied"
  
  # Update server.js to use real environment variables
  echo "Checking server.js configuration..."
  cd alfred_brain_001
  if grep -q "let useMockMongo = true" backend/server.js; then
    echo "Updating server.js to use real MongoDB..."
    sed -i 's/let useMockMongo = true/let useMockMongo = false/' backend/server.js
    echo "✓ server.js updated to use real MongoDB"
  else
    echo "Server is already configured to use real MongoDB"
  fi
  
  # Restart the application
  echo "Restarting application..."
  pm2 restart alfred-brain-api
  echo "✓ Application restarted"
  
  # Check application status
  echo "Application status:"
  pm2 status
  
  # Show beginning of logs
  echo "Recent logs:"
  pm2 logs alfred-brain-api --lines 20 --nostream
else
  echo "Application directory not found"
  echo "Available directories:"
  ls -la
fi
EOF

# Copy the script to EC2
scp -i "$SSH_KEY_FILE" -o StrictHostKeyChecking=no update_env_on_ec2.sh "ec2-user@${EC2_IP}:~/"
print_success "Transferred update script to EC2"

# Execute the script on EC2
print_header "Updating application on EC2"
ssh -i "$SSH_KEY_FILE" -o StrictHostKeyChecking=no "ec2-user@${EC2_IP}" "chmod +x update_env_on_ec2.sh && ./update_env_on_ec2.sh"

# Clean up
rm update_env_on_ec2.sh
print_success "Environment update complete"