#!/bin/bash

# Openinary Release Script
# This script helps create a new version release with proper tagging

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Functions
print_error() {
    echo -e "${RED}Error: $1${NC}" >&2
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

# Check if we're in a git repository
if ! git rev-parse --git-dir > /dev/null 2>&1; then
    print_error "Not in a git repository"
    exit 1
fi

# Check if working directory is clean
if [ -n "$(git status --porcelain)" ]; then
    print_warning "Working directory is not clean. Please commit or stash your changes first."
    git status --short
    exit 1
fi

# Get current version from latest Git tag (excluding pre-releases)
# Get all tags, filter out pre-releases (those with '-' after version number), sort, and get the latest
LATEST_TAG=$(git tag -l "v*" | grep -E "^v[0-9]+\.[0-9]+\.[0-9]+$" | sort -V | tail -1)
if [ -z "$LATEST_TAG" ]; then
    LATEST_TAG="v0.0.0"
fi
CURRENT_VERSION=${LATEST_TAG#v}  # Remove 'v' prefix
print_info "Current stable version: v${CURRENT_VERSION}"

# Parse semantic version
IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT_VERSION"

# Show release type options
echo ""
echo "Select release type:"
echo "  1) Patch (bug fixes)         - v${MAJOR}.${MINOR}.$((PATCH + 1))"
echo "  2) Minor (new features)      - v${MAJOR}.$((MINOR + 1)).0"
echo "  3) Major (breaking changes)  - v$((MAJOR + 1)).0.0"
echo "  4) Custom version"
echo ""
read -p "Enter choice [1-4]: " choice

case $choice in
    1)
        NEW_VERSION="${MAJOR}.${MINOR}.$((PATCH + 1))"
        RELEASE_TYPE="patch"
        ;;
    2)
        NEW_VERSION="${MAJOR}.$((MINOR + 1)).0"
        RELEASE_TYPE="minor"
        ;;
    3)
        NEW_VERSION="$((MAJOR + 1)).0.0"
        RELEASE_TYPE="major"
        ;;
    4)
        read -p "Enter version (without 'v' prefix): " CUSTOM_VERSION
        # Validate semver format
        if [[ ! $CUSTOM_VERSION =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9.-]+)?(\+[a-zA-Z0-9.-]+)?$ ]]; then
            print_error "Invalid version format. Use semantic versioning (e.g., 1.2.3, 1.2.3-beta, 1.2.3+build)"
            exit 1
        fi
        NEW_VERSION="$CUSTOM_VERSION"
        RELEASE_TYPE="custom"
        ;;
    *)
        print_error "Invalid choice"
        exit 1
        ;;
esac

NEW_TAG="v${NEW_VERSION}"

# Check if tag already exists
if git rev-parse "$NEW_TAG" >/dev/null 2>&1; then
    print_error "Tag ${NEW_TAG} already exists!"
    print_info "Existing tags matching this version:"
    git tag -l "${NEW_TAG}*" | head -5
    exit 1
fi

print_info "New version will be: ${NEW_TAG}"

# Confirm
echo ""
read -p "Continue with release ${NEW_TAG}? [y/N]: " confirm
if [[ ! $confirm =~ ^[Yy]$ ]]; then
    print_warning "Release cancelled"
    exit 0
fi

echo ""
print_info "Starting release process..."

# Remind user to update CHANGELOG.md manually
CHANGELOG_FILE="CHANGELOG.md"
if [ -f "$CHANGELOG_FILE" ]; then
    print_warning "Remember to manually update CHANGELOG.md for version ${NEW_TAG} before pushing"
else
    print_warning "CHANGELOG.md not found"
fi

echo ""
print_info "Ready to create tag ${NEW_TAG}"

# Create and push tag
git tag -a "$NEW_TAG" -m "Release ${NEW_TAG}"
print_success "Created tag ${NEW_TAG}"

echo ""
print_info "Ready to push to remote repository"
echo ""
echo "The following will be pushed:"
echo "  - Tag: ${NEW_TAG}"
echo ""
print_warning "This will trigger the CI/CD pipeline to:"
echo "  1. Build Docker images for API and Full"
echo "  2. Tag images with: ${NEW_TAG}, latest, ${MAJOR}.${MINOR}, ${MAJOR}"
echo "  3. Push images to Docker Hub"
echo "  4. Create a GitHub Release"
echo ""

read -p "Push to remote? [y/N]: " push_confirm
if [[ ! $push_confirm =~ ^[Yy]$ ]]; then
    print_warning "Changes committed and tagged locally but NOT pushed"
    print_info "You can push later with:"
    echo "  git push origin main"
    echo "  git push origin ${NEW_TAG}"
    exit 0
fi

# Push to remote
CURRENT_BRANCH=$(git branch --show-current)
git push origin "$CURRENT_BRANCH"
git push origin "$NEW_TAG"

print_success "Release ${NEW_TAG} complete!"
echo ""
print_info "Next steps:"
echo "  1. Monitor GitHub Actions: https://github.com/openinary/openinary/actions"
echo "  2. Check Docker Hub for new images"
echo "  3. Verify GitHub Release: https://github.com/openinary/openinary/releases/tag/${NEW_TAG}"
echo ""
print_info "Docker images will be available as:"
echo "  - openinary/openinary:${NEW_TAG}"
echo "  - openinary/openinary-api:${NEW_TAG}"
echo "  - openinary/openinary:${MAJOR}.${MINOR}"
echo "  - openinary/openinary-api:${MAJOR}.${MINOR}"
echo "  - openinary/openinary:${MAJOR}"
echo "  - openinary/openinary-api:${MAJOR}"