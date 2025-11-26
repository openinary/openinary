#!/bin/sh
# Wrapper script to run init-env.js and export variables for Docker
# This ensures BETTER_AUTH_SECRET is available as an environment variable

# Run init-env.js to generate/update .env file
node /app/scripts/init-env.js

# Load .env file and export variables to current shell and child processes
if [ -f /app/apps/api/.env ]; then
  # Read BETTER_AUTH_SECRET from .env file and export it
  # This makes it available to supervisor and child processes
  SECRET=$(grep "^BETTER_AUTH_SECRET=" /app/apps/api/.env | cut -d '=' -f2- | tr -d '"' | tr -d "'" | tr -d ' ')
  if [ -n "$SECRET" ] && [ "$SECRET" != "" ]; then
    export BETTER_AUTH_SECRET="$SECRET"
  fi
  
  # Also export other important variables if they exist
  if grep -q "^BETTER_AUTH_URL=" /app/apps/api/.env; then
    URL=$(grep "^BETTER_AUTH_URL=" /app/apps/api/.env | cut -d '=' -f2- | tr -d '"' | tr -d "'" | tr -d ' ')
    if [ -n "$URL" ]; then
      export BETTER_AUTH_URL="$URL"
    fi
  fi
fi

# If BETTER_AUTH_SECRET is still not set, use the one from environment (if provided)
if [ -z "$BETTER_AUTH_SECRET" ] || [ "$BETTER_AUTH_SECRET" = "" ]; then
  # Keep the existing value from environment if it exists
  if [ -n "${BETTER_AUTH_SECRET:-}" ]; then
    export BETTER_AUTH_SECRET="${BETTER_AUTH_SECRET}"
  fi
fi

