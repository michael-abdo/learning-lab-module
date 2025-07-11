#!/bin/bash

# Alfred Brain AWS Deployment Script
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
  VPC_ID=$(aws ec2 describe-vpcs --query 'Vpcs[0].VpcId' --output text)
  
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
  REGION=$(aws configure get region || echo "us-east-1")
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

# Collect environment variables
collect_env_vars() {
  print_section "Configuring Environment Variables"
  
  # MongoDB Atlas URI
  read -p "Enter MongoDB Atlas URI: " MONGODB_URI
  
  # AWS Credentials
  AWS_ACCESS_KEY_ID=$(aws configure get aws_access_key_id)
  AWS_SECRET_ACCESS_KEY=$(aws configure get aws_secret_access_key)
  AWS_REGION=$(aws configure get region || echo "us-east-1")
  
  # TryTerra API credentials
  read -p "Enter TryTerra API Key 1: " TRYTERRA_API_KEY_1
  read -p "Enter TryTerra API Key 2 (optional): " TRYTERRA_API_KEY_2
  read -p "Enter TryTerra Dev ID (optional): " TRYTERRA_DEV_ID
  
  # OpenAI API key
  read -p "Enter OpenAI API Key: " OPENAI_API_KEY
  
  # Create env vars file
  ENV_FILE=".env.deployment"
  cat > "${ENV_FILE}" << EOF
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
  
  print_success "Environment variables configured and saved to ${ENV_FILE}"
}

# Deploy application to EC2
deploy_to_ec2() {
  print_section "Deploying Application to EC2"
  
  # Get deploy script from GitHub
  echo "Downloading deployment script..."
  curl -s -o deploy-to-ec2-remote.sh https://raw.githubusercontent.com/Runtheons/Runtheons_Beta_Backend/alfred-brain/deploy-to-ec2.sh
  chmod +x deploy-to-ec2-remote.sh
  
  # Create setup script that will run on the EC2 instance
  SETUP_SCRIPT="ec2-setup.sh"
  cat > "${SETUP_SCRIPT}" << EOF
#!/bin/bash
set -e

# Copy environment variables
cat > .env << 'ENVFILE'
$(cat .env.deployment)
ENVFILE

# Make deploy script executable and run it
chmod +x deploy-to-ec2-remote.sh
./deploy-to-ec2-remote.sh
EOF
  
  chmod +x "${SETUP_SCRIPT}"
  print_success "Deployment script prepared"
  
  # Copy scripts to EC2
  echo "Copying scripts to EC2 instance..."
  scp -i "${KEY_FILE}" -o StrictHostKeyChecking=no "${SETUP_SCRIPT}" "ec2-user@${INSTANCE_PUBLIC_IP}:~/"
  scp -i "${KEY_FILE}" -o StrictHostKeyChecking=no "deploy-to-ec2-remote.sh" "ec2-user@${INSTANCE_PUBLIC_IP}:~/"
  
  # Run setup script
  echo "Running setup script on EC2 instance..."
  echo "This will take several minutes. Please be patient."
  ssh -i "${KEY_FILE}" -o StrictHostKeyChecking=no "ec2-user@${INSTANCE_PUBLIC_IP}" "bash ${SETUP_SCRIPT}"
  
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
  create_key_pair
  create_security_group
  launch_ec2_instance
  collect_env_vars
  deploy_to_ec2
  display_summary
  
  print_section "Deployment Complete"
}

# Run the main function
main