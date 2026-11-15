#!/bin/sh
# Sourced by the Docker images' CMD: a child process cannot export to its
# parent, so init-env.js prints the exports and this shell evals them for the
# servers (and supervisord) started after it.

if INIT_ENV_EXPORTS=$(cd /app && node scripts/init-env.js --shell); then
  eval "$INIT_ENV_EXPORTS"
else
  echo "Warning: init-env.js failed, continuing with existing environment variables"
fi
unset INIT_ENV_EXPORTS
