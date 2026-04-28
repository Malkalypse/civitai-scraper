# TODO

## Auth / Credentials

- [ ] Consider adding env var fallback for `SITE_AUTH_COOKIE` in `web/prefs.php`.
      Currently the token is loaded only from `web/local.secrets.php` (gitignored).
      Adding `getenv('CIVITAI_AUTH_COOKIE')` as a first-priority source would make
      CLI scripts and deployments on other machines work without needing the secrets
      file (token injected via Apache `SetEnv` or OS env var instead).
