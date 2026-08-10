const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '../.env');

function reset() {
  console.log('--- Marketing Demo Mode Reset ---');
  if (!fs.existsSync(envPath)) {
    console.log('No .env file found. Nothing to reset.');
    return;
  }

  let envContent = fs.readFileSync(envPath, 'utf8');
  const key = 'EXPO_PUBLIC_MARKETING_MODE';

  if (envContent.includes(key)) {
    envContent = envContent.replace(new RegExp(`${key}=.*`), `${key}=false`);
    fs.writeFileSync(envPath, envContent.trim() + '\n', 'utf8');
    console.log('SUCCESS: Marketing Demo Mode disabled (set to false) in .env.');
  } else {
    console.log('Marketing Demo Mode configuration was not present in .env.');
  }
}

reset();
