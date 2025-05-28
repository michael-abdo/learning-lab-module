/**
 * Test Runner for Learning Lab Module
 * 
 * This script provides an easy way to run all tests or specific test categories.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Define test categories
const TEST_CATEGORIES = {
  'all': 'Run all tests',
  'unit': 'Run unit tests',
  'integration': 'Run integration tests',
  'bedrock': 'Run AWS Bedrock connectivity tests',
  'auth': 'Run authentication tests',
  'rag': 'Run RAG pipeline tests'
};

/**
 * Print usage instructions
 */
function printUsage() {
  console.log('Learning Lab Module Test Runner\n');
  console.log('Usage: node tests/run-tests.js [category]\n');
  console.log('Available test categories:');
  
  Object.entries(TEST_CATEGORIES).forEach(([category, description]) => {
    console.log(`  ${category} - ${description}`);
  });
  
  console.log('\nExample: node tests/run-tests.js rag');
  console.log('\nIf no category is provided, all tests will run by default.');
}

/**
 * Find test files in directory
 */
function findTestFiles(dir) {
  try {
    return fs.readdirSync(dir)
      .filter(file => file.endsWith('.js'))
      .map(file => path.join(dir, file));
  } catch (error) {
    console.error(`Error reading directory ${dir}:`, error.message);
    return [];
  }
}

/**
 * Run tests by category
 */
function runTests(category = 'all') {
  if (!TEST_CATEGORIES[category]) {
    console.error(`\nError: Test category "${category}" not found\n`);
    printUsage();
    process.exit(1);
  }
  
  console.log(`\nRunning ${category} tests...\n`);
  
  try {
    switch (category) {
      case 'all':
        // Run all tests using Jest
        execSync('npx jest', { stdio: 'inherit' });
        break;
        
      case 'unit':
        execSync('npx jest tests/unit', { stdio: 'inherit' });
        break;
        
      case 'integration':
        // For integration tests, run them individually
        const integrationTests = findTestFiles(path.join(__dirname, 'integration'));
        integrationTests.forEach(testFile => {
          console.log(`\nRunning test: ${path.basename(testFile)}`);
          execSync(`node ${testFile}`, { stdio: 'inherit' });
        });
        break;
        
      case 'bedrock':
        // Run Bedrock connectivity tests
        const bedrockTests = findTestFiles(path.join(__dirname, 'bedrock'));
        bedrockTests.forEach(testFile => {
          console.log(`\nRunning test: ${path.basename(testFile)}`);
          execSync(`node ${testFile}`, { stdio: 'inherit' });
        });
        break;
        
      case 'auth':
        // Run auth tests
        const authTests = findTestFiles(path.join(__dirname, 'auth'));
        authTests.forEach(testFile => {
          console.log(`\nRunning test: ${path.basename(testFile)}`);
          execSync(`node ${testFile}`, { stdio: 'inherit' });
        });
        break;
        
      case 'rag':
        // Run RAG-specific tests
        console.log('Running S3 Vector Store and RAG Pipeline tests');
        execSync('node tests/integration/test-s3-rag.js', { stdio: 'inherit' });
        break;
    }
    
    console.log(`\n✅ ${category} tests completed successfully\n`);
  } catch (error) {
    console.error(`\n❌ ${category} tests failed\n`);
    process.exit(1);
  }
}

// Main execution
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  printUsage();
  process.exit(0);
}

const category = process.argv[2] || 'all';
runTests(category);