# Alfred Brain

## Overview

Alfred Brain is a comprehensive fitness data processing and analysis system with wearable device integration. The system collects, processes, and analyzes data from fitness wearables to generate personalized performance plans and health insights.

[![Node.js Version](https://img.shields.io/badge/node-v16+-brightgreen.svg)](https://nodejs.org/)
[![Express Version](https://img.shields.io/badge/express-v4.18.2-blue.svg)](https://expressjs.com/)
[![MongoDB](https://img.shields.io/badge/mongodb-v7.4.3-green.svg)](https://www.mongodb.com/)
[![TryTerra](https://img.shields.io/badge/TryTerra-API_Integrated-purple.svg)](https://tryterra.co/)

## Architecture

Alfred Brain implements a service-oriented architecture with a Node.js/Express backend that connects to wearable devices through the TryTerra API. The system uses MongoDB for data storage and integrates with Large Language Models for personalized insights.

**Current Architecture**:
```
┌─────────────────┐    ┌───────────────┐    ┌────────────────┐
│ Wearable Device │───▶│ TryTerra API  │───▶│ Alfred Brain   │
│  (User-facing)  │    │               │    │    Server      │
└─────────────────┘    └───────────────┘    └────────┬───────┘
                                                    │
                                                    ▼
                             ┌────────────────────────────────────┐
                             │            Services                │
                             │                                    │
       ┌───────────────────┐ │ ┌────────────────┐ ┌────────────┐ │
       │                   │ │ │                │ │            │ │
       │  MongoDB Atlas    │◀┼─┤ Data Processor │ │ Scheduler  │ │
       │                   │ │ │                │ │            │ │
       └───────────────────┘ │ └────────────────┘ └────────────┘ │
                             │                                    │
                             │ ┌────────────────┐ ┌────────────┐ │
                             │ │                │ │            │ │
                             │ │  LLM Analysis  │ │ API Routes │ │
                             │ │                │ │            │ │
                             │ └────────────────┘ └────────────┘ │
                             └────────────────────────────────────┘
```

## Features

- **TryTerra Integration**: Connect to 300+ wearable devices through single API
- **Automated Data Collection**: Scheduled fetching of user wearable data
- **Threshold-Based Alerts**: Automated alerts for health metrics outside normal ranges
- **LLM-Powered Insights**: AI-generated performance plans based on wearable data
- **Comprehensive Data Processing**: Process activity, sleep, nutrition, and body metrics
- **Webhook Support**: Real-time data updates from wearable devices
- **Performance Plans**: Personalized fitness and health recommendations

## Installation

### Prerequisites

- Node.js (v16+)
- MongoDB (local or Atlas)
- TryTerra API credentials

### Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/your-organization/alfred-brain.git
   cd alfred-brain
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env` file based on `.env.example`:
   ```bash
   cp .env.example .env
   ```

4. Configure environment variables in `.env`:
   ```
   # Database
   MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/alfred-brain
   
   # TryTerra API
   TRYTERRA_API_KEY_1=your-tryterra-api-key
   TRYTERRA_API_KEY_2=your-backup-key
   
   # LLM Integration
   OPENAI_API_KEY=your-openai-api-key
   
   # Server
   PORT=3000
   NODE_ENV=development
   ```

5. Start the server:
   ```bash
   npm start
   ```

For development with auto-restart:
```bash
npm run dev
```

## Mock Mode

Alfred Brain supports a mock mode for development without requiring real MongoDB or TryTerra connections:

```bash
./start-mock-environment.sh
```

This creates an in-memory MongoDB instance and mocks TryTerra API responses.

## API Documentation

### Authentication

```
POST /api/auth/login
```

### TryTerra Integration

```
GET  /api/terra/auth/widget          # Generate authentication widget
POST /api/terra/auth/callback        # Handle TryTerra auth callback
POST /api/terra/webhook              # Webhook for data updates
GET  /api/terra/user/:userId/data    # Fetch user's wearable data
POST /api/terra/user/:userId/process # Process user's wearable data
```

### Performance Plans

```
POST /api/analysis/generate-plan     # Generate performance plan
GET  /api/analysis/plan/:planId      # Get performance plan
GET  /api/analysis/plan-insights/:planId # Get plan insights
```

See [NATIVE-SERVICES.md](./NATIVE-SERVICES.md) for complete API documentation.

## Service Documentation

Alfred Brain implements several key services:

- **TryTerra Service**: Manages communication with TryTerra API
- **Terra Scheduler Service**: Handles periodic data fetching
- **Wearable Data Processor**: Processes wearable data and generates alerts
- **LLM Analysis Service**: Analyzes data using AI models

See [NATIVE-SERVICES.md](./NATIVE-SERVICES.md) for detailed service documentation.

## Testing

Run tests:
```bash
npm test
```

Run specific test suite:
```bash
npm run test:mock      # Run with mocked dependencies
npm run test:decision-logic # Test threshold-based decision logic
```

Local testing without full infrastructure:
```bash
node scripts/local-test.js
```

## Deployment

Alfred Brain supports several deployment options:

1. **Mock Deployment**: For development and testing
   ```bash
   ./start-mock-environment.sh
   ```

2. **Production Deployment**: Full deployment with MongoDB Atlas
   ```bash
   ./start-production.sh
   ```

See [PRODUCTION-DEPLOYMENT.md](./PRODUCTION-DEPLOYMENT.md) for detailed production deployment instructions.

## License

This project is proprietary and confidential.

## Authors

- Runtheons Team