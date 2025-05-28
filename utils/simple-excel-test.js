const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');

// Test Excel functionality
async function testExcelProcessing() {
  try {
    // Create a sample Excel file in memory
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Sheet1');
    
    // Add data
    worksheet.addRow(['Name', 'Age', 'City']);
    worksheet.addRow(['John Doe', 30, 'New York']);
    worksheet.addRow(['Jane Smith', 25, 'San Francisco']);
    
    // Generate buffer
    const buffer = await workbook.xlsx.writeBuffer();
    
    // Now test reading the Excel file
    const readWorkbook = new ExcelJS.Workbook();
    await readWorkbook.xlsx.load(buffer);
    
    let text = '';
    readWorkbook.eachSheet((sheet, sheetId) => {
      sheet.eachRow((row, rowNumber) => {
        text += row.values.slice(1).join(',') + '\n';
      });
    });
    
    console.log('Excel processing test successful!');
    console.log('Extracted text:', text);
    return true;
  } catch (error) {
    console.error('Excel processing test failed:', error);
    return false;
  }
}

// Run the test
testExcelProcessing()
  .then(success => {
    console.log('Test completed with ' + (success ? 'success' : 'failure'));
    process.exit(success ? 0 : 1);
  })
  .catch(err => {
    console.error('Test error:', err);
    process.exit(1);
  });