#!/bin/bash

# Alfred Brain Direct EC2 Deployment Script
# This script packages the local code and deploys it directly to EC2
# Run this on your Mac after connecting to EC2

set -e

# Color definitions
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Print section header
print_section() {
  echo -e "\n${BLUE}===== $1 =====${NC}\n"
}

# Print success message
print_success() {
  echo -e "${GREEN}✓ $1${NC}"
}

# Print error message
print_error() {
  echo -e "${RED}✗ $1${NC}"
  exit 1
}

# Print warning message
print_warning() {
  echo -e "${YELLOW}! $1${NC}"
}

# Check if file exists
check_file_exists() {
  if [ ! -f "$1" ]; then
    print_error "File not found: $1"
  fi
}

# Get AWS EC2 instance details
print_section "Enter EC2 Instance Details"
read -p "Enter EC2 public IP address: " EC2_IP
read -p "Enter the path to your SSH key file (.pem): " SSH_KEY_FILE

# Validate inputs
if [ -z "$EC2_IP" ]; then
  print_error "EC2 IP address is required"
fi

if [ -z "$SSH_KEY_FILE" ]; then
  print_error "SSH key file path is required"
fi

check_file_exists "$SSH_KEY_FILE"
chmod 400 "$SSH_KEY_FILE"

# Check for a .env file in the current directory
print_section "Setting Up Environment Variables"
if [ -f ".env" ]; then
  print_success "Found .env file in current directory"
  ENV_SOURCE=".env"
else
  print_warning "No .env file found in current directory"
  print_section "Enter Environment Variables"
  
  read -p "Enter MongoDB Atlas URI: " MONGODB_URI
  read -p "Enter TryTerra API Key 1: " TRYTERRA_API_KEY_1
  read -p "Enter OpenAI API Key: " OPENAI_API_KEY
  
  # Create temp env file
  ENV_SOURCE=".env.tmp"
  cat > "${ENV_SOURCE}" << EOF
# MongoDB Atlas
MONGODB_URI=${MONGODB_URI}

# TryTerra API
TRYTERRA_API_KEY_1=${TRYTERRA_API_KEY_1}

# LLM Integration (OpenAI)
OPENAI_API_KEY=${OPENAI_API_KEY}

# Environment
PORT=8080
NODE_ENV=production
LOG_LEVEL=INFO

# Alert Thresholds
HIGH_HEART_RATE_THRESHOLD=180
LOW_DAILY_STEPS_THRESHOLD=2000
HIGH_RESTING_HEART_RATE_THRESHOLD=90
LOW_SLEEP_DURATION_THRESHOLD=360
ENABLE_ALERTS=true

# Scheduler Configuration
DATA_FETCH_INTERVAL=0 */6 * * *
USER_FETCH_LIMIT=50
USER_FETCH_DELAY=200
DEFAULT_LOOKBACK_DAYS=7
MAX_FETCH_RETRIES=3
RETRY_DELAY=1000
EOF
  
  print_success "Created temporary .env file"
fi

# Package the local code
print_section "Packaging Local Code"
echo "Creating a zip archive of the local code..."

# Go up to the parent directory
cd ..

# Create a zip archive of the current directory
ZIP_FILE="alfred_brain_deploy.zip"
zip -r "$ZIP_FILE" alfred_brain_001 -x "*.git*" "*.DS_Store" "*node_modules*"

print_success "Code packaged into $ZIP_FILE"

# Create EC2 setup script
print_section "Creating EC2 Setup Script"

SETUP_SCRIPT="ec2_setup.sh"
cat > "$SETUP_SCRIPT" << 'EOF'
#!/bin/bash

set -e

# Color definitions
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Print section header
print_section() {
  echo -e "\n${BLUE}===== $1 =====${NC}\n"
}

# Print success message
print_success() {
  echo -e "${GREEN}✓ $1${NC}"
}

# Print error message
print_error() {
  echo -e "${RED}✗ $1${NC}"
  exit 1
}

# Update system and install dependencies
print_section "Updating System and Installing Dependencies"

# Update packages
echo "Updating system packages..."
sudo yum update -y

# Install Node.js
echo "Installing Node.js..."
curl -fsSL https://rpm.nodesource.com/setup_16.x | sudo bash -
sudo yum install -y nodejs
echo "Node.js installed: $(node -v)"

# Install unzip if not installed
if ! command -v unzip &> /dev/null; then
  echo "Installing unzip..."
  sudo yum install -y unzip
fi
echo "Unzip installed: $(unzip -v | head -1)"

# Install PM2
echo "Installing PM2..."
sudo npm install -g pm2
echo "PM2 installed: $(pm2 -v)"

# Unzip the code
print_section "Extracting Code"
echo "Extracting alfred_brain_deploy.zip..."
unzip -o alfred_brain_deploy.zip
cd alfred_brain_001

# Install dependencies
print_section "Installing Dependencies"
echo "Installing npm dependencies..."
npm install
print_success "Dependencies installed"

# Set up environment variables
print_section "Setting Up Environment"
if [ -f "../.env" ]; then
  echo "Copying .env file..."
  cp "../.env" .env
  print_success "Environment file copied"
else
  print_error "No .env file found"
fi

# Start the application
print_section "Starting the Application"

# Check if application is already running in PM2
if pm2 list | grep -q "alfred-brain-api"; then
  echo "Stopping existing application..."
  pm2 stop alfred-brain-api
  pm2 delete alfred-brain-api
fi

echo "Starting application with PM2..."
pm2 start backend/server.js --name alfred-brain-api

# Save PM2 configuration
pm2 save

# Set up PM2 to start on system boot
PM2_STARTUP=$(pm2 startup | grep -o "sudo .*")
sudo bash -c "$PM2_STARTUP"

print_success "Application started"

# Test the application
print_section "Testing the Application"
echo "Waiting for application to start..."
sleep 5

echo "Testing health endpoint..."
if curl -s http://localhost:8080/health | grep -q "status"; then
  print_success "Application is running successfully!"
else
  echo "Could not verify if application is running. Check logs for details."
fi

# Display connection information
print_section "Connection Information"
PUBLIC_IP=$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4)
echo "Application URL: http://${PUBLIC_IP}:8080"
echo "Don't forget to whitelist this IP in MongoDB Atlas: ${PUBLIC_IP}"

print_section "Deployment Complete"
echo "Use 'pm2 logs alfred-brain-api' to view application logs"
EOF

chmod +x "$SETUP_SCRIPT"
print_success "EC2 setup script created"

# Upload files to EC2
print_section "Uploading Files to EC2"
echo "Uploading code archive and setup script..."
scp -i "$SSH_KEY_FILE" -o StrictHostKeyChecking=no "$ZIP_FILE" "$SETUP_SCRIPT" "$ENV_SOURCE" "ec2-user@${EC2_IP}:~/"
print_success "Files uploaded"

# Execute setup script on EC2
print_section "Deploying on EC2"
echo "Running setup script on EC2..."
echo "This will take several minutes. Please be patient."
ssh -i "$SSH_KEY_FILE" -o StrictHostKeyChecking=no "ec2-user@${EC2_IP}" "bash ${SETUP_SCRIPT}"

# Clean up temporary files
print_section "Cleaning Up"
echo "Removing temporary files..."
if [ "$ENV_SOURCE" = ".env.tmp" ]; then
  rm "$ENV_SOURCE"
fi
rm "$SETUP_SCRIPT"
rm "$ZIP_FILE"
print_success "Temporary files removed"

print_section "Deployment Summary"
echo "Alfred Brain has been deployed to your EC2 instance at ${EC2_IP}"
echo "You can access the application at: http://${EC2_IP}:8080"
echo ""
echo "How to connect to your instance:"
echo "  ssh -i ${SSH_KEY_FILE} ec2-user@${EC2_IP}"
echo ""
echo "How to view application logs:"
echo "  ssh -i ${SSH_KEY_FILE} ec2-user@${EC2_IP} 'pm2 logs alfred-brain-api'"
echo ""
print_warning "IMPORTANT: Don't forget to whitelist the EC2 IP address in MongoDB Atlas!"