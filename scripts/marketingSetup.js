const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '../.env');

function setup() {
  console.log('--- Marketing Demo Mode Setup ---');
  let envContent = '';
  if (fs.existsSync(envPath)) {
    envContent = fs.readFileSync(envPath, 'utf8');
  }

  const key = 'EXPO_PUBLIC_MARKETING_MODE';
  const val = 'true';
  const line = `${key}=${val}`;

  if (envContent.includes(key)) {
    envContent = envContent.replace(new RegExp(`${key}=.*`), line);
    console.log(`Updated existing config: ${line}`);
  } else {
    envContent += `\n${line}\n`;
    console.log(`Added new config: ${line}`);
  }

  fs.writeFileSync(envPath, envContent.trim() + '\n', 'utf8');
  console.log('SUCCESS: Marketing Demo Mode enabled in .env.');
}

setup();
