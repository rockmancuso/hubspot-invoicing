#!/usr/bin/env node

/**
 * Test script to demonstrate month control functionality
 * Run with: node test-month-control.js
 */

const config = require('./src/config');

// Mock the calculateTargetDate function for testing
function calculateTargetDate() {
  const monthOffset = config.INVOICE_GENERATION_MONTH_OFFSET || 0;
  const dayOfMonth = config.INVOICE_GENERATION_DAY_OF_MONTH || 0;
  
  const today = new Date();
  const targetMonth = today.getMonth() + monthOffset;
  const targetYear = today.getFullYear() + Math.floor(targetMonth / 12);
  const adjustedMonth = targetMonth % 12;
  
  let targetDate;
  
  if (dayOfMonth === 0) {
    // Last day of the target month
    targetDate = new Date(targetYear, adjustedMonth + 1, 0);
  } else {
    // Specific day of the target month
    targetDate = new Date(targetYear, adjustedMonth, dayOfMonth);
  }
  
  // Set to midnight UTC
  targetDate.setUTCHours(0, 0, 0, 0);
  
  return targetDate;
}

console.log('=== HubSpot Invoice Month Control Test ===\n');

const today = new Date();
console.log(`Current date: ${today.toISOString().slice(0, 10)}`);
console.log(`Current month: ${today.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}\n`);

// Test different configurations
const testConfigs = [
  { monthOffset: 0, dayOfMonth: 0, description: 'Current month, last day (default)' },
  { monthOffset: 1, dayOfMonth: 0, description: 'Next month, last day (recommended for early billing)' },
  { monthOffset: 2, dayOfMonth: 0, description: 'Two months ahead, last day' },
  { monthOffset: 1, dayOfMonth: 15, description: 'Next month, 15th day' },
  { monthOffset: 0, dayOfMonth: 1, description: 'Current month, 1st day' },
];

testConfigs.forEach(test => {
  // Temporarily override config
  const originalMonthOffset = config.INVOICE_GENERATION_MONTH_OFFSET;
  const originalDayOfMonth = config.INVOICE_GENERATION_DAY_OF_MONTH;
  
  config.INVOICE_GENERATION_MONTH_OFFSET = test.monthOffset;
  config.INVOICE_GENERATION_DAY_OF_MONTH = test.dayOfMonth;
  
  const targetDate = calculateTargetDate();
  
  console.log(`${test.description}:`);
  console.log(`  Config: INVOICE_GENERATION_MONTH_OFFSET=${test.monthOffset}, INVOICE_GENERATION_DAY_OF_MONTH=${test.dayOfMonth}`);
  console.log(`  Target date: ${targetDate.toISOString().slice(0, 10)}`);
  console.log(`  Target month: ${targetDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`);
  console.log(`  Days from now: ${Math.ceil((targetDate - today) / (1000 * 60 * 60 * 24))}`);
  console.log('');
  
  // Restore original config
  config.INVOICE_GENERATION_MONTH_OFFSET = originalMonthOffset;
  config.INVOICE_GENERATION_DAY_OF_MONTH = originalDayOfMonth;
});

console.log('=== Environment Variable Examples ===');
console.log('');
console.log('# Generate invoices this month for members expiring next month (recommended):');
console.log('INVOICE_GENERATION_MONTH_OFFSET=1');
console.log('INVOICE_GENERATION_DAY_OF_MONTH=0');
console.log('');
console.log('# Generate invoices this month for members expiring in 2 months:');
console.log('INVOICE_GENERATION_MONTH_OFFSET=2');
console.log('INVOICE_GENERATION_DAY_OF_MONTH=0');
console.log('');
console.log('# Generate invoices for members expiring on the 15th of next month:');
console.log('INVOICE_GENERATION_MONTH_OFFSET=1');
console.log('INVOICE_GENERATION_DAY_OF_MONTH=15');
console.log('');
console.log('# Current default (last day of current month):');
console.log('INVOICE_GENERATION_MONTH_OFFSET=0');
console.log('INVOICE_GENERATION_DAY_OF_MONTH=0'); 