/**
 * test-bedrock-pipeline.js
 * 
 * This script tests the complete pipeline:
 * 1. Upload a document with specific information
 * 2. Ask a question that only that document can answer
 * 3. Verify document retrieval and LLM response
 */

require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const { uploadFileToS3 } = require('./services/s3Service');
const DocumentModel = require('./models/documentModel');
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

// Set test document content with unique information
const testDocContent = `
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
`;

async function testPipeline() {
  try {
    console.log('===== TESTING BEDROCK PIPELINE =====');
    
    // Connect to MongoDB
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI, {
      tls: true,
    });
    console.log('Connected to MongoDB');
    
    // 1. Create and upload the test document
    console.log('\n1. CREATING TEST DOCUMENT');
    const tempFilePath = path.join(__dirname, 'test-document.txt');
    fs.writeFileSync(tempFilePath, testDocContent);
    
    // Upload to S3
    console.log('Uploading document to S3...');
    const s3Key = `test-docs/apollo18-report-${Date.now()}.txt`;
    await uploadFileToS3(s3Key, fs.readFileSync(tempFilePath));
    console.log('Document uploaded to S3:', s3Key);
    
    // Create document record
    const docName = 'Apollo 18 Mission Report';
    const doc = new DocumentModel({
      userId: 'test-user-id',
      name: docName,
      filename: path.basename(s3Key),
      fileType: 'text/plain',
      s3Key: s3Key,
      tags: ['classified', 'mission-report', 'apollo'],
      status: 'processed',
      textS3Key: s3Key // Since it's already text
    });
    await doc.save();
    console.log('Document record created:', doc._id);
    
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
    console.log('Response status:', res.status.mock.calls);
    console.log('Response body:', res.json.mock.calls[0][0]);
    
    // Check if the answer contains key information
    const answer = res.json.mock.calls[0][0].answer;
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
    
    // Cleanup
    console.log('\nCleaning up...');
    await DocumentModel.findByIdAndDelete(doc._id);
    fs.unlinkSync(tempFilePath);
    
    console.log('Test completed successfully');
  } catch (error) {
    console.error('Test failed:', error);
  } finally {
    await mongoose.disconnect();
  }
}

// Auto-run test if executed directly
if (require.main === module) {
  testPipeline()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('Fatal error:', err);
      process.exit(1);
    });
}

module.exports = { testPipeline };