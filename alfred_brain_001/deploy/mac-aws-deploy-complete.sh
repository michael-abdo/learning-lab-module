#!/bin/bash

# Alfred Brain AWS Deployment Script (Complete Version)
# This script creates an EC2 instance and deploys Alfred Brain
# Run this script from your Mac

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

# Check prerequisites
check_prerequisites() {
  print_section "Checking Prerequisites"
  
  # Check for AWS CLI
  if command_exists aws; then
    print_success "AWS CLI is installed: $(aws --version)"
  else
    print_error "AWS CLI is not installed. Please install it first: https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html"
  fi
  
  # Check for jq (for JSON parsing)
  if command_exists jq; then
    print_success "jq is installed: $(jq --version)"
  else
    print_warning "jq is not installed. Installing it now..."
    if command_exists brew; then
      brew install jq
      print_success "jq installed: $(jq --version)"
    else
      print_error "Homebrew not found. Please install jq manually: https://stedolan.github.io/jq/download/"
    fi
  fi
  
  # Check AWS CLI configuration
  if aws sts get-caller-identity >/dev/null 2>&1; then
    print_success "AWS CLI is configured properly"
  else
    print_error "AWS CLI is not configured properly. Please run 'aws configure' first."
  fi
}

# Get the AWS region to use
get_aws_region() {
  CONFIGURED_REGION=$(aws configure get region)
  DEFAULT_REGION="us-east-1"
  
  if [ -n "$CONFIGURED_REGION" ]; then
    REGION=$CONFIGURED_REGION
  else
    REGION=$DEFAULT_REGION
  fi
  
  echo "Using AWS region: $REGION"
  aws configure set region $REGION
}

# Check for and get default VPC
get_default_vpc() {
  print_section "Checking VPC Configuration"
  
  echo "Looking for default VPC in region: $REGION"
  DEFAULT_VPC=$(aws ec2 describe-vpcs \
    --filters "Name=isDefault,Values=true" \
    --query "Vpcs[0].VpcId" \
    --output text)
  
  if [ "$DEFAULT_VPC" = "None" ] || [ -z "$DEFAULT_VPC" ]; then
    echo "No default VPC found. Listing available VPCs..."
    
    # List available VPCs
    aws ec2 describe-vpcs --query "Vpcs[].[VpcId,Tags[?Key=='Name'].Value|[0],CidrBlock,IsDefault]" --output table
    
    # Ask user to select a VPC
    read -p "Please enter a VPC ID to use: " VPC_ID
    
    if [ -z "$VPC_ID" ]; then
      print_error "No VPC selected. Cannot continue."
    fi
    
    # Check if the VPC exists
    if ! aws ec2 describe-vpcs --vpc-ids "$VPC_ID" >/dev/null 2>&1; then
      print_error "Invalid VPC ID. Cannot continue."
    fi
    
    print_success "Using VPC: $VPC_ID"
    
    # Get subnet for this VPC
    echo "Getting subnets for VPC: $VPC_ID"
    SUBNETS=$(aws ec2 describe-subnets \
      --filters "Name=vpc-id,Values=$VPC_ID" \
      --query "Subnets[*].[SubnetId,AvailabilityZone,CidrBlock,MapPublicIpOnLaunch]" \
      --output table)
    
    echo "$SUBNETS"
    
    # Ask user to select a subnet
    read -p "Please enter a Subnet ID to use: " SUBNET_ID
    
    if [ -z "$SUBNET_ID" ]; then
      print_error "No Subnet selected. Cannot continue."
    fi
    
    # Check if the Subnet exists
    if ! aws ec2 describe-subnets --subnet-ids "$SUBNET_ID" >/dev/null 2>&1; then
      print_error "Invalid Subnet ID. Cannot continue."
    fi
    
    print_success "Using Subnet: $SUBNET_ID"
  else
    VPC_ID=$DEFAULT_VPC
    print_success "Using default VPC: $VPC_ID"
    
    # Get the first subnet from the default VPC
    SUBNET_ID=$(aws ec2 describe-subnets \
      --filters "Name=vpc-id,Values=$VPC_ID" "Name=default-for-az,Values=true" \
      --query "Subnets[0].SubnetId" \
      --output text)
    
    print_success "Using subnet: $SUBNET_ID"
  fi
  
  if [ -z "$SUBNET_ID" ]; then
    print_error "Could not determine a subnet to use. Cannot continue."
  fi
}

# Create SSH key pair for EC2 instance
create_key_pair() {
  print_section "Creating SSH Key Pair"
  
  KEY_NAME="alfred-brain-key-$(date +%s)"
  KEY_FILE="${KEY_NAME}.pem"
  
  echo "Creating key pair: ${KEY_NAME}"
  aws ec2 create-key-pair --key-name "${KEY_NAME}" --query 'KeyMaterial' --output text > "${KEY_FILE}"
  
  if [ -f "${KEY_FILE}" ]; then
    chmod 400 "${KEY_FILE}"
    print_success "Key pair created and saved to ${KEY_FILE}"
  else
    print_error "Failed to create key pair"
  fi
  
  echo "Key pair: ${KEY_NAME}"
  echo "Key file: ${KEY_FILE}"
}

# Create security group for EC2 instance
create_security_group() {
  print_section "Creating Security Group"
  
  SG_NAME="alfred-brain-sg-$(date +%s)"
  
  echo "Creating security group: ${SG_NAME} in VPC: ${VPC_ID}"
  SECURITY_GROUP_ID=$(aws ec2 create-security-group \
    --group-name "${SG_NAME}" \
    --description "Security group for Alfred Brain deployment" \
    --vpc-id "${VPC_ID}" \
    --output text \
    --query 'GroupId')
  
  if [ -n "${SECURITY_GROUP_ID}" ]; then
    print_success "Security group created: ${SECURITY_GROUP_ID}"
  else
    print_error "Failed to create security group"
  fi
  
  echo "Configuring security group rules..."
  
  # Allow SSH (port 22)
  aws ec2 authorize-security-group-ingress \
    --group-id "${SECURITY_GROUP_ID}" \
    --protocol tcp \
    --port 22 \
    --cidr 0.0.0.0/0 >/dev/null
  
  # Allow HTTP (port 80)
  aws ec2 authorize-security-group-ingress \
    --group-id "${SECURITY_GROUP_ID}" \
    --protocol tcp \
    --port 80 \
    --cidr 0.0.0.0/0 >/dev/null
  
  # Allow application port (8080)
  aws ec2 authorize-security-group-ingress \
    --group-id "${SECURITY_GROUP_ID}" \
    --protocol tcp \
    --port 8080 \
    --cidr 0.0.0.0/0 >/dev/null
  
  print_success "Security group rules configured"
  echo "Security group ID: ${SECURITY_GROUP_ID}"
}

# Launch EC2 instance
launch_ec2_instance() {
  print_section "Launching EC2 Instance"
  
  # Get the latest Amazon Linux 2 AMI
  echo "Getting latest Amazon Linux 2 AMI in region: ${REGION}"
  
  AMI_ID=$(aws ec2 describe-images \
    --owners amazon \
    --filters "Name=name,Values=amzn2-ami-hvm-*-x86_64-gp2" "Name=state,Values=available" \
    --query "sort_by(Images, &CreationDate)[-1].ImageId" \
    --output text)
  
  if [ -n "${AMI_ID}" ]; then
    print_success "Found latest Amazon Linux 2 AMI: ${AMI_ID}"
  else
    print_error "Failed to find Amazon Linux 2 AMI"
  fi
  
  # Launch instance
  echo "Launching EC2 instance..."
  INSTANCE_ID=$(aws ec2 run-instances \
    --image-id "${AMI_ID}" \
    --instance-type t2.micro \
    --key-name "${KEY_NAME}" \
    --security-group-ids "${SECURITY_GROUP_ID}" \
    --subnet-id "${SUBNET_ID}" \
    --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=alfred-brain-server}]" \
    --query 'Instances[0].InstanceId' \
    --output text)
  
  if [ -n "${INSTANCE_ID}" ]; then
    print_success "EC2 instance launched: ${INSTANCE_ID}"
  else
    print_error "Failed to launch EC2 instance"
  fi
  
  echo "Waiting for instance to be ready..."
  aws ec2 wait instance-running --instance-ids "${INSTANCE_ID}"
  
  # Get instance public IP
  INSTANCE_PUBLIC_IP=$(aws ec2 describe-instances \
    --instance-ids "${INSTANCE_ID}" \
    --query 'Reservations[0].Instances[0].PublicIpAddress' \
    --output text)
  
  if [ -n "${INSTANCE_PUBLIC_IP}" ]; then
    print_success "Instance is running at IP: ${INSTANCE_PUBLIC_IP}"
  else
    print_error "Failed to get instance public IP"
  fi
  
  echo "Instance ID: ${INSTANCE_ID}"
  echo "Public IP: ${INSTANCE_PUBLIC_IP}"
  
  # Wait a bit for SSH to be available
  echo "Waiting for SSH to be available..."
  sleep 30
}

# Check for a .env file in the current directory
check_for_env_file() {
  print_section "Checking for .env file"
  
  if [ -f ".env" ]; then
    print_success "Found .env file in current directory"
    print_warning "Using values from existing .env file"
    return 0
  else
    print_warning "No .env file found in current directory"
    return 1
  fi
}

# Collect environment variables from .env file
collect_env_vars_from_file() {
  print_section "Reading Environment Variables from .env file"
  
  # Source the .env file
  source .env
  
  # Check required variables
  if [ -z "$MONGODB_URI" ]; then
    print_warning "MONGODB_URI is missing from .env file"
    read -p "Enter MongoDB Atlas URI: " MONGODB_URI
  else
    print_success "Found MONGODB_URI in .env file"
  fi
  
  if [ -z "$TRYTERRA_API_KEY_1" ]; then
    print_warning "TRYTERRA_API_KEY_1 is missing from .env file"
    read -p "Enter TryTerra API Key 1: " TRYTERRA_API_KEY_1
  else
    print_success "Found TRYTERRA_API_KEY_1 in .env file"
  fi
  
  if [ -z "$OPENAI_API_KEY" ]; then
    print_warning "OPENAI_API_KEY is missing from .env file"
    read -p "Enter OpenAI API Key: " OPENAI_API_KEY
  else
    print_success "Found OPENAI_API_KEY in .env file"
  fi
  
  # AWS credentials from CLI config
  AWS_ACCESS_KEY_ID=$(aws configure get aws_access_key_id)
  AWS_SECRET_ACCESS_KEY=$(aws configure get aws_secret_access_key)
  
  # Create deployment env file
  create_env_deployment_file
}

# Collect environment variables manually
collect_env_vars_manually() {
  print_section "Collecting Environment Variables"
  
  # MongoDB Atlas URI
  read -p "Enter MongoDB Atlas URI: " MONGODB_URI
  
  # AWS Credentials
  AWS_ACCESS_KEY_ID=$(aws configure get aws_access_key_id)
  AWS_SECRET_ACCESS_KEY=$(aws configure get aws_secret_access_key)
  
  # TryTerra API credentials
  read -p "Enter TryTerra API Key 1: " TRYTERRA_API_KEY_1
  read -p "Enter TryTerra API Key 2 (optional): " TRYTERRA_API_KEY_2
  read -p "Enter TryTerra Dev ID (optional): " TRYTERRA_DEV_ID
  
  # OpenAI API key
  read -p "Enter OpenAI API Key: " OPENAI_API_KEY
  
  # Create deployment env file
  create_env_deployment_file
}

# Create the deployment env file
create_env_deployment_file() {
  # Create env vars file
  ENV_FILE=".env.deployment"
  cat > "${ENV_FILE}" << EOF
# MongoDB Atlas
MONGODB_URI=${MONGODB_URI}

# AWS Configuration
AWS_ACCESS_KEY_ID=${AWS_ACCESS_KEY_ID}
AWS_SECRET_ACCESS_KEY=${AWS_SECRET_ACCESS_KEY}
AWS_REGION=${REGION}

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
  
  print_success "Environment variables configured and saved to ${ENV_FILE}"
}

# Deploy application to EC2
deploy_to_ec2() {
  print_section "Deploying Application to EC2"
  
  # Create EC2 deployment script
  cat > ec2-deploy.sh << 'EOF'
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
EOF

  chmod +x ec2-deploy.sh
  
  # Create setup script
  cat > ec2-setup.sh << EOF
#!/bin/bash
set -e

# Copy environment variables
cat > .env << 'ENVFILE'
$(cat .env.deployment)
ENVFILE

# Run deployment script
./ec2-deploy.sh
EOF

  chmod +x ec2-setup.sh
  
  print_success "Deployment scripts prepared"
  
  # Copy scripts to EC2
  echo "Copying scripts to EC2 instance..."
  scp -i "${KEY_FILE}" -o StrictHostKeyChecking=no ec2-setup.sh ec2-deploy.sh "ec2-user@${INSTANCE_PUBLIC_IP}:~/"
  
  # Run setup script
  echo "Running setup script on EC2 instance..."
  echo "This will take several minutes. Please be patient."
  ssh -i "${KEY_FILE}" -o StrictHostKeyChecking=no "ec2-user@${INSTANCE_PUBLIC_IP}" "bash ec2-setup.sh"
  
  print_success "Application deployed successfully!"
}

# Display summary
display_summary() {
  print_section "Deployment Summary"
  
  echo "Alfred Brain has been deployed to AWS!"
  echo ""
  echo "EC2 Instance Details:"
  echo "  Instance ID: ${INSTANCE_ID}"
  echo "  Public IP: ${INSTANCE_PUBLIC_IP}"
  echo "  SSH Key: ${KEY_FILE}"
  echo ""
  echo "Application URLs:"
  echo "  Health Check: http://${INSTANCE_PUBLIC_IP}:8080/health"
  echo "  API Base URL: http://${INSTANCE_PUBLIC_IP}:8080/api"
  echo ""
  echo "How to connect to your instance:"
  echo "  ssh -i ${KEY_FILE} ec2-user@${INSTANCE_PUBLIC_IP}"
  echo ""
  echo "How to view application logs:"
  echo "  ssh -i ${KEY_FILE} ec2-user@${INSTANCE_PUBLIC_IP} 'pm2 logs alfred-brain-api'"
  echo ""
  print_warning "IMPORTANT: Don't forget to whitelist this IP address in MongoDB Atlas!"
  print_warning "IMPORTANT: For production use, set up a domain name and HTTPS."
}

# Main function
main() {
  # Display welcome message
  print_section "Alfred Brain AWS Deployment"
  echo "This script will set up an EC2 instance and deploy Alfred Brain."
  echo "Make sure you have AWS CLI configured with appropriate permissions."
  echo "You will need your MongoDB Atlas, TryTerra, and OpenAI credentials."
  echo ""
  
  # Confirm with user
  read -p "Are you ready to continue? (y/n) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    print_error "Deployment aborted by user"
  fi
  
  # Run deployment steps
  check_prerequisites
  get_aws_region
  get_default_vpc
  create_key_pair
  create_security_group
  launch_ec2_instance
  
  # Check for .env file and collect env vars
  if check_for_env_file; then
    collect_env_vars_from_file
  else
    collect_env_vars_manually
  fi
  
  deploy_to_ec2
  display_summary
  
  print_section "Deployment Complete"
}

# Run the main function
main