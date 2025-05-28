#!/bin/bash

# Script to delete AWS OpenSearch domain and associated VPC resources
# You must have AWS CLI installed and configured with appropriate credentials

# Parameters - replace these with your actual resource names
OPENSEARCH_DOMAIN_NAME="learning-lab-search"
VPC_ID="" # Add your VPC ID if known

echo "⚠️ WARNING: This script will delete AWS resources permanently ⚠️"
echo "Resources to be deleted:"
echo "- OpenSearch domain: $OPENSEARCH_DOMAIN_NAME"
if [ ! -z "$VPC_ID" ]; then
  echo "- VPC: $VPC_ID (and associated resources)"
fi
echo ""
read -p "Are you sure you want to proceed? (yes/no): " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
  echo "Operation cancelled."
  exit 1
fi

# Delete OpenSearch domain
echo "Deleting OpenSearch domain: $OPENSEARCH_DOMAIN_NAME..."
aws opensearch delete-domain --domain-name $OPENSEARCH_DOMAIN_NAME

# If VPC ID is provided, delete VPC resources
if [ ! -z "$VPC_ID" ]; then
  echo "Finding and deleting resources associated with VPC: $VPC_ID"
  
  # Get security groups associated with the VPC
  SECURITY_GROUPS=$(aws ec2 describe-security-groups --filters Name=vpc-id,Values=$VPC_ID --query 'SecurityGroups[*].GroupId' --output text)
  
  # Delete each security group
  for SG in $SECURITY_GROUPS; do
    echo "Deleting security group: $SG"
    aws ec2 delete-security-group --group-id $SG
  done
  
  # Get subnets associated with the VPC
  SUBNETS=$(aws ec2 describe-subnets --filters Name=vpc-id,Values=$VPC_ID --query 'Subnets[*].SubnetId' --output text)
  
  # Delete each subnet
  for SUBNET in $SUBNETS; do
    echo "Deleting subnet: $SUBNET"
    aws ec2 delete-subnet --subnet-id $SUBNET
  done
  
  # Delete internet gateways
  IGW=$(aws ec2 describe-internet-gateways --filters Name=attachment.vpc-id,Values=$VPC_ID --query 'InternetGateways[*].InternetGatewayId' --output text)
  if [ ! -z "$IGW" ]; then
    echo "Detaching and deleting internet gateway: $IGW"
    aws ec2 detach-internet-gateway --internet-gateway-id $IGW --vpc-id $VPC_ID
    aws ec2 delete-internet-gateway --internet-gateway-id $IGW
  fi
  
  # Delete route tables
  ROUTE_TABLES=$(aws ec2 describe-route-tables --filters Name=vpc-id,Values=$VPC_ID --query 'RouteTables[*].RouteTableId' --output text)
  for RT in $ROUTE_TABLES; do
    # Skip the main route table
    IS_MAIN=$(aws ec2 describe-route-tables --route-table-id $RT --query 'RouteTables[0].Associations[?Main==`true`]' --output text)
    if [ -z "$IS_MAIN" ]; then
      echo "Deleting route table: $RT"
      aws ec2 delete-route-table --route-table-id $RT
    fi
  done
  
  # Finally delete the VPC
  echo "Deleting VPC: $VPC_ID"
  aws ec2 delete-vpc --vpc-id $VPC_ID
fi

echo "Deletion complete. Please verify in the AWS Console that all resources have been deleted successfully."