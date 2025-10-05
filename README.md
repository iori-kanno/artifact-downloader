# artifacts-cli

A CLI tool to search and download artifacts from Xcode Cloud (via App Store Connect) and Firebase App Distribution.

## Features

- 🔍 **Search artifacts** from multiple sources with flexible filtering
- 📥 **Download artifacts** by version, artifact ID, or latest build
- 📋 **List products** from both App Store Connect and Firebase App Distribution  
- 🔐 **Authentication check** - verify credentials and connectivity
- 🎯 **Smart filtering** by artifact type, platform, version, build number
- 📊 **Multiple output formats** (table, JSON) with jq-friendly JSON
- ⚡ **Interactive selection** for App Store Connect artifact types
- 🚀 **Simple subcommand structure** with helpful aliases
- 🔧 **Built with TypeScript** and ES modules for reliability

## Installation

### Via npm (Recommended)

```bash
npm install -g artifacts-cli
```

### From Source

```bash
# Clone the repository
git clone https://github.com/iori-kanno/artifacts-cli.git
cd artifacts-cli

# Install dependencies
npm install

# Build the project
npm run build

# Link globally (optional)
npm link
```

## Configuration

### Authentication Setup

The tool supports both environment variables and configuration files for authentication.

#### App Store Connect (Xcode Cloud)

1. **Create an API Key in App Store Connect:**
   - Go to [App Store Connect](https://appstoreconnect.apple.com/)
   - Navigate to Users and Access → Keys
   - Click "+" to create a new key
   - Select appropriate permissions (at least "Developer" role)
   - Download the .p8 private key file
   - Note the Key ID and Issuer ID

2. **Set up authentication:**

   **Option A: Environment Variables**
   ```bash
   export APPSTORE_KEY_ID="YOUR_KEY_ID"
   export APPSTORE_ISSUER_ID="YOUR_ISSUER_ID"
   export APPSTORE_PRIVATE_KEY_PATH="/path/to/AuthKey_YOUR_KEY_ID.p8"
   ```

   **Option B: Configuration File**
   Create a `config.json` in one of these locations:
   - `./config.json` (project root)
   - `./.artifact-downloader/config.json`
   - `~/.artifact-downloader/config.json`

   ```json
   {
     "appStoreConnect": {
       "keyId": "YOUR_KEY_ID",
       "issuerId": "YOUR_ISSUER_ID",
       "privateKeyPath": "/path/to/AuthKey_YOUR_KEY_ID.p8"
     }
   }
   ```

#### Firebase App Distribution

1. **Create a Service Account:**
   - Go to [Firebase Console](https://console.firebase.google.com/)
   - Select your project
   - Go to Project Settings → Service Accounts
   - Click "Generate new private key"
   - Save the JSON file securely

2. **Set up authentication:**

   **Option A: Environment Variables**
   ```bash
   export FIREBASE_PROJECT_ID="your-project-id"
   export FIREBASE_SERVICE_ACCOUNT_PATH="/path/to/service-account.json"
   ```

   **Option B: Configuration File**
   ```json
   {
     "firebase": {
       "projectId": "your-project-id",
       "serviceAccountPath": "/path/to/service-account.json"
     }
   }
   ```

### Security Notes

- Never commit authentication files (`.p8`, `service-account.json`) to version control
- Use `config.local.json` for local development (already in .gitignore)
- Store sensitive files outside your project directory when possible

## Quick Start

```bash
# Check authentication setup
artifacts-cli auth-check

# List available products
artifacts-cli list-products

# Search for artifacts (with helpful aliases)
artifacts-cli search --app-id com.example.app --from app-distribution
artifacts-cli ls --app-id com.example.app --from app-distribution  # alias

# Download latest artifact
artifacts-cli download latest --app-id com.example.app --from app-distribution
artifacts-cli dl latest --app-id com.example.app --from app-distribution  # alias
```

## Usage

### Important Note for App Store Connect

For App Store Connect (Xcode Cloud), the `--app-id` parameter should be the **Xcode Cloud product name** (usually your repository name), **NOT the bundle ID**.

To find your product name:
```bash
artifacts-cli list-products --from app-store-connect
```

### Authentication Check

Before using other commands, verify your authentication setup:

```bash
# Check all providers
artifacts-cli auth-check

# Check specific provider with details
artifacts-cli auth-check --from app-store-connect --verbose
artifacts-cli auth-check --from app-distribution --verbose
```

### List Products

```bash
# List all products from all providers
artifacts-cli list-products

# List from specific provider
artifacts-cli list-products --from app-store-connect
artifacts-cli list-products --from app-distribution

# Filter by platform
artifacts-cli list-products --platform android
artifacts-cli list-products --platform ios

# JSON output for scripting
artifacts-cli list-products --format json
artifacts-cli search-products --format json  # alias
```

### Search for Artifacts

```bash
# Basic search (multiple aliases available)
artifacts-cli search --app-id com.example.app --from app-distribution
artifacts-cli list --app-id com.example.app --from app-distribution    # alias
artifacts-cli ls --app-id com.example.app --from app-distribution      # alias

# Search with filters
artifacts-cli search --app-id com.example.app --from app-store-connect \
  --version 1.0.0 \
  --artifact-type ad_hoc \
  --limit 5

# JSON output for scripting
artifacts-cli search --app-id com.example.app --from app-distribution --format json
```

### Download Artifacts

The tool supports various version formats:

```bash
# Download latest artifact (with aliases)
artifacts-cli download latest --app-id com.example.app --from app-store-connect
artifacts-cli dl latest --app-id com.example.app --from app-distribution  # alias

# Download with version + build number formats
artifacts-cli download v1.0.0+20 --app-id com.example.app --from app-store-connect
artifacts-cli download 1.0.0+20 --app-id com.example.app --from app-distribution
artifacts-cli download "1.0.0(20)" --app-id com.example.app --from app-store-connect
artifacts-cli download "v1.0.0(20)" --app-id com.example.app --from app-distribution

# Download to specific directory
artifacts-cli download v1.0.0+20 --app-id com.example.app --from app-store-connect \
  --output ./my-artifacts/

# Download specific artifact type
artifacts-cli download v1.0.0+20 --app-id com.example.app --from app-store-connect \
  --artifact-type ad_hoc

# Download by artifact ID (from search results) - slower than version-based download
artifacts-cli download 8e9b6538-cf22-4794-ac12-b981f96c6b8f --app-id com.example.app --from app-store-connect
```

## Command Reference

All commands are subcommands of `artifacts-cli`. Run `artifacts-cli --help` for a complete list.

### `artifacts-cli auth-check`

Check authentication configuration and connectivity for all or specific providers.

**Usage:**
```bash
artifacts-cli auth-check [options]
```

**Options:**
- `--from <provider>`: Check specific provider (`app-store-connect`, `app-distribution`, or `all`, default: `all`)
- `--verbose`: Show detailed information
- `--debug`: Enable debug logging

### `artifacts-cli list-products`

List available products from App Store Connect and/or Firebase App Distribution.

**Usage:**
```bash
artifacts-cli list-products [options]
```

**Aliases:** `search-products`

**Options:**
- `--from <provider>`: Provider to list from (`app-store-connect`, `app-distribution`, or `all`, default: `all`)
- `--platform <platform>`: Filter by platform (`ios`, `android`, or `all`, default: `all`)
- `--format <format>`: Output format (`table` or `json`, default: `table`)
- `--debug`: Enable debug logging

### `artifacts-cli search`

Search for artifacts in the specified provider.

**Usage:**
```bash
artifacts-cli search [options]
```

**Aliases:** `list`, `ls`

**Options:**
- `--app-id <id>` (required): App identifier (Xcode Cloud product name for app-store-connect, Bundle/Package ID for app-distribution)
- `--from <provider>` (required): Provider to search from (`app-store-connect` or `app-distribution`)
- `--limit <number>`: Maximum number of results (default: 3)
- `--version <version>`: Filter by version
- `--build-number <number>`: Filter by build number
- `--artifact-type <type>`: Filter by artifact type
- `--format <format>`: Output format (`table` or `json`, default: `table`)
- `--debug`: Enable debug logging

### `artifacts-cli download`

Download a specific artifact version.

**Usage:**
```bash
artifacts-cli download <version-or-id> [options]
```

**Aliases:** `dl`

**Arguments:**
- `<version-or-id>`: Version to download (supports formats like `v1.0.0+20`, `"1.0.0(20)"` - use quotes for parentheses), artifact ID, or `latest` for the most recent artifact

**Performance Note:** Using version strings is faster than artifact IDs. Artifact ID downloads require searching through recent builds first.

**Options:**
- `--app-id <id>` (required): App identifier (Xcode Cloud product name for app-store-connect, Bundle/Package ID for app-distribution)
- `--from <provider>` (required): Provider to download from (`app-store-connect` or `app-distribution`)
- `--output <path>`: Output directory or file path (default: `./downloads`)
- `--artifact-type <type>`: Artifact type to download
- `--debug`: Enable debug logging

## Artifact Types

### App Store Connect (iOS)
- `ipa`: Generic IPA file
- `ad_hoc`: Ad Hoc distribution
- `development`: Development build
- `app_store`: App Store distribution

### Firebase App Distribution
- `ipa`: iOS app
- `apk`: Android APK
- `aab`: Android App Bundle

## Examples

### Example 1: Search and Download Latest iOS Build

```bash
# Search for latest builds
artifacts-cli search --app-id com.mycompany.app --from app-store-connect --limit 5

# Download specific version
artifacts-cli download v2.1.0+45 --app-id com.mycompany.app --from app-store-connect
```

### Example 2: Automated CI/CD Integration

```bash
#!/bin/bash
# ci-download.sh

# Set up environment
export APPSTORE_KEY_ID="${CI_APPSTORE_KEY_ID}"
export APPSTORE_ISSUER_ID="${CI_APPSTORE_ISSUER_ID}"
export APPSTORE_PRIVATE_KEY_PATH="${CI_APPSTORE_KEY_PATH}"

# Download latest ad-hoc build
LATEST=$(artifacts-cli search --app-id "MyApp" --from app-store-connect \
  --artifact-type ad_hoc --limit 1 --format json | jq -r '.[0].version + "+" + .[0].buildNumber')

artifacts-cli download "$LATEST" --app-id "MyApp" --from app-store-connect \
  --artifact-type ad_hoc --output ./test-builds/

# Note: Using version strings (like $LATEST) is faster than using artifact IDs
```

### Example 3: Cross-Platform Testing

```bash
# Download iOS and Android builds for testing
artifacts-cli download v1.5.0+100 --app-id com.mycompany.app --from app-store-connect \
  --output ./ios-build/

artifacts-cli download v1.5.0+100 --app-id com.mycompany.app --from app-distribution \
  --output ./android-build/
```

## Development

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Run tests
npm test

# Lint code
npm run lint

# Format code
npm run format

# Build for production
npm run build
```

## Troubleshooting

### "Configuration is missing or incomplete"
Ensure all required environment variables or config file entries are set correctly. Use `artifacts-cli auth-check --verbose` to diagnose authentication issues, or `artifacts-cli --help` to see available commands.

### "Product/App not found"
- For App Store Connect: Use the repository name (not the app name)
- For Firebase: Use the bundle ID, package ID, or app ID

### "No artifacts found"
- Check if the version and build number are correct
- Ensure the build has completed successfully
- Verify the artifact type matches what was built

### "Download URL not available"
Some older builds might not have download URLs available. Try a more recent build.

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

MIT License - see LICENSE file for details
