# Workflow Inference Robustness

- [ ] Add more robust default values and workflow inference logic for cases where only minimal generation parameters are supplied (e.g., only 'Steps' or prompt present). This should ensure that the workflow builder and UI can still provide a meaningful result or clear messaging, even when most parameters are missing.
# TODO

## Auth / Credentials

- [ ] Consider adding env var fallback for `SITE_AUTH_COOKIE` in `web/prefs.php`.
      Currently the token is loaded only from `web/local.secrets.php` (gitignored).
      Adding `getenv('CIVITAI_AUTH_COOKIE')` as a first-priority source would make
      CLI scripts and deployments on other machines work without needing the secrets
      file (token injected via Apache `SetEnv` or OS env var instead).
