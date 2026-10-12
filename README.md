# Pic4Pick · Light of Anthony

**English** | [简体中文](./README.zh-CN.md)

[![Deploy to GitHub Pages](https://github.com/Anthonyrr98/pic4pick/actions/workflows/deploy.yml/badge.svg)](https://github.com/Anthonyrr98/pic4pick/actions/workflows/deploy.yml)
[![Supabase Keepalive](https://github.com/Anthonyrr98/pic4pick/actions/workflows/supabase-keepalive.yml/badge.svg)](https://github.com/Anthonyrr98/pic4pick/actions/workflows/supabase-keepalive.yml)
[![React](https://img.shields.io/badge/React-19-149ECA?logo=react&logoColor=white)](https://react.dev/)
[![Supabase](https://img.shields.io/badge/Supabase-Postgres-3FCF8E?logo=supabase&logoColor=white)](https://supabase.com/)

Pic4Pick is the open-source photography portfolio and content management system
behind **Light of Anthony**. It combines a responsive gallery, high-resolution
lightbox, geographic exploration, EXIF presentation, and a protected admin
workflow while keeping public data, privileged operations, and image storage
separated.

**Live site:** [https://pic.rlzhao.com](https://pic.rlzhao.com)

![Light of Anthony photography archive](./public/og-image.png)

## Features

- Responsive photography gallery for desktop, iPad, and mobile
- Featured, chronological, distance-based, and film-based filters
- High-resolution lightbox that preserves each photograph's aspect ratio
- Optional spatial scenes with local depth estimation, mouse parallax, phone tilt, and drag controls ([details](./docs/spatial-scenes.md))
- Keyboard navigation, touch gestures, and accessible modal behavior
- Map-based geographic exploration
- EXIF, capture date, camera, lens, and film stock presentation
- Protected admin login, upload, review, edit, and delete workflows
- Original image uploads up to 100 MB
- Automatic 2,000 px, quality-90 JPEG lightbox previews during upload
- Separate Aliyun OSS storage for originals and previews
- Supabase Row Level Security and server-side administration APIs
- Atomic like updates, API rate limiting, and security response headers
- Automatic deployment to GitHub Pages and Render

## Technology Stack

| Layer | Technology |
| --- | --- |
| Frontend | React 19, Vite 7, React Router, i18next |
| Maps | MapLibre GL, AMap Web API |
| Image metadata | exifr |
| Database | Supabase Postgres, PostgREST, RLS |
| Backend | Node.js, Express 5, Sharp, Multer, JWT |
| Image storage | Aliyun OSS |
| Frontend hosting | Beijing Aliyun OSS + CDN; GitHub Pages backup |
| Backend hosting | Render |
| Automation | GitHub Actions, Playwright, ESLint |

## Architecture

```text
Browser
  ├─ Aliyun CDN → Beijing OSS ─ React / Vite frontend
  ├─ Supabase Data API ──────── public approved photos (read only)
  ├─ Render API ─────────────── admin auth, writes, likes, uploads
  │    └─ Supabase service role ─ protected database operations
  └─ Aliyun OSS
       ├─ origin/YYYY/MM/DD/ ── original files
       └─ ore/hd/YYYY/MM/DD/ ── 2,000 px lightbox previews
```

The public application uses a Supabase publishable/anon key to read approved,
visible photographs. Every privileged write is routed through the Render API.
The `SUPABASE_SERVICE_ROLE_KEY` and Aliyun OSS credentials never reach the
browser.

## Repository Structure

```text
.
├─ .github/workflows/       # GitHub Pages deployment and Supabase keepalive
├─ public/                  # Static assets, icons, and social preview images
├─ scripts/                 # UI and compatibility regression tests
├─ server/                  # Express API, image processing, and OSS uploads
├─ src/
│  ├─ components/           # Shared UI components
│  ├─ hooks/                # Upload, map, and branding hooks
│  ├─ pages/                # Gallery and admin application
│  └─ utils/                # Auth, Supabase, storage, and security utilities
├─ supabase/
│  ├─ functions/            # Optional Edge Functions
│  └─ migrations/           # Database migrations and RLS policies
├─ render.yaml              # Render Blueprint
└─ vite.config.js           # Vite build and development proxies
```

## Requirements

- Node.js 20 or newer
- npm 10 or newer
- A Supabase project
- An Aliyun OSS bucket
- Optional: Supabase CLI for migrations and database advisors

## Local Development

### 1. Clone the repository

```bash
git clone https://github.com/Anthonyrr98/pic4pick.git
cd pic4pick
```

### 2. Install frontend dependencies

```bash
npm ci
```

### 3. Configure frontend environment variables

Create `.env.local` in the repository root:

```dotenv
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-publishable-or-anon-key
VITE_API_BASE_URL=http://localhost:3002

# Required only when map features are enabled
VITE_AMAP_KEY=
VITE_AMAP_WEB_KEY=
VITE_AMAP_SECURITY_JS_CODE=
VITE_AMAP_WEB_SERVICE_KEY=

# Enable only when OSS media must be proxied through the backend
VITE_USE_OSS_MEDIA_PROXY=false
```

> Variables prefixed with `VITE_` are compiled into browser code. Never place a
> Supabase service-role key, database password, or OSS AccessKey secret in them.

### 4. Configure the backend

```bash
cd server
npm ci
```

Copy `server/.env.example` to `server/.env`, then supply real credentials:

```dotenv
PORT=3002
NODE_ENV=development
CORS_ORIGIN=http://localhost:5173

JWT_SECRET=replace-with-at-least-32-random-characters
ADMIN_USERNAME=your-admin-username
ADMIN_PASSWORD=replace-with-a-strong-password

SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

ALIYUN_OSS_REGION=oss-cn-beijing
ALIYUN_OSS_BUCKET=your-bucket
ALIYUN_OSS_ACCESS_KEY_ID=your-access-key-id
ALIYUN_OSS_ACCESS_KEY_SECRET=your-access-key-secret
```

Production startup rejects default admin credentials, JWT secrets shorter than
32 characters, admin passwords shorter than 12 characters, and wildcard CORS
origins.

### 5. Start the development services

Run the frontend and backend in separate terminals:

```bash
# Terminal 1: frontend
npm run dev
```

```bash
# Terminal 2: backend
npm run server
```

Open [http://localhost:5173](http://localhost:5173). The admin application is
available at
[http://localhost:5173/#/admin](http://localhost:5173/#/admin).

## Database Setup

The complete base schema is stored in
[`docs/schema_domestic_postgres.sql`](./docs/schema_domestic_postgres.sql).
Subsequent changes live in [`supabase/migrations`](./supabase/migrations).
For a new deployment, apply the base schema first and then execute the migration
files in filename order.

```bash
npx supabase login
npx supabase link --project-ref your-project-ref
npx supabase db query --linked --file docs/schema_domestic_postgres.sql
npx supabase db query --linked --file supabase/migrations/<migration-file>.sql
```

Repeat the final command for every migration file. Earlier migrations in this
repository reuse date-only prefixes and do not yet form a complete Supabase
migration history. Do not run `supabase db push` against a fresh database until
that history has been normalized.

Run Supabase security and performance checks after applying migrations:

```bash
npx supabase db advisors --linked --type security
npx supabase db advisors --linked --type performance
```

The current permission model is:

- `anon`: read-only access to approved public photographs and public branding
- `authenticated`: no administrative write permissions
- `service_role`: backend-only writes and atomic like updates

## Image Upload Pipeline

1. An administrator signs in through the backend and receives a JWT.
2. The browser sends the original file to `/api/upload/oss` as multipart data.
3. The backend validates the JWT, file type, and 100 MB size limit.
4. Original bytes are uploaded to `origin/YYYY/MM/DD/`.
5. Sharp applies EXIF orientation and creates a 2,000 px JPEG preview.
6. The preview is uploaded to `ore/hd/YYYY/MM/DD/`.
7. The backend writes the photograph record through the Supabase service role.

The original file is never re-encoded to produce the preview. The **Download
original** action always resolves to the preserved source file.

## Available Commands

### Frontend

| Command | Description |
| --- | --- |
| `npm run dev` | Start the Vite development server |
| `npm run build` | Create a production build |
| `npm run preview` | Preview the production build locally |
| `npm run lint` | Run ESLint |
| `npm run test:ui` | Run Playwright UI regression tests |
| `npm run server` | Start the backend in development mode |

### Backend

| Command | Description |
| --- | --- |
| `npm start` | Start the production server |
| `npm run dev` | Start the server in watch mode |
| `npm run previews:rebuild` | Rebuild HD previews for historical OSS files |

## Testing and Quality Checks

Run the following checks before submitting changes:

```bash
npm run lint
npm run build
npm run test:ui
npm audit --omit=dev
npm --prefix server audit --omit=dev
```

The UI suite covers gallery loading, keyboard lightbox controls, landscape and
portrait ratios, iPad layout, the mobile two-column grid, map transitions, and
the admin login page.

## Deployment

### Frontend: Beijing OSS + Aliyun CDN

The dedicated frontend bucket, CDN settings, local publishing commands, and opt-in GitHub Actions workflow are documented in [the Aliyun deployment guide](./docs/aliyun-frontend-deployment.md). Fonts are bundled with the frontend. Existing photo storage, Supabase, and Render services retain their current configuration.

### Frontend: GitHub Pages

Every push to `main` triggers
[`.github/workflows/deploy.yml`](./.github/workflows/deploy.yml), which installs
dependencies, builds the application, and publishes `dist`. Configure these
GitHub Actions secrets:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_API_BASE_URL`
- The required `VITE_AMAP_*` map credentials
- Optional: `VITE_USE_OSS_MEDIA_PROXY`

The custom domain is configured by [`public/CNAME`](./public/CNAME).

### Backend: Render

[`render.yaml`](./render.yaml) defines the service, health check, and
non-sensitive configuration. Configure these secrets in the Render Dashboard:

- `ADMIN_USERNAME`
- `ADMIN_PASSWORD`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ALIYUN_OSS_REGION`
- `ALIYUN_OSS_BUCKET`
- `ALIYUN_OSS_ACCESS_KEY_ID`
- `ALIYUN_OSS_ACCESS_KEY_SECRET`

Render checks `/api/health` and automatically deploys updates from `main`.

## Supabase Free-Project Keepalive

[`supabase-keepalive.yml`](./.github/workflows/supabase-keepalive.yml) reads a
small sample from the public tables three times per day. This maintains normal
application traffic and provides an early signal when the Supabase connection
fails. The workflow can also be run manually from GitHub Actions.

This workflow is not a substitute for monitoring, backups, or a paid uptime
guarantee. Use an appropriate paid plan when stable production availability or
an SLA is required.

## Security

- All public Supabase tables use RLS and least-privilege grants
- Administrative writes are routed through the JWT-protected backend
- Supabase service-role and OSS secrets remain in backend environment variables
- Login and like endpoints are rate-limited
- Likes use an atomic database function to avoid concurrent overwrites
- Uploads validate file extensions, MIME types, and size
- OSS deletion paths and admin query fields use allowlist validation
- The backend sends HSTS, CSP, anti-sniffing, and anti-framing headers
- The frontend defines a baseline CSP and strict referrer policy
- Production CORS accepts only an explicitly configured site origin

Do not open a public Issue containing exploit details, credentials, or user data.
Report security concerns privately through the repository owner's GitHub profile
and allow time for a fix before public disclosure.

## Operations

- Review GitHub Actions and Render deployment status regularly
- Run Supabase Security Advisor and Performance Advisor regularly
- Rotate admin credentials, JWT secrets, service-role keys, and OSS keys
- Keep database exports and OSS object inventories; database backups do not
  include external OSS files
- Run the full UI suite and `npm audit` after dependency updates
- Run `npm run previews:rebuild` after changing preview specifications

## Contributing

1. Fork the repository and create a focused feature branch.
2. Do not commit `.env` files, credentials, build artifacts, or personal data.
3. Run lint, build, and UI regression checks.
4. Open a Pull Request describing the purpose, verification, and screenshots
   when applicable.

## License

This repository does not currently declare an open-source license. Unless the
owner grants additional permission, all rights are reserved. Public visibility
does not imply permission to copy, modify, or redistribute the source.

## Maintainer

Maintained by [Anthonyrr98](https://github.com/Anthonyrr98).
