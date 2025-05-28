#!/bin/bash

# Alfred Brain EC2 Deployment Script
# This script deploys Alfred Brain on an EC2 instance

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

# Check if a command exists
command_exists() {
  command -v "$1" >/dev/null 2>&1
}

# Update system and install dependencies
setup_system() {
  print_section "Updating System and Installing Dependencies"
  
  # Update packages
  echo "Updating system packages..."
  sudo yum update -y
  
  # Install Node.js
  if ! command_exists node; then
    echo "Installing Node.js..."
    curl -fsSL https://rpm.nodesource.com/setup_16.x | sudo bash -
    sudo yum install -y nodejs
  fi
  print_success "Node.js installed: $(node -v)"
  
  # Install Git
  if ! command_exists git; then
    echo "Installing Git..."
    sudo yum install -y git
  fi
  print_success "Git installed: $(git --version)"
  
  # Install PM2
  if ! command_exists pm2; then
    echo "Installing PM2..."
    sudo npm install -g pm2
  fi
  print_success "PM2 installed: $(pm2 -v)"
}

# Clone repository and checkout branch
clone_repository() {
  print_section "Cloning Repository"
  
  if [ ! -d "Runtheons_Beta_Backend" ]; then
    echo "Cloning repository..."
    git clone https://github.com/Runtheons/Runtheons_Beta_Backend.git
  else
    echo "Repository already exists, updating..."
  fi
  
  cd Runtheons_Beta_Backend
  
  echo "Checking out alfred-brain branch..."
  git fetch
  git checkout alfred-brain
  
  print_success "Repository cloned and branch checked out"
}

# Install application dependencies
install_dependencies() {
  print_section "Installing Application Dependencies"
  
  echo "Installing NPM dependencies..."
  npm install
  
  print_success "Dependencies installed"
}

# Configure environment
configure_environment() {
  print_section "Configuring Environment"
  
  # .env file should already be created by the setup script
  if [ -f "../.env" ]; then
    echo "Copying .env file..."
    cp "../.env" .env
    print_success "Environment configured"
  else
    print_error "No .env file found"
  fi
}

# Start application with PM2
start_application() {
  print_section "Starting Application with PM2"
  
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
  local PM2_STARTUP=$(pm2 startup | grep -o "sudo .*")
  eval "$PM2_STARTUP"
  
  print_success "Application started with PM2"
}

# Test the application
test_application() {
  print_section "Testing Application"
  
  echo "Waiting for application to start..."
  sleep 5
  
  echo "Testing health endpoint..."
  
  if curl -s http://localhost:8080/health | grep -q "status"; then
    print_success "Application is running successfully"
  else
    print_warning "Could not verify application is running"
  fi
  
  echo "Application logs:"
  pm2 logs alfred-brain-api --lines 10 --nostream
}

# Display public IP
display_public_ip() {
  print_section "Access Information"
  
  PUBLIC_IP=$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4)
  echo "Your application is accessible at: http://${PUBLIC_IP}:8080"
  echo "MongoDB IP to whitelist: ${PUBLIC_IP}"
}

# Main function
main() {
  print_section "Starting Deployment"
  
  setup_system
  clone_repository
  install_dependencies
  configure_environment
  start_application
  test_application
  display_public_ip
  
  print_section "Deployment Complete"
  echo "Alfred Brain has been deployed successfully!"
  echo "Use 'pm2 logs alfred-brain-api' to view application logs"
}

# Run the main function
main
