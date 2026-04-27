/**
 * Quick setup test for the backend migration
 * Run this to verify basic functionality without full npm install
 */

const http = require('http');
const { spawn } = require('child_process');
const path = require('path');

console.log('🔧 Backend Migration Test Setup');
console.log('================================\n');

// Test 1: Check Node.js version
console.log('1. Checking Node.js version...');
const nodeVersion = process.version;
console.log(`   Node.js version: ${nodeVersion}`);

if (parseInt(nodeVersion.split('.')[0].substring(1)) < 18) {
  console.log('   ⚠️  Warning: Node.js 18+ recommended');
} else {
  console.log('   ✅ Node.js version compatible');
}

// Test 2: Check project structure
console.log('\n2. Checking project structure...');
const fs = require('fs');

const requiredFiles = [
  'server/package.json',
  'server/src/app.js',
  'server/sql/init.sql',
  'docker-compose.yml',
  'extension/options/options.html',
  'extension/options/options.js',
  'extension/options/options.css'
];

let allFilesExist = true;
requiredFiles.forEach((file) => {
  const fullPath = path.join(__dirname, file);
  if (fs.existsSync(fullPath)) {
    console.log(`   ✅ ${file}`);
  } else {
    console.log(`   ❌ ${file} - MISSING`);
    allFilesExist = false;
  }
});

if (allFilesExist) {
  console.log('   ✅ All required files present');
} else {
  console.log('   ❌ Some files are missing');
}

// Test 3: Check environment setup
console.log('\n3. Checking environment setup...');
const envExamplePath = path.join(__dirname, 'server/.env.example');
const envPath = path.join(__dirname, 'server/.env');

if (fs.existsSync(envExamplePath)) {
  console.log('   ✅ .env.example file exists');
} else {
  console.log('   ❌ .env.example file missing');
}

if (fs.existsSync(envPath)) {
  console.log('   ✅ .env file exists');
} else {
  console.log("   ⚠️  .env file not found (you'll need to create this)");
}

// Test 4: Docker availability
console.log('\n4. Checking Docker availability...');
const dockerProcess = spawn('docker', ['--version'], { stdio: 'pipe' });
dockerProcess.on('close', (code) => {
  if (code === 0) {
    console.log('   ✅ Docker is available');
  } else {
    console.log('   ❌ Docker not found or not accessible');
  }
});

dockerProcess.on('error', () => {
  console.log('   ❌ Docker not found on system');
});

// Test 5: Port availability
console.log('\n5. Checking port availability...');
const checkPort = (port, name) => {
  return new Promise((resolve) => {
    const server = http.createServer();
    server.listen(port, () => {
      server.close();
      console.log(`   ✅ Port ${port} (${name}) is available`);
      resolve(true);
    });
    server.on('error', () => {
      console.log(`   ⚠️  Port ${port} (${name}) is in use`);
      resolve(false);
    });
  });
};

Promise.all([
  checkPort(4999, 'API Server'),
  checkPort(5432, 'PostgreSQL')
]).then(() => {
  console.log('\n🎉 Pre-flight check completed!');
  console.log('\nNext steps:');
  console.log('1. Create server/.env from server/.env.example');
  console.log('2. Set up Google Cloud Console OAuth credentials');
  console.log('3. Run: docker-compose up -d');
  console.log('4. Run: cd server && npm run db:migrate');
  console.log('5. Run: cd server && npm run dev');
});

// Export for testing
module.exports = {
  checkSetup: () => allFilesExist
};
