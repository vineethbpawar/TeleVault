const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '../.env');

function check() {
  console.log('--- Marketing Demo Mode Integrity Check ---');
  let isEnabled = false;

  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    if (envContent.includes('EXPO_PUBLIC_MARKETING_MODE=true')) {
      isEnabled = true;
    }
  }

  console.log(`Current Status: ${isEnabled ? 'ACTIVE (Marketing Mode ON)' : 'INACTIVE (Production Mode / Marketing Mode OFF)'}`);

  // Check demo data files
  const demoDataPath = path.join(__dirname, '../src/marketing/demoData.ts');
  if (fs.existsSync(demoDataPath)) {
    console.log('✅ Demo Mock Data: Present');
  } else {
    console.warn('❌ Demo Mock Data: Missing!');
  }

  // Check demo script files
  const checklistPath = path.join(__dirname, '../src/marketing/demoChecklist.md');
  if (fs.existsSync(checklistPath)) {
    console.log('✅ Demo Checklist Documentation: Present');
  } else {
    console.warn('❌ Demo Checklist Documentation: Missing!');
  }

  console.log('Integrity check completed successfully.');
}

check();
