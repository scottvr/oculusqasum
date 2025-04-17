# OculusQAsum Installation & Setup Guide

This guide will help you set up OculusQAsum, the comprehensive visual QA system for web interfaces.

## Prerequisites

- **Node.js**: Version 16.0.0 or higher
- **npm**: Version 7.0.0 or higher
- **Git**: For cloning the repository

## Installation Options

### Option 1: Install from GitHub

```bash
# Clone the repository
git clone https://github.com/yourusername/oculus-qasum.git
cd oculus-qasum

# Install dependencies
npm install

# Make CLI executable
chmod +x cli.js

# Link package globally (optional)
npm link
```

### Option 2: Install from npm (once published)

```bash
# Install globally
npm install -g oculus-qasum

# Or install locally in your project
npm install --save-dev oculus-qasum
```

## Required API Keys & Tokens

OculusQAsum requires several API keys and tokens for full functionality. Create a `.env` file in the root directory with the following variables:

```
# LLM API Keys (at least one is required for fix generation)
OPENAI_API_KEY=your-openai-api-key
ANTHROPIC_API_KEY=your-anthropic-api-key

# GitHub Integration (required for issue & PR creation)
GITHUB_TOKEN=your-github-token
GITHUB_OWNER=your-github-username
GITHUB_REPO=your-github-repo
```

## Project Structure

Ensure your project structure looks like this:

```
oculus-qasum/
├── .env                      # Environment variables
├── cli.js                    # CLI entry point
├── index.js                  # Main module
├── oculus-qasum.config.yml   # Configuration file
├── package.json              # Package info
├── node_modules/             # Dependencies
└── src/
    ├── core/
    │   ├── comparison-engine.js
    │   ├── fix-generator.js
    │   └── live-monitor.js
    └── integrations/
        └── issue-tracker.js
```

## Browser Dependencies

Playwright will be installed as a dependency, but you'll need to install browser binaries:

```bash
npx playwright install chromium
```

## Configuration

Generate a default configuration file:

```bash
npx oculus-qasum init
```

This creates an `oculus-qasum.config.yml` file in your current directory. Edit this file to customize OculusQAsum for your project.

## Verification

Verify the installation by running:

```bash
npx oculus-qasum --version
```

## Usage Examples

### Compare Design with Implementation

```bash
npx oculus-qasum compare --design path/to/design.png --implementation https://yoursite.com
```

### Start Monitoring

```bash
npx oculus-qasum monitor --create-baselines
```

### Run a Quick Check

```bash
npx oculus-qasum monitor --once
```

## Troubleshooting

### Missing Dependencies

If you encounter errors about missing dependencies:

```bash
npm install --no-save missing-package-name
```

### Browser Launch Issues

If Playwright fails to launch browsers:

```bash
# Reinstall browsers
npx playwright install --force

# For Linux, you might need additional dependencies
apt-get install -y libgbm-dev libwoff1 libopus0 libwebp6 libwebpdemux2 libenchant1c2a libgudev-1.0-0 libsecret-1-0 libhyphen0 libgdk-pixbuf2.0-0
```

### API Rate Limiting

If you encounter rate limiting with GitHub or LLM APIs:

1. Check your API usage quotas
2. Implement request throttling in the configuration
3. Use a different API key or token

## Next Steps

Once installed, proceed to the [User Guide](./USER_GUIDE.md) for detailed usage instructions.

## Support

If you encounter any issues not covered in this guide, please open an issue on the GitHub repository.
