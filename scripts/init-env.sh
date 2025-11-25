#!/bin/bash
# Script to initialize environment variables for Docker containers
# Generates BETTER_AUTH_SECRET if not already set

echo "🔧 Initializing environment..."

# Generate BETTER_AUTH_SECRET if not set
if [ -z "$BETTER_AUTH_SECRET" ] || [ "$BETTER_AUTH_SECRET" = "your-secret-key-here-generate-with-openssl-rand-hex-32" ]; then
    echo "🔑 Generating BETTER_AUTH_SECRET..."
    export BETTER_AUTH_SECRET=$(openssl rand -hex 32)
    echo "✅ BETTER_AUTH_SECRET generated successfully"
else
    echo "✅ Using existing BETTER_AUTH_SECRET"
fi

echo "✅ Environment initialized"

