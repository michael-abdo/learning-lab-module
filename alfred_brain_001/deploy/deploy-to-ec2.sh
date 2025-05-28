#!/bin/bash

# Alfred Brain EC2 Deployment Script
# This script automates the deployment of Alfred Brain to an EC2 instance
# It should be run on the EC2 instance itself

# Set this to exit immediately if any command fails
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
}

# Print warning message
print_warning() {
  echo -e "${YELLOW}! $1${NC}"
}

# Check if a command exists
command_exists() {
  command -v "$1" >/dev/null 2>&1
}

# Check if we're running this script on an EC2 instance
check_if_ec2() {
  print_section "Checking if this is an EC2 instance"
  
  # Try to access EC2 metadata service
  if curl -s http://169.254.169.254/latest/meta-data/ --connect-timeout 2 > /dev/null; then
    print_success "Running on EC2 instance"
  else
    print_warning "This doesn't appear to be an EC2 instance. Some features may not work correctly."
    read -p "Do you want to continue anyway? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
      print_error "Aborted by user"
      exit 1
    fi
  fi
}

# Update the system and install required packages
setup_system() {
  print_section "Updating system and installing required packages"
  
  # Update system packages
  echo "Updating system packages..."
  sudo yum update -y
  
  # Install Node.js
  if command_exists node; then
    print_success "Node.js is already installed: $(node -v)"
  else
    echo "Installing Node.js..."
    curl -fsSL https://rpm.nodesource.com/setup_16.x | sudo bash -
    sudo yum install -y nodejs
    print_success "Node.js installed: $(node -v)"
  fi
  
  # Install Git
  if command_exists git; then
    print_success "Git is already installed: $(git --version)"
  else
    echo "Installing Git..."
    sudo yum install -y git
    print_success "Git installed: $(git --version)"
  fi
  
  # Install PM2
  if command_exists pm2; then
    print_success "PM2 is already installed: $(pm2 -v)"
  else
    echo "Installing PM2..."
    sudo npm install -g pm2
    print_success "PM2 installed: $(pm2 -v)"
  fi
}

# Clone the repository and check out the branch
clone_repository() {
  print_section "Cloning repository and checking out alfred-brain branch"
  
  # Set the repository variables
  REPO_URL="https://github.com/Runtheons/Runtheons_Beta_Backend.git"
  REPO_DIR="Runtheons_Beta_Backend"
  BRANCH="alfred-brain"
  
  # Check if the repository already exists
  if [ -d "$REPO_DIR" ]; then
    echo "Repository directory already exists."
    cd "$REPO_DIR"
    
    # Check if this is the right repository
    REMOTE_URL=$(git config --get remote.origin.url)
    if [ "$REMOTE_URL" = "$REPO_URL" ]; then
      print_success "Repository is already cloned."
      
      # Fetch latest changes
      echo "Fetching latest changes..."
      git fetch
      
      # Check if branch exists and check it out
      if git rev-parse --verify "$BRANCH" >/dev/null 2>&1; then
        echo "Checking out '$BRANCH' branch..."
        git checkout "$BRANCH"
        git pull origin "$BRANCH"
      else
        echo "Checking out '$BRANCH' branch..."
        git checkout -b "$BRANCH" "origin/$BRANCH"
      fi
    else
      print_error "Directory exists but is not the expected repository."
      read -p "Do you want to remove it and clone again? (y/n) " -n 1 -r
      echo
      if [[ $REPLY =~ ^[Yy]$ ]]; then
        cd ..
        rm -rf "$REPO_DIR"
        git clone "$REPO_URL"
        cd "$REPO_DIR"
        git checkout "$BRANCH"
      else
        print_error "Cannot continue without the correct repository."
        exit 1
      fi
    fi
  else
    # Clone the repository
    echo "Cloning repository..."
    git clone "$REPO_URL"
    cd "$REPO_DIR"
    
    # Check out the branch
    echo "Checking out '$BRANCH' branch..."
    git checkout "$BRANCH"
  fi
  
  print_success "Repository cloned and '$BRANCH' branch checked out."
}

# Set up environment variables
setup_environment() {
  print_section "Setting up environment variables"
  
  # Create .env file if it doesn't exist
  if [ -f .env ]; then
    print_warning ".env file already exists."
    read -p "Do you want to replace it? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
      print_warning "Keeping existing .env file."
      return
    fi
  fi
  
  # Get MongoDB Atlas connection URI
  read -p "Enter MongoDB Atlas URI: " MONGODB_URI
  
  # Get AWS credentials
  read -p "Enter AWS Access Key ID: " AWS_ACCESS_KEY_ID
  read -p "Enter AWS Secret Access Key: " AWS_SECRET_ACCESS_KEY
  read -p "Enter AWS Region [us-east-1]: " AWS_REGION
  AWS_REGION=${AWS_REGION:-us-east-1}
  
  # Get TryTerra API credentials
  read -p "Enter TryTerra API Key 1: " TRYTERRA_API_KEY_1
  read -p "Enter TryTerra API Key 2 (optional): " TRYTERRA_API_KEY_2
  read -p "Enter TryTerra Dev ID (optional): " TRYTERRA_DEV_ID
  
  # Get OpenAI API key
  read -p "Enter OpenAI API Key: " OPENAI_API_KEY
  
  # Create .env file
  cat > .env << EOF
# MongoDB Atlas
MONGODB_URI=${MONGODB_URI}

# AWS Configuration
AWS_ACCESS_KEY_ID=${AWS_ACCESS_KEY_ID}
AWS_SECRET_ACCESS_KEY=${AWS_SECRET_ACCESS_KEY}
AWS_REGION=${AWS_REGION}

# TryTerra API
TRYTERRA_API_KEY_1=${TRYTERRA_API_KEY_1}
TRYTERRA_API_KEY_2=${TRYTERRA_API_KEY_2}
TRYTERRA_DEV_ID=${TRYTERRA_DEV_ID}

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
  
  print_success ".env file created with your configuration."
  print_warning "Make sure to whitelist this EC2 instance's IP in MongoDB Atlas!"
  
  # Get current public IP address
  PUBLIC_IP=$(curl -s http://checkip.amazonaws.com)
  echo "Current public IP address: ${PUBLIC_IP}"
  echo "Add this IP address to your MongoDB Atlas whitelist."
}

# Install npm dependencies
install_dependencies() {
  print_section "Installing application dependencies"
  
  # Check if node_modules directory already exists
  if [ -d "node_modules" ]; then
    print_warning "node_modules directory already exists."
    read -p "Do you want to reinstall dependencies? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
      print_warning "Skipping dependency installation."
      return
    fi
  fi
  
  # Install dependencies
  echo "Installing dependencies... This may take a few minutes."
  npm install
  
  print_success "Dependencies installed successfully."
}

# Start the application with PM2
start_application() {
  print_section "Starting the application with PM2"
  
  # Check if the application is already running
  if pm2 list | grep -q "alfred-brain-api"; then
    print_warning "Application is already running in PM2."
    read -p "Do you want to restart it? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
      # Restart the application
      echo "Restarting application..."
      pm2 restart alfred-brain-api
    else
      print_warning "Keeping application running."
      return
    fi
  else
    # Start the application
    echo "Starting application..."
    pm2 start backend/server.js --name alfred-brain-api
  fi
  
  # Save PM2 configuration
  pm2 save
  
  # Set up PM2 to start on server reboot
  echo "Setting up PM2 to start on server reboot..."
  local PM2_STARTUP=$(pm2 startup | grep -o "sudo .*")
  eval "$PM2_STARTUP"
  
  print_success "Application started and configured to run on system startup."
}

# Deploy AWS infrastructure
deploy_aws_infrastructure() {
  print_section "Deploying AWS infrastructure"
  
  read -p "Do you want to deploy AWS infrastructure (S3, IAM, Lambda)? (y/n) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    print_warning "Skipping AWS infrastructure deployment."
    return
  fi
  
  echo "Running AWS infrastructure deployment script..."
  node scripts/deploy-aws-infrastructure.js
  
  print_success "AWS infrastructure deployment completed."
}

# Test the deployment
test_deployment() {
  print_section "Testing the deployment"
  
  # Wait a bit for the application to start
  echo "Waiting for the application to start..."
  sleep 5
  
  # Test the health endpoint
  echo "Testing the health endpoint..."
  HEALTH_RESPONSE=$(curl -s http://localhost:8080/health)
  
  if [[ $HEALTH_RESPONSE == *"status"*:"ok"* ]]; then
    print_success "Health check passed! Application is running correctly."
    
    # Get public IP address
    PUBLIC_IP=$(curl -s http://checkip.amazonaws.com)
    echo "Your application is available at: http://${PUBLIC_IP}:8080"
    
    # Show PM2 status
    echo "Current PM2 status:"
    pm2 status
    
    # Show PM2 logs
    echo "Recent application logs:"
    pm2 logs alfred-brain-api --lines 20
  else
    print_error "Health check failed! Application may not be running correctly."
    echo "Response from health endpoint: ${HEALTH_RESPONSE}"
    echo "Check the application logs for more information:"
    pm2 logs alfred-brain-api --lines 50
  fi
}

# Main function
main() {
  print_section "Starting Alfred Brain EC2 Deployment"
  
  # Run deployment steps
  check_if_ec2
  setup_system
  clone_repository
  setup_environment
  install_dependencies
  start_application
  deploy_aws_infrastructure
  test_deployment
  
  print_section "Deployment Complete"
  echo "Alfred Brain has been deployed to this EC2 instance."
  echo "Verify that everything is working correctly and make any necessary adjustments."
  
  # Get public IP address
  PUBLIC_IP=$(curl -s http://checkip.amazonaws.com)
  echo -e "\n${GREEN}Your application is available at: http://${PUBLIC_IP}:8080${NC}"
  echo -e "\n${YELLOW}Important Next Steps:${NC}"
  echo "1. Make sure to whitelist this EC2 instance's IP in MongoDB Atlas"
  echo "2. For production use, set up a domain name and HTTPS"
  echo "3. Monitor your application with: pm2 logs alfred-brain-api"
  echo "4. Test your endpoints and connect test devices"
}

# Run the main function
main