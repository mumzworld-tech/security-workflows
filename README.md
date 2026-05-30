# security-workflows

Shared supply chain security workflows for all Mumzworld repos.

### Usage

Add this to any repo's `.github/workflows/ci.yml`:

```yaml
jobs:
  supply-chain-scan:
    uses: mumzworld-tech/security-workflows/.github/workflows/supply-chain-scan.yml@main
```

That's it. The scan will:
1. Install [Bumblebee](https://github.com/perplexityai/bumblebee)
2. Fetch the latest exposure catalog from this repo
3. Scan the project for known-bad packages
4. Fail the CI if any exposed package is found

## Exposure Catalog

Edit `catalogs/exposure-catalog.json` to add new threats. When Prism Sentinel detects a compromised package, add it here — all repos will block it on next CI run.

### Catalog format

```json
{
  "schema_version": "0.1.0",
  "entries": [
    {
      "id": "unique-id",
      "name": "Human readable description",
      "ecosystem": "npm|pypi|go|packagist|rubygems",
      "package": "package-name",
      "versions": ["1.2.3"],
      "severity": "critical|high|medium|low"
    }
  ]
}
```

## Branch Protection (Enforcement)

To prevent devs from merging without the scan passing:

1. Repo → Settings → Branches → Branch protection rules → `master`
2. ✅ Require status checks to pass
3. Add `bumblebee` as a required check
