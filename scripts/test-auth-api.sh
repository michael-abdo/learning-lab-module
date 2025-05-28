#!/bin/bash
# Script to test authentication on the Learning Lab API

# Terminal colors
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# API URL - change this to your deployed API URL if needed
API_URL="http://localhost:8080"

# Step 1: Login to get a token
echo -e "${BLUE}Step a: Logging in with valid credentials${NC}"
TOKEN=$(curl -s -X POST $API_URL/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "admin123"}' | grep -o '"token":"[^"]*' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
  echo -e "${RED}Failed to get token. Check if the server is running.${NC}"
  exit 1
fi

echo -e "${GREEN}Successfully obtained token: ${TOKEN:0:20}...${NC}"

# Step 2: Test the /auth/validate endpoint
echo -e "\n${BLUE}Step b: Testing token validation${NC}"
curl -s -X GET $API_URL/auth/validate \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json"
echo

# Step 3: Test accessing a protected endpoint (list documents)
echo -e "\n${BLUE}Step c: Testing access to protected documents endpoint${NC}"
curl -s -X GET $API_URL/documents \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json"
echo

# Step 4: Test with invalid token
echo -e "\n${BLUE}Step d: Testing access with invalid token${NC}"
curl -s -X GET $API_URL/documents \
  -H "Authorization: Bearer invalid.token.here" \
  -H "Content-Type: application/json"
echo

# Step 5: Test with missing token
echo -e "\n${BLUE}Step e: Testing access with missing token${NC}"
curl -s -X GET $API_URL/documents \
  -H "Content-Type: application/json"
echo

echo -e "\n${GREEN}Authentication tests completed${NC}"