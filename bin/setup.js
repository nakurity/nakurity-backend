#!/usr/bin/env node

/**
 * Nakurity Backend Setup
 * Initializes repository, installs deps, and optionally deploys
 */

const { spawnSync, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
  yellow: '\x1b[33m'
};

function log(msg, color = 'reset') {
  console.log(`${colors[color]}${msg}${colors.reset}`);
}

function run(cmd, opts = {}) {
  const res = spawnSync(cmd, { stdio: 'inherit', shell: true, ...opts });
  if (res.status !== 0 && !opts.ignoreError) {
    process.exit(res.status || 1);
  }
  return res;
}

function generateApiKey() {
  return crypto.randomBytes(32).toString('hex');
}

async function main() {
  const args = process.argv.slice(2);
  const flags = {
    init: args.includes('--init'),
    deploy: args.includes('--deploy'),
    build: args.includes('--build'),
    help: args.includes('--help') || args.includes('-h')
  };

  if (flags.help) {
    console.log(`
Nakurity Backend Setup

Usage:
  nakurity-setup [options]

Options:
  --init      Initialize git repo and install dependencies
  --deploy    Deploy to Vercel
  --build     Build standalone binary with pkg
  --help, -h  Show this help message

Examples:
  nakurity-setup --init          # First-time setup
  nakurity-setup --deploy        # Deploy to production
  nakurity-setup --build         # Build executable
    `);
    return;
  }

  log('=== Nakurity Backend Setup ===', 'blue');

  const rootDir = path.join(__dirname, '..');

  if (flags.init) {
    log('\n→ Initializing repository...', 'green');
    
    // Init git if not already
    if (!fs.existsSync(path.join(rootDir, '.git'))) {
      run('git init', { cwd: rootDir });
      log('  ✓ Git initialized', 'green');
    }
    
    // Create .env.example
    const envExample = `# Groq API Key (get from https://console.groq.com)
GROQ_API_KEY=your_groq_api_key_here

# Neuro-OS API Key (generate secure random key)
NEURO_OS_API_KEY=${generateApiKey()}
`;
    fs.writeFileSync(path.join(rootDir, '.env.example'), envExample);
    log('  ✓ Created .env.example', 'green');
    
    // Create .gitignore
    const gitignore = `node_modules/
.env
.vercel
dist/
*.log
`;
    fs.writeFileSync(path.join(rootDir, '.gitignore'), gitignore);
    log('  ✓ Created .gitignore', 'green');
    
    // Install dependencies
    log('\n→ Installing dependencies...', 'green');
    run('npm install', { cwd: rootDir });
    log('  ✓ Dependencies installed', 'green');
    
    // Create README
    const readme = `# Nakurity Backend

Groq-powered vision API for Neuro-OS

## Setup

1. Copy \`.env.example\` to \`.env\`
2. Add your Groq API key from https://console.groq.com
3. Deploy: \`npm run deploy\`

## API Endpoint

\`POST https://backend.nakurity.com/neuro-os/vision\`

Headers:
- \`X-API-Key\`: Your Neuro-OS API key
- \`Content-Type\`: application/json

Body:
\`\`\`json
{
  "image": "base64_encoded_image",
  "prompt": "Optional custom prompt"
}
\`\`\`

## Local Development

\`\`\`bash
npm run dev
\`\`\`

## Deployment

\`\`\`bash
npm run deploy
\`\`\`
`;
    fs.writeFileSync(path.join(rootDir, 'README.md'), readme);
    log('  ✓ Created README.md', 'green');
    
    log('\n✓ Setup complete!', 'green');
    log('\nNext steps:', 'yellow');
    log('  1. Copy .env.example to .env', 'yellow');
    log('  2. Add your Groq API key to .env', 'yellow');
    log('  3. Run: npm run deploy', 'yellow');
  }

  if (flags.deploy) {
    log('\n→ Deploying to Vercel...', 'green');
    
    if (!fs.existsSync(path.join(rootDir, '.env'))) {
      log('⚠ Warning: .env file not found', 'yellow');
      log('  Make sure to set secrets in Vercel dashboard:', 'yellow');
      log('  - GROQ_API_KEY', 'yellow');
      log('  - NEURO_OS_API_KEY', 'yellow');
    }
    
    run('vercel --prod', { cwd: rootDir });
    log('\n✓ Deployed successfully!', 'green');
  }

  if (flags.build) {
    log('\n→ Building standalone binary...', 'green');
    
    // Build with pkg
    run('npx pkg . --out-path dist', { cwd: rootDir });
    
    log('\n✓ Binary built in dist/', 'green');
    log('  Run: ./dist/setup-win.exe (or setup-linux/setup-macos)', 'green');
  }

  if (!flags.init && !flags.deploy && !flags.build) {
    log('\nNo action specified. Use --help for usage.', 'yellow');
  }
}

main().catch(err => {
  log(`\n✗ Error: ${err.message}`, 'red');
  process.exit(1);
});
