/**
 * Test script to verify AWS Bedrock connectivity and model access
 */

require('dotenv').config();
const { BedrockRuntimeClient, InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');

async function testBedrockConnectivity() {
  console.log('=== TESTING BEDROCK CONNECTIVITY ===');
  
  try {
    // Verify environment variables
    if (!process.env.AWS_REGION) {
      console.log('AWS_REGION not found in environment variables. Using default: us-east-1');
      process.env.AWS_REGION = 'us-east-1';
    }
    
    console.log(`Using AWS region: ${process.env.AWS_REGION}`);
    
    // Create the Bedrock client
    const bedrockClient = new BedrockRuntimeClient({
      region: process.env.AWS_REGION,
    });
    
    // Ensure we have a model ID to test with
    const modelId = process.env.BEDROCK_MODEL_ID || 'anthropic.claude-3-sonnet-20240229-v1:0';
    console.log(`Testing with model: ${modelId}`);
    
    // Format the request body based on the model
    let requestBody;
    
    if (modelId.includes('anthropic.claude')) {
      // Claude models
      requestBody = {
        anthropic_version: "bedrock-2023-05-31",
        max_tokens: 100,
        messages: [
          {
            role: "user", 
            content: "Please respond with 'Bedrock connectivity test successful' if you can read this message."
          }
        ]
      };
    } else if (modelId.includes('amazon.titan')) {
      // Titan models
      requestBody = {
        inputText: "Please respond with 'Bedrock connectivity test successful' if you can read this message.",
        textGenerationConfig: {
          maxTokenCount: 100,
          temperature: 0.7,
          topP: 0.9
        }
      };
    } else if (modelId.includes('meta.llama')) {
      // Llama models
      requestBody = {
        prompt: "Please respond with 'Bedrock connectivity test successful' if you can read this message.",
        temperature: 0.7,
        top_p: 0.9,
        max_gen_len: 100
      };
    } else {
      // Default format
      requestBody = {
        prompt: "Please respond with 'Bedrock connectivity test successful' if you can read this message.",
        max_tokens: 100
      };
    }
    
    // Make the API call
    console.log('Sending request to Bedrock...');
    const command = new InvokeModelCommand({
      modelId: modelId,
      contentType: "application/json",
      accept: "application/json",
      body: JSON.stringify(requestBody)
    });
    
    // Send the command and process the response
    const response = await bedrockClient.send(command);
    const responseBody = JSON.parse(new TextDecoder().decode(response.body));
    
    // Extract the text based on model type
    let responseText = '';
    
    if (modelId.includes('anthropic.claude')) {
      // Claude models
      if (responseBody.content && responseBody.content[0] && responseBody.content[0].text) {
        responseText = responseBody.content[0].text;
      }
    } else if (modelId.includes('amazon.titan')) {
      // Titan models
      if (responseBody.results && responseBody.results[0] && responseBody.results[0].outputText) {
        responseText = responseBody.results[0].outputText;
      }
    } else if (modelId.includes('meta.llama')) {
      // Llama models
      if (responseBody.generation) {
        responseText = responseBody.generation;
      }
    } else {
      // Generic format
      responseText = JSON.stringify(responseBody);
    }
    
    // Print the response
    console.log('\n=== BEDROCK RESPONSE ===');
    console.log(responseText);
    
    // Check if the test was successful
    if (responseText.includes('successful')) {
      console.log('\n✅ BEDROCK CONNECTION TEST SUCCESSFUL!');
    } else {
      console.log('\n⚠️ BEDROCK RESPONSE RECEIVED, BUT DOES NOT CONTAIN EXPECTED TEXT');
      console.log('The connection works, but the model may have responded differently than expected.');
    }
    
    return true;
  } catch (error) {
    console.error('\n❌ BEDROCK CONNECTION TEST FAILED');
    console.error('Error details:', error);
    
    // Provide troubleshooting guidance based on error type
    if (error.name === 'AccessDeniedException' || error.message.includes('Access Denied')) {
      console.error('\nTROUBLESHOOTING TIPS:');
      console.error('- Check your AWS credentials (AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY)');
      console.error('- Verify your IAM permissions for Bedrock');
      console.error('- Ensure you have requested access to the model in the AWS Bedrock console');
    } else if (error.name === 'ValidationException' && error.message.includes('not found')) {
      console.error('\nTROUBLESHOOTING TIPS:');
      console.error('- The specified model ID does not exist or is not accessible');
      console.error('- Verify that you have requested access to the model in the AWS Bedrock console');
      console.error('- Check that the model ID is correct');
      console.error('- Available models: anthropic.claude-*, amazon.titan-*, meta.llama*');
    } else if (error.message.includes('Could not connect to the endpoint URL')) {
      console.error('\nTROUBLESHOOTING TIPS:');
      console.error('- Check your internet connection');
      console.error('- Verify that the AWS region is correct');
      console.error('- Ensure that Bedrock is available in the specified region');
    }
    
    return false;
  }
}

// Run the test if this script is executed directly
if (require.main === module) {
  testBedrockConnectivity()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

module.exports = { testBedrockConnectivity };