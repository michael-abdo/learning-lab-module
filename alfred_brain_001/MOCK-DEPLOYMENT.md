# Alfred Brain Mock Environment

This document explains how to use the Alfred Brain mock environment for testing and demonstration purposes.

## Overview

The mock environment is a fully functional simulation of the Alfred Brain system that:

1. Runs locally without requiring any external dependencies
2. Uses in-memory mock implementations instead of actual AWS services and MongoDB
3. Provides realistic API responses for all endpoints
4. Allows testing the system without whitelisting your IP in MongoDB Atlas

## Quick Start

To start the mock environment, run:

```bash
./start-mock-environment.sh
```

This will:
1. Stop any existing Node.js processes
2. Create a mock server implementation
3. Start the server using PM2 (or directly if PM2 is not available)

## Accessing the Mock Environment

Once started, the mock server will be available at:

- Health Check: http://localhost:3000/health
- Terra API: http://localhost:3000/api/terra
- Analysis API: http://localhost:3000/api/analysis

## Checking Status

To verify the mock environment is running correctly:

```bash
./check-mock-status.sh
```

This will display:
- PM2 process status
- Server information
- Available endpoints
- Status of mock components

## Mock Components

The following components are mocked in this environment:

1. **MongoDB Atlas**: Replaced with an in-memory mock implementation
2. **AWS Lambda Functions**: Simulated within the local server
3. **TryTerra API**: Returns realistic mock data for development
4. **Authentication**: Simplified for testing purposes

## Test Data

The mock environment includes the following test data:

- Mock users with IDs: `mock_user_1` and `mock_user_2`
- Sample wearable data for each user
- Mock health and activity metrics

## Managing the Mock Environment

To stop the mock server:

```bash
pm2 stop alfred-brain-mock
```

To view logs:

```bash
pm2 logs alfred-brain-mock
```

To restart the server:

```bash
pm2 restart alfred-brain-mock
```

## Real vs. Mock Environment

### Mock Environment Advantages:
- Works without external dependencies
- No need for AWS credentials or MongoDB Atlas whitelisting
- Fast startup and testing
- No costs for AWS services or MongoDB Atlas

### Real Environment Advantages:
- Uses actual production services
- Real data persistence
- Full AWS infrastructure integration
- Proper authentication and security

## Transitioning to Production

When ready to deploy to the real production environment:

1. Ensure your MongoDB Atlas IP whitelist includes your server
2. Deploy AWS infrastructure using `./deploy-all.sh`
3. Start the backend server with `./start-production.sh`
4. Verify deployment with `./check-status.sh`

For detailed production deployment instructions, see [PRODUCTION-DEPLOYMENT.md](./PRODUCTION-DEPLOYMENT.md).