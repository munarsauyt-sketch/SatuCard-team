# Security checks

Every pull request and push to main runs the application tests, npm vulnerability
audit, and a redacted Gitleaks scan of Git history. The workflows use read-only
repository permissions and pinned checkout/setup actions.

The Strix workflow is prepared separately. Add repository secrets `STRIX_LLM`
(a supported model ID) and `LLM_API_KEY` (a dedicated scanner key), then set
repository variable `STRIX_ENABLED=true` to enable scans for same-repository PRs.
Fork PRs receive the other security checks and never receive scanner credentials.
The workflow can also be started manually. A missing key or incomplete scan fails
that job. Each Strix run has a $10 model budget and may need more headroom for
complete coverage. The site's AnyModel key is reserved for the product.

Strix has not been run for this release because scanner credentials are absent.
The skill installed in Codex provides setup instructions. Running Strix requires
the scanner and a separate model key, or an authenticated Strix Cloud account.
