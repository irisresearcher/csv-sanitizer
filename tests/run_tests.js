const fs = require('fs');
const path = require('path');
const CSVSanitizer = require('../engine');

console.log('🧪 Starting Automated Tests for CSVSanitizer Engine...\n');

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    failed++;
  }
}

// Test 1: Delimiter Detection
const sampleComma = 'id,name,role\n1,john,admin\n2,mary,dev';
const sampleSemicolon = 'id;name;price\n1;drill;20\n2;hammer;15';
const sampleTab = 'id\tproduct\tqty\n10\tapples\t5\n11\toranges\t8';

assert(CSVSanitizer.detectDelimiter(sampleComma) === ',', 'Detects comma delimiter');
assert(CSVSanitizer.detectDelimiter(sampleSemicolon) === ';', 'Detects semicolon delimiter');
assert(CSVSanitizer.detectDelimiter(sampleTab) === '\t', 'Detects tab delimiter');

// Test 2: Unescaped Quotes Repair
const brokenQuote = '2,Bob "The Builder" Smith,bob@test.com,"Purchased "deluxe" item",50';
const repaired = CSVSanitizer.repairUnescapedQuotes(brokenQuote, ',');
assert(repaired.includes('""The Builder""') || repaired.includes('""deluxe""'), 'Correctly doubles internal quotes for RFC 4180');

// Test 3: Full Process on Corrupted Sample File
const samplePath = path.join(__dirname, '../test_data/corrupted_sample.csv');
const rawContent = fs.readFileSync(samplePath, 'utf8');

const result = CSVSanitizer.process(rawContent, {
  delimiter: 'auto',
  fixQuotes: true,
  trimWhitespace: true,
  deduplicate: true,
  removeEmptyRows: true,
  maskEmail: true,
  maskPhone: true,
  maskCreditCard: true
});

assert(result.headers.length === 7, `Correct headers count (got ${result.headers.length}, expected 7)`);
assert(result.stats.repairedRows > 0, `Repaired corrupted quote rows (repaired: ${result.stats.repairedRows})`);
assert(result.stats.duplicatesRemoved === 1, `Removed duplicate row (removed: ${result.stats.duplicatesRemoved})`);
assert(result.stats.emptyRowsRemoved >= 1, `Filtered blank row (filtered: ${result.stats.emptyRowsRemoved})`);
assert(result.stats.piiMaskedCount > 0, `Masked sensitive PII tokens (masked: ${result.stats.piiMaskedCount})`);

// Check that masked rows contain masked patterns
const allDataString = JSON.stringify(result.rows);
assert(allDataString.includes('***@'), 'Emails are masked');
assert(allDataString.includes('***-'), 'Phone numbers are masked');
assert(allDataString.includes('****-****-****-'), 'Credit card numbers are masked');

// Test 4: Exporters
const csvOut = CSVSanitizer.toCSV(result.headers, result.rows);
assert(csvOut.includes('id,customer_name,email'), 'Exports valid clean CSV');

const jsonOut = CSVSanitizer.toJSON(result.headers, result.rows);
const parsedJSON = JSON.parse(jsonOut);
assert(Array.isArray(parsedJSON) && parsedJSON.length === result.rows.length, 'Exports valid JSON array');

const mdOut = CSVSanitizer.toMarkdown(result.headers, result.rows);
assert(mdOut.includes('| id | customer_name |') && mdOut.includes('| --- |'), 'Exports valid Markdown table');

const sqlOut = CSVSanitizer.toSQL('customers', result.headers, result.rows);
assert(sqlOut.includes('INSERT INTO customers') && sqlOut.includes('VALUES'), 'Exports valid SQL statements');

console.log(`\n==========================================`);
console.log(`Test Summary: ${passed} Passed, ${failed} Failed`);
console.log(`==========================================\n`);

if (failed > 0) {
  process.exit(1);
}
