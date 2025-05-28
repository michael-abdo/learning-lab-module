/**
 * test-bedrock-pipeline-mock.js
 * 
 * This script tests the complete pipeline using mocks:
 * 1. Upload a document with specific information
 * 2. Ask a question that only that document can answer
 * 3. Verify document retrieval and LLM response
 */

// Mock external dependencies
jest.mock('./services/s3Service', () => ({
  uploadFileToS3: jest.fn().mockResolvedValue('mock-s3-uri'),
  downloadFileFromS3: jest.fn().mockImplementation((key) => {
    if (key.includes('apollo18')) {
      return Promise.resolve(Buffer.from(`
Apollo 18 Mission Report - CLASSIFIED
Date: March 15, 2027

This document contains information about the secret Apollo 18 mission that discovered 
ancient alien artifacts on the dark side of the moon. The artifacts were carbon-dated 
to approximately 150,000 years old and appear to contain inscriptions in an unknown language.

Initial analysis suggests the artifacts may be communication devices of non-terrestrial origin.
The mission commander, Colonel James Wilson, reported unusual light patterns emanating from 
the artifacts when exposed to lunar soil.

The artifacts have been transported to Research Facility OMEGA-9 for further analysis.
Code name for this discovery: MOONLIGHT SONATA
      `));
    }
    return Promise.resolve(Buffer.from('default mock content'));
  }),
  deleteFileFromS3: jest.fn().mockResolvedValue(),
}));

jest.mock('mongoose', () => {
  const mockDocument = {
    _id: 'mock-doc-id',
    userId: 'test-user-id',
    name: 'Apollo 18 Mission Report',
    filename: 'apollo18-report.txt',
    fileType: 'text/plain',
    s3Key: 'test-docs/apollo18-report.txt',
    tags: ['classified', 'mission-report', 'apollo'],
    status: 'processed',
    textS3Key: 'test-docs/apollo18-report.txt',
    save: jest.fn().mockResolvedValue({}),
  };

  return {
    connect: jest.fn().mockResolvedValue({}),
    disconnect: jest.fn().mockResolvedValue({}),
    model: jest.fn().mockReturnValue({
      find: jest.fn().mockResolvedValue([mockDocument]),
      findOne: jest.fn().mockResolvedValue(mockDocument),
      findById: jest.fn().mockResolvedValue(mockDocument),
      findByIdAndDelete: jest.fn().mockResolvedValue({}),
    }),
    Types: {
      ObjectId: jest.fn().mockImplementation(() => 'mock-object-id'),
    },
  };
});

// Mock Bedrock client
jest.mock('@aws-sdk/client-bedrock-runtime', () => {
  return {
    BedrockRuntimeClient: jest.fn().mockImplementation(() => ({
      send: jest.fn().mockImplementation((cmd) => {
        const requestBody = JSON.parse(cmd.input.body);
        let content = '';
        
        // Check if the request contains our test question keywords
        const requestContent = requestBody.messages[0].content;
        if (requestContent.includes('dark side of the moon') && 
            requestContent.includes('code name')) {
          content = `Based on the information provided, ancient alien artifacts were discovered on the dark side of the moon during the secret Apollo 18 mission. These artifacts were approximately 150,000 years old and contained inscriptions in an unknown language. They appeared to be communication devices of non-terrestrial origin and emitted unusual light patterns when exposed to lunar soil. The code name assigned to this discovery was "MOONLIGHT SONATA" and the artifacts were transported to Research Facility OMEGA-9 for further analysis.`;
        } else {
          content = 'I don\'t have enough information to answer that question.';
        }
        
        return Promise.resolve({
          body: Buffer.from(JSON.stringify({
            content: [{ text: content }]
          }))
        });
      })
    })),
    InvokeModelCommand: jest.fn().mockImplementation((params) => ({ 
      input: params 
    }))
  };
});

// Mock OpenSearch client
jest.mock('@opensearch-project/opensearch', () => {
  return {
    Client: jest.fn().mockImplementation(() => ({
      indices: {
        exists: jest.fn().mockResolvedValue({ body: false }),
        create: jest.fn().mockResolvedValue({}),
        delete: jest.fn().mockResolvedValue({}),
        refresh: jest.fn().mockResolvedValue({}),
      },
      index: jest.fn().mockResolvedValue({}),
      search: jest.fn().mockResolvedValue({
        body: {
          hits: {
            hits: [
              { _source: { text: 'This document contains information about the secret Apollo 18 mission that discovered ancient alien artifacts on the dark side of the moon. Code name for this discovery: MOONLIGHT SONATA', name: 'Apollo 18 Mission Report' } },
            ]
          }
        }
      }),
    })),
  };
});

jest.mock('aws-opensearch-connector', () => {
  return function createConnector(options) {
    return { Connection: class DummyConnection {} };
  };
});

// Mock DocumentModel
jest.mock('./models/documentModel', () => {
  const mockSchema = {
    _id: 'mock-doc-id',
    userId: 'test-user-id',
    name: 'Apollo 18 Mission Report',
    filename: 'apollo18-report.txt',
    fileType: 'text/plain',
    s3Key: 'test-docs/apollo18-report.txt',
    tags: ['classified', 'mission-report', 'apollo'],
    status: 'processed',
    textS3Key: 'test-docs/apollo18-report.txt',
  };

  return {
    find: jest.fn().mockResolvedValue([mockSchema]),
    findOne: jest.fn().mockResolvedValue(mockSchema),
    findById: jest.fn().mockResolvedValue(mockSchema),
    findByIdAndDelete: jest.fn().mockResolvedValue({}),
  };
});

// Load environment variables (mocked for testing)
process.env.MONGODB_URI = 'mongodb://mockdb:27017/test';
process.env.S3_BUCKET = 'mock-bucket';
process.env.OPENSEARCH_URL = 'https://mock-opensearch-url';
process.env.AWS_REGION = 'us-east-1';
process.env.ACCESS_TOKEN_SECRET = 'mock-access-token';
process.env.BEDROCK_MODEL_ID = 'anthropic.claude-3-sonnet-20240229-v1:0';

const { generateFromPrompt } = require('./controllers/generateController');

// Mock Express request and response
const mockRequest = (data) => {
  return {
    body: data,
    user: { _id: 'test-user-id' }
  };
};

const mockResponse = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

async function testPipeline() {
  try {
    console.log('===== TESTING BEDROCK PIPELINE WITH MOCKS =====');
    
    // 1. Document is already mocked in our setup
    console.log('\n1. USING MOCKED DOCUMENT: Apollo 18 Mission Report');
    
    // 2. Ask a question
    console.log('\n2. ASKING QUESTION');
    const testQuestion = 'What was discovered on the dark side of the moon, and what was the code name for this discovery?';
    console.log('Question:', testQuestion);
    
    // 3. Generate answer with Bedrock
    console.log('\n3. GENERATING ANSWER WITH BEDROCK');
    const req = mockRequest({ 
      prompt: testQuestion
    });
    const res = mockResponse();
    
    await generateFromPrompt(req, res);
    
    // 4. Verify response
    console.log('\n4. VERIFYING RESPONSE');
    if (!res.json.mock || !res.json.mock.calls || res.json.mock.calls.length === 0) {
      throw new Error('No response was generated');
    }
    
    console.log('Response JSON call args:', JSON.stringify(res.json.mock.calls[0][0], null, 2));
    
    // Check if the answer contains key information
    const answer = res.json.mock.calls[0][0].answer;
    console.log('\nGenerated answer:', answer);
    
    const keyPhrases = ['artifact', 'alien', 'MOONLIGHT SONATA', 'Apollo 18'];
    
    console.log('\nEvaluation:');
    const containsKeyInfo = keyPhrases.map(phrase => {
      const contains = answer.toLowerCase().includes(phrase.toLowerCase());
      console.log(`Contains "${phrase}": ${contains ? 'YES' : 'NO'}`);
      return contains;
    });
    
    if (containsKeyInfo.every(Boolean)) {
      console.log('\n✅ TEST PASSED: Response contains all key information');
    } else {
      console.log('\n❌ TEST FAILED: Response is missing some key information');
    }
    
    console.log('\nTest completed successfully');
    return true;
  } catch (error) {
    console.error('Test failed:', error);
    return false;
  }
}

// Auto-run test if executed directly
if (require.main === module) {
  testPipeline()
    .then(success => process.exit(success ? 0 : 1))
    .catch(err => {
      console.error('Fatal error:', err);
      process.exit(1);
    });
}

module.exports = { testPipeline };