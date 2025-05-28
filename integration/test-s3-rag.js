/**
 * S3 Vector Store and RAG Pipeline Test Runner
 * 
 * This script provides an easy way to run the various S3 vector store
 * and RAG pipeline tests.
 */

const { execSync } = require('child_process');

// Define test scripts
const TESTS = [
  {
    name: 'simple-rag-test',
    description: 'Simple RAG test with S3 Vector Store',
    script: 'tests/rag/simple-rag-test.js'
  },
  {
    name: 's3-vector-store',
    description: 'Advanced S3 Vector Store test',
    script: 'tests/rag/test-s3-vector-store.js'
  },
  {
    name: 'rag-pipeline-real-data',
    description: 'Full RAG Pipeline test with real documents',
    script: 'tests/rag/test-rag-pipeline-real-data.js'
  }
];

/**
 * Print usage instructions
 */
function printUsage() {
  console.log('S3 Vector Store and RAG Pipeline Test Runner\n');
  console.log('Usage: node test-s3-rag.js [test-name]\n');
  console.log('Available tests:');
  TESTS.forEach(test => {
    console.log(`  ${test.name} - ${test.description}`);
  });
  console.log('\nExample: node test-s3-rag.js simple-rag-test');
  console.log('\nIf no test name is provided, the simple-rag-test will run by default.');
}

/**
 * Run the specified test
 */
function runTest(testName) {
  const test = TESTS.find(t => t.name === testName);
  
  if (!test) {
    console.error(`\nError: Test "${testName}" not found\n`);
    printUsage();
    process.exit(1);
  }
  
  console.log(`\nRunning test: ${test.name} - ${test.description}\n`);
  
  try {
    execSync(`node ${test.script}`, { stdio: 'inherit' });
    console.log(`\n✅ Test "${test.name}" completed successfully\n`);
  } catch (error) {
    console.error(`\n❌ Test "${test.name}" failed\n`);
    process.exit(1);
  }
}

// Main execution
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  printUsage();
  process.exit(0);
}

const testName = process.argv[2] || 'simple-rag-test';
runTest(testName);