# CD Pipeline – Required GitHub Secrets

Go to your GitHub repository → **Settings → Secrets and variables → Actions → New repository secret**

## Secrets to Add

| Secret Name | Where to Get It | Required |
|---|---|---|
| `CATALYST_TOKEN` | Zoho Catalyst Dashboard → API Token | ✅ |
| `CATALYST_PROJECT_ID` | Zoho Catalyst Dashboard → Project Settings | ✅ |
| `CATALYST_PROJECT_DOMAIN` | Your AppSail URL subdomain prefix | ✅ |
| `GHCR_PAT` | GitHub → Settings → Developer Settings → Personal Access Tokens (classic) with `read:packages` scope | ✅ |

> **Note:** `GITHUB_TOKEN` is automatically available — no setup needed. It's used to **push** images to GHCR.
> `GHCR_PAT` is a separate PAT used by **Catalyst** (external system) to **pull** your private images.

---

## Step-by-Step: Get the Catalyst Token

1. Go to [https://catalyst.zoho.com](https://catalyst.zoho.com)
2. Open your project → **Settings** → **API Token**
3. Generate a new token and copy it
4. Add it as `CATALYST_TOKEN` in GitHub Secrets

## Step-by-Step: Get the Catalyst Project ID

1. In Catalyst Dashboard, open your project
2. The Project ID is visible in the URL: `catalyst.zoho.com/project/<PROJECT_ID>/...`
3. Add it as `CATALYST_PROJECT_ID`

## Step-by-Step: Create a GHCR PAT

1. Go to GitHub → **Settings → Developer Settings → Personal access tokens → Tokens (classic)**
2. Click **Generate new token (classic)**
3. Give it a name, set expiry, and select scope: `read:packages`
4. Copy the token and add as `GHCR_PAT` in GitHub Secrets

---

## How the Pipeline Works

```
Push to main branch
      │
      ▼
  [CI workflow]  ← runs tests + build
      │ (on success)
      ▼
  [CD workflow]
      │
      ├──► Build Backend Docker Image ──► Push to GHCR
      │
      ├──► Build Frontend Docker Image ──► Push to GHCR
      │
      ├──► Deploy Backend → Catalyst AppSail (omsbackend)
      │
      └──► Deploy Frontend → Catalyst AppSail (omsfrontend)
```

## Image Naming Convention

| Service | GHCR Image |
|---|---|
| Backend | `ghcr.io/<your-github-username>/oms-backend:latest` |
| Frontend | `ghcr.io/<your-github-username>/oms-frontend:latest` |

Each push also gets a `sha-<commit>` tag for rollback purposes.
