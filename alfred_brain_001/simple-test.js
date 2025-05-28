/**
 * Simple local test for the decision logic without dependencies
 */

// Decision logic implementation
const processHeartRate = (heartRate) => {
  if (heartRate > 180) {
    return {
      type: 'high_heart_rate',
      value: heartRate,
      message: 'High heart rate detected'
    };
  }
  return null;
};

const processSteps = (steps) => {
  if (steps < 2000) {
    return {
      type: 'low_steps',
      value: steps,
      message: 'Low daily step count detected'
    };
  }
  return null;
};

// Test cases
const testCases = [
  { name: 'High Heart Rate', heartRate: 190 },
  { name: 'Normal Heart Rate', heartRate: 75 },
  { name: 'Low Steps', steps: 1500 },
  { name: 'Normal Steps', steps: 8000 },
  { name: 'Combined High HR & Low Steps', heartRate: 190, steps: 1500 }
];

// Run tests
console.log('===== WEARABLE DATA DECISION LOGIC TEST =====');

let passed = 0;
let total = 0;

testCases.forEach(test => {
  console.log(`\n----- Test: ${test.name} -----`);
  
  // Check heart rate
  if (test.heartRate !== undefined) {
    total++;
    const result = processHeartRate(test.heartRate);
    
    console.log(`Heart Rate: ${test.heartRate} BPM`);
    if (test.heartRate > 180) {
      if (result && result.type === 'high_heart_rate') {
        console.log('✅ PASS: Correctly detected high heart rate');
        passed++;
      } else {
        console.log('❌ FAIL: Did not detect high heart rate when it should');
      }
    } else {
      if (!result) {
        console.log('✅ PASS: Correctly handled normal heart rate');
        passed++;
      } else {
        console.log('❌ FAIL: Generated alert for normal heart rate');
      }
    }
  }
  
  // Check steps
  if (test.steps !== undefined) {
    total++;
    const result = processSteps(test.steps);
    
    console.log(`Steps: ${test.steps} steps`);
    if (test.steps < 2000) {
      if (result && result.type === 'low_steps') {
        console.log('✅ PASS: Correctly detected low step count');
        passed++;
      } else {
        console.log('❌ FAIL: Did not detect low step count when it should');
      }
    } else {
      if (!result) {
        console.log('✅ PASS: Correctly handled normal step count');
        passed++;
      } else {
        console.log('❌ FAIL: Generated alert for normal step count');
      }
    }
  }
});

console.log('\n===== TEST SUMMARY =====');
console.log(`Tests Passed: ${passed}/${total} (${Math.round(passed/total*100)}%)`);

console.log('\n===== DECISION LOGIC RULES =====');
console.log('1. Alert if heart rate > 180 BPM');
console.log('2. Suggest activity if steps < 2000/day');

if (passed === total) {
  console.log('\n✅ All tests passed! The decision logic is working correctly.');
} else {
  console.log('\n❌ Some tests failed. Please check the decision logic implementation.');
}