#!/bin/bash

# Invoice CLI Global Installer
# Usage: curl -sSL https://invoice.boidu.dev/install.sh | bash

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_status() { echo -e "${BLUE}[INFO]${NC} $1"; }
print_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
print_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
print_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Configuration
VERSION=1.0.4
GITHUB_REPO="boidushya/invoice.boidu.dev"
BINARY_URL="https://github.com/${GITHUB_REPO}/releases/download/v${VERSION}/index.js"
CLI_NAME="invoice"

main() {
    echo -e "${BLUE}⚡ Invoice CLI Global Installer${NC}"
    echo "====================================="
    echo ""

    # Check Node.js
    if ! command -v node &> /dev/null; then
        print_error "Node.js is required but not installed."
        echo "Please install Node.js (>=18) from: https://nodejs.org/"
        exit 1
    fi

    NODE_VERSION=1.0.3
    if [ "$NODE_VERSION" -lt 18 ]; then
        print_error "Node.js version $NODE_VERSION is not supported."
        echo "Please upgrade to Node.js 18 or higher."
        exit 1
    fi
    
    print_success "Node.js $(node -v) detected"

    # Determine installation directory
    if command -v npm &> /dev/null; then
        INSTALL_DIR=$(npm config get prefix)/bin
    else
        INSTALL_DIR="/usr/local/bin"
    fi

    # Create directory if it doesn't exist
    if [ ! -d "$INSTALL_DIR" ]; then
        print_status "Creating directory: $INSTALL_DIR"
        mkdir -p "$INSTALL_DIR" || {
            print_error "Failed to create $INSTALL_DIR. You may need to run with sudo."
            exit 1
        }
    fi

    # Check write permissions
    if [ ! -w "$INSTALL_DIR" ]; then
        print_error "No write permission to $INSTALL_DIR"
        echo "Try running with sudo: curl -sSL https://invoice.boidu.dev/install.sh | sudo bash"
        exit 1
    fi

    CLI_PATH="$INSTALL_DIR/$CLI_NAME"

    # Remove existing installation
    if [ -f "$CLI_PATH" ]; then
        print_warning "Removing existing installation..."
        rm -f "$CLI_PATH"
    fi

    # Download the CLI binary
    print_status "Downloading invoice-cli from GitHub releases..."
    
    if command -v curl &> /dev/null; then
        curl -sSL "$BINARY_URL" -o "$CLI_PATH" || {
            print_error "Failed to download from $BINARY_URL"
            echo "Please check your internet connection and try again."
            exit 1
        }
    elif command -v wget &> /dev/null; then
        wget -q "$BINARY_URL" -O "$CLI_PATH" || {
            print_error "Failed to download from $BINARY_URL"
            echo "Please check your internet connection and try again."
            exit 1
        }
    else
        print_error "Neither curl nor wget is available. Please install one of them."
        exit 1
    fi

    # Make executable
    chmod +x "$CLI_PATH"

    # Verify installation
    if [ -x "$CLI_PATH" ]; then
        print_success "invoice-cli installed to $CLI_PATH"
        
        # Test if command is available in PATH
        if command -v "$CLI_NAME" &> /dev/null; then
            VERSION=1.0.3
            print_success "Installation complete! Version: $VERSION"
        else
            print_warning "Installed but $INSTALL_DIR is not in your PATH"
            echo "Add this to your shell profile (.bashrc, .zshrc, etc.):"
            echo "  export PATH=\"$INSTALL_DIR:\$PATH\""
            echo ""
            echo "Or run directly: $CLI_PATH"
        fi
    else
        print_error "Installation failed - binary not executable"
        exit 1
    fi

    echo ""
    echo -e "${GREEN}🎉 Ready to use!${NC}"
    echo ""
    echo "Getting started:"
    echo -e "  ${GREEN}$CLI_NAME setup${NC}     # One-time account setup"
    echo -e "  ${GREEN}$CLI_NAME new${NC}       # Create your first invoice"
    echo -e "  ${GREEN}$CLI_NAME --help${NC}    # See all available commands"
    echo ""
    echo "Examples:"
    echo -e "  ${YELLOW}$CLI_NAME new -c acme -a 1500 -d \"Website redesign\"${NC}"
    echo -e "  ${YELLOW}$CLI_NAME stats${NC}"
    echo -e "  ${YELLOW}$CLI_NAME paid INV-XXX-001${NC}"
    echo ""
}

# Handle help
if [ "${1:-}" = "--help" ] || [ "${1:-}" = "-h" ]; then
    echo "Invoice CLI Installer"
    echo ""
    echo "This script downloads and installs invoice-cli globally from GitHub releases."
    echo ""
    echo "Usage:"
    echo "  curl -sSL https://invoice.boidu.dev/install.sh | bash"
    echo ""
    echo "Requirements:"
    echo "  - Node.js 18 or higher"
    echo "  - curl or wget"
    echo "  - Write access to installation directory"
    echo ""
    echo "The CLI will be installed to:"
    echo "  - \$(npm config get prefix)/bin/invoice-cli (if npm is available)"
    echo "  - /usr/local/bin/invoice-cli (fallback)"
    exit 0
fi

main "$@"