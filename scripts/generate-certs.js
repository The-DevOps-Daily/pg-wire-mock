#!/usr/bin/env node

/**
 * Certificate Generation Script for PostgreSQL Mock Server
 * Generates self-signed SSL certificates for testing SSL/TLS connections
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Configuration
const CERTS_DIR = path.join(__dirname, '..', 'certs');
const CERT_CONFIG = {
  country: 'US',
  state: 'TestState',
  city: 'TestCity',
  organization: 'PostgreSQL Mock Server',
  organizationalUnit: 'Development',
  commonName: 'localhost',
  emailAddress: 'test@example.com',
  keySize: 2048,
  validityDays: 365,
};

/**
 * Creates the certificates directory if it doesn't exist
 */
function createCertsDirectory() {
  if (!fs.existsSync(CERTS_DIR)) {
    fs.mkdirSync(CERTS_DIR, { recursive: true });
    console.log(`✓ Created certificates directory: ${CERTS_DIR}`);
  } else {
    console.log(`✓ Certificates directory already exists: ${CERTS_DIR}`);
  }
}

/**
 * Checks if OpenSSL is available
 * @returns {boolean} True if OpenSSL is available
 */
function checkOpenSSL() {
  try {
    execSync('openssl version', { stdio: 'pipe' });
    const version = execSync('openssl version', { encoding: 'utf8' }).trim();
    console.log(`✓ OpenSSL found: ${version}`);
    return true;
  } catch (error) {
    console.error('✗ OpenSSL not found. Please install OpenSSL to generate certificates.');
    console.error('  On Windows: Download from https://slproweb.com/products/Win32OpenSSL.html');
    console.error('  On macOS: brew install openssl');
    console.error('  On Ubuntu/Debian: sudo apt-get install openssl');
    return false;
  }
}

/**
 * Generates a private key
 * @param {string} keyPath - Path to save the private key
 */
function generatePrivateKey(keyPath) {
  console.log('🔑 Generating private key...');

  const command = `openssl genrsa -out "${keyPath}" ${CERT_CONFIG.keySize}`;

  try {
    execSync(command, { stdio: 'pipe' });
    console.log(`✓ Private key generated: ${keyPath}`);
  } catch (error) {
    console.error(`✗ Failed to generate private key: ${error.message}`);
    throw error;
  }
}

/**
 * Generates a self-signed certificate
 * @param {string} keyPath - Path to the private key
 * @param {string} certPath - Path to save the certificate
 */
function generateCertificate(keyPath, certPath) {
  console.log('📜 Generating self-signed certificate...');

  const subject = [
    `/C=${CERT_CONFIG.country}`,
    `/ST=${CERT_CONFIG.state}`,
    `/L=${CERT_CONFIG.city}`,
    `/O=${CERT_CONFIG.organization}`,
    `/OU=${CERT_CONFIG.organizationalUnit}`,
    `/CN=${CERT_CONFIG.commonName}`,
    `/emailAddress=${CERT_CONFIG.emailAddress}`,
  ].join('');

  // Complex command with process substitution (not used due to cross-platform issues)

  try {
    // For cross-platform compatibility, use a simpler command without process substitution
    const simpleCommand = [
      'openssl req',
      '-new',
      '-x509',
      `-key "${keyPath}"`,
      `-out "${certPath}"`,
      `-days ${CERT_CONFIG.validityDays}`,
      `-subj "${subject}"`,
    ].join(' ');

    execSync(simpleCommand, { stdio: 'pipe' });
    console.log(`✓ Certificate generated: ${certPath}`);
  } catch (error) {
    console.error(`✗ Failed to generate certificate: ${error.message}`);
    throw error;
  }
}

/**
 * Generates a certificate configuration file for advanced features
 * @param {string} configPath - Path to save the configuration file
 */
function generateCertConfig(configPath) {
  const config = `
[req]
distinguished_name = req_distinguished_name
req_extensions = v3_req
prompt = no

[req_distinguished_name]
C = ${CERT_CONFIG.country}
ST = ${CERT_CONFIG.state}
L = ${CERT_CONFIG.city}
O = ${CERT_CONFIG.organization}
OU = ${CERT_CONFIG.organizationalUnit}
CN = ${CERT_CONFIG.commonName}
emailAddress = ${CERT_CONFIG.emailAddress}

[v3_req]
keyUsage = keyEncipherment, dataEncipherment
extendedKeyUsage = serverAuth
subjectAltName = @alt_names

[alt_names]
DNS.1 = localhost
DNS.2 = 127.0.0.1
IP.1 = 127.0.0.1
IP.2 = ::1
`.trim();

  fs.writeFileSync(configPath, config);
  console.log(`✓ Certificate configuration saved: ${configPath}`);
}

/**
 * Displays certificate information
 * @param {string} certPath - Path to the certificate
 */
function displayCertificateInfo(certPath) {
  console.log('\n📋 Certificate Information:');

  try {
    const command = `openssl x509 -in "${certPath}" -text -noout`;
    const output = execSync(command, { encoding: 'utf8' });

    // Extract key information
    const lines = output.split('\n');
    const subject = lines.find(line => line.trim().startsWith('Subject:'));
    const issuer = lines.find(line => line.trim().startsWith('Issuer:'));
    const validity = lines.find(line => line.trim().startsWith('Not Before:'));
    const validityEnd = lines.find(line => line.trim().startsWith('Not After:'));

    if (subject) console.log(`   ${subject.trim()}`);
    if (issuer) console.log(`   ${issuer.trim()}`);
    if (validity) console.log(`   ${validity.trim()}`);
    if (validityEnd) console.log(`   ${validityEnd.trim()}`);
  } catch (error) {
    console.warn(`⚠️  Could not display certificate info: ${error.message}`);
  }
}

/**
 * Creates usage instructions
 */
function displayUsageInstructions() {
  console.log('\n🚀 Usage Instructions:');
  console.log('');
  console.log('1. Enable SSL in your server configuration:');
  console.log('   export PG_MOCK_ENABLE_SSL=true');
  console.log('   export PG_MOCK_SSL_CERT_PATH=./certs/server.crt');
  console.log('   export PG_MOCK_SSL_KEY_PATH=./certs/server.key');
  console.log('');
  console.log('2. Start the server:');
  console.log('   npm run dev');
  console.log('');
  console.log('3. Test SSL connection with psql:');
  console.log('   psql "sslmode=require host=localhost port=5433 dbname=postgres user=postgres"');
  console.log('');
  console.log('4. Test with Node.js pg client:');
  console.log('   const client = new Client({');
  console.log('     host: "localhost",');
  console.log('     port: 5433,');
  console.log('     ssl: { rejectUnauthorized: false }');
  console.log('   });');
  console.log('');
  console.log('⚠️  Note: These are self-signed certificates for development only!');
  console.log(
    '   Do not use in production. For production, obtain certificates from a trusted CA.'
  );
}

/**
 * Main function to generate certificates
 */
function main() {
  console.log('🔐 PostgreSQL Mock Server - SSL Certificate Generator');
  console.log('=====================================================\n');

  try {
    // Check prerequisites
    if (!checkOpenSSL()) {
      process.exit(1);
    }

    // Create certificates directory
    createCertsDirectory();

    // Define file paths
    const keyPath = path.join(CERTS_DIR, 'server.key');
    const certPath = path.join(CERTS_DIR, 'server.crt');
    const configPath = path.join(CERTS_DIR, 'cert.conf');

    // Check if certificates already exist
    if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
      const answer = process.argv.includes('--force')
        ? 'y'
        : require('readline-sync')?.question('Certificates already exist. Overwrite? (y/N): ') ||
          'n';

      if (answer.toLowerCase() !== 'y') {
        console.log('✓ Using existing certificates');
        displayCertificateInfo(certPath);
        displayUsageInstructions();
        return;
      }
    }

    // Generate certificate configuration
    generateCertConfig(configPath);

    // Generate private key
    generatePrivateKey(keyPath);

    // Generate certificate
    generateCertificate(keyPath, certPath);

    // Set appropriate file permissions (Unix-like systems)
    if (process.platform !== 'win32') {
      try {
        execSync(`chmod 600 "${keyPath}"`);
        execSync(`chmod 644 "${certPath}"`);
        console.log('✓ Set appropriate file permissions');
      } catch (error) {
        console.warn('⚠️  Could not set file permissions:', error.message);
      }
    }

    // Display certificate information
    displayCertificateInfo(certPath);

    // Display usage instructions
    displayUsageInstructions();

    console.log('\n✅ SSL certificates generated successfully!');
  } catch (error) {
    console.error('\n❌ Certificate generation failed:', error.message);
    process.exit(1);
  }
}

// Handle command line arguments
if (require.main === module) {
  // Try to install readline-sync for interactive prompts
  try {
    require('readline-sync');
  } catch (error) {
    // readline-sync not available, will use --force flag instead
  }

  main();
}

module.exports = {
  main,
  generatePrivateKey,
  generateCertificate,
  generateCertConfig,
  checkOpenSSL,
  CERTS_DIR,
  CERT_CONFIG,
};
