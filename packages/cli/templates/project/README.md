# {{PROJECT_NAME}}

A self-hosted [Openinary](https://github.com/openinary/openinary) instance,
managed by the `openinary` CLI.

## Commands

```sh
openinary start     # start services
openinary stop      # stop services (data preserved)
openinary restart   # restart services
openinary upgrade   # update to the latest compatible version
openinary reset      # wipe local data and start fresh (destructive)
```

## Dashboard

Once started, visit http://localhost:{{PORT}} to create your admin account
and generate an API key.
