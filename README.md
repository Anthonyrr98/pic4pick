# Pic4Pick · Light of Anthony

**English** | [简体中文](./README.zh-CN.md)

[![Deploy to GitHub Pages](https://github.com/Anthonyrr98/pic4pick/actions/workflows/deploy.yml/badge.svg)](https://github.com/Anthonyrr98/pic4pick/actions/workflows/deploy.yml)
[![Supabase Keepalive](https://github.com/Anthonyrr98/pic4pick/actions/workflows/supabase-keepalive.yml/badge.svg)](https://github.com/Anthonyrr98/pic4pick/actions/workflows/supabase-keepalive.yml)
[![React](https://img.shields.io/badge/React-19-149ECA?logo=react&logoColor=white)](https://react.dev/)
[![Supabase](https://img.shields.io/badge/Supabase-Postgres-3FCF8E?logo=supabase&logoColor=white)](https://supabase.com/)

Pic4Pick is the photography portfolio and content management system
behind **Light of Anthony**. It combines a responsive gallery, high-resolution
lightbox, geographic exploration, EXIF presentation, and a protected admin
workflow while keeping public data, privileged operations, and image storage
separated.

**Live site:** [https://pic.rlzhao.com](https://pic.rlzhao.com)

![Light of Anthony photography archive](./public/og-image.png)

## Features

- Responsive photography gallery for desktop, iPad, and mobile
- Latest, random, nearby, faraway, and film browsing modes
- Shared header/gallery backdrop based on the first photo in the active browsing mode
- Paper Gallery and Warm Analog themes with persistent visitor preferences ([details](./docs/global-themes.md))
- High-resolution lightbox that preserves each photograph's aspect ratio
- Optional spatial scenes powered by SharpDepth + UniDepth GPU precomputation, with mouse parallax, phone tilt, and drag controls ([details](./docs/spatial-scenes.md))
- Keyboard navigation, touch gestures, and accessible modal behavior
- Map-based geographic exploration with city collections, location markers, and configurable map styles
- EXIF, capture date, camera, lens, and film stock presentation
- Film gallery and lightbox frames matched automatically to the photo's film stock
- Protected admin login, upload, review, resubmit, edit, hide, and delete workflows
- Custom branding, camera/lens presets, and JSON import/export
- Original image uploads up to 100 MB
- Automatic 2,000 px, quality-90 JPEG lightbox previews during upload
- Separate Aliyun OSS storage for originals and previews
- Supabase Row Level Security and server-side administration APIs
- Atomic like updates, optional SMTP notifications, API rate limiting, and security response headers
- Aliyun OSS + CDN publishing, GitHub Pages backup, and Render backend deployment

## Technology Stack

| Layer | Technology |
| --- | --- |
| Frontend | React 19, Vite 7, JavaScript / TypeScript, React Router, i18next, GSAP |
| Maps | MapLibre GL, AMap Web API |
| Image metadata | exifr |
| Database | Supabase Postgres, PostgREST, RLS |
| Backend | Node.js, Express 5, Sharp, Multer, JWT, Nodemailer |
| Spatial scenes | SharpDepth + UniDepth GPU worker, WebGL depth reprojection |
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
  │    ├─ Supabase service role ─ protected database operations
  │    └─ Signed depth URLs ── approved, visible photos only
  └─ Aliyun OSS
       ├─ origin/YYYY/MM/DD/ ── original files
       ├─ ore/hd/YYYY/MM/DD/ ── 2,000 px lightbox previews
       └─ spatial-depth/ ───── private precomputed depth maps

Owner's GPU worker → Supabase job queue → SharpDepth + UniDepth → private OSS
```

The public application uses a Supabase publishable/anon key to read approved,
visible photographs. Every privileged write is routed through the Render API.
The `SUPABASE_SERVICE_ROLE_KEY` and Aliyun OSS credentials never reach the
browser.

## Repository Structure

```text
.
├─ .github/workflows/       # Pages / OSS deployment and Supabase keepalive
├─ docs/                    # Architecture, themes, spatial scenes, and deployment
├─ public/                  # Static assets, icons, and social preview images
├─ scripts/                 # Regression checks, OSS publisher, and GPU worker
├─ server/                  # Express API, image processing, and OSS uploads
├─ src/
│  ├─ components/           # Shared UI components
│  ├─ hooks/                # Upload, map, and branding hooks
│  ├─ pages/                # Gallery and admin application
│  ├─ themes/               # Theme tokens, switching, and animations
│  └─ utils/                # Auth, Supabase, storage, and security utilities
├─ supabase/
│  ├─ functions/            # Optional Edge Functions
│  └─ migrations/           # Database migrations and RLS policies
├─ render.yaml              # Render Blueprint
└─ vite.config.js           # Vite build and development proxies
```

## Requirements

- Node.js 22.12 or newer recommended for frontend, OSS publishing, and GPU worker
- npm 10 or newer
- A Supabase project
- An Aliyun OSS bucket
- Optional: Supabase CLI for migrations and database advisors
- Optional: a compatible GPU and separately configured Python/model runtime for depth precomputation ([setup](./docs/spatial-scenes.md))

The web frontend supports Node.js 20.19+ as specified by Vite. Browsing the
gallery and viewing existing spatial results do not require a visitor-side GPU
worker or model download.

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
npm --prefix server ci
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

Optional like-notification SMTP settings are documented in
[`server/README.md`](./server/README.md). Copy the example file with your shell's
copy command; on PowerShell, use `Copy-Item server/.env.example server/.env`.

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

Run both commands from the repository root. For a production build, configure
`VITE_API_BASE_URL` with your deployed backend's absolute HTTPS URL in
`.env.production`; the build rejects missing, local, or non-HTTPS API URLs.
This production configuration takes precedence over the local development URL.

## Database Setup

The complete base schema is stored in
[`docs/schema_domestic_postgres.sql`](./docs/schema_domestic_postgres.sql).
Subsequent changes live in [`supabase/migrations`](./supabase/migrations).
For a new deployment, apply the base schema first and then execute the migration
files in filename order. Apply only pending changes to an existing database.

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
7. The client submits metadata through the protected admin API; the backend saves
   the photograph through the Supabase service role.

The backend preserves the bytes it receives separately from its generated
preview. The upload form can optimize large files before sending them; choose
the original-file option when you need the uncompressed source. **Download
original** resolves to the stored upload, rather than the lightbox preview.

Uploads use a stable submission ID and SHA-256 fingerprint to support retries.
Deleting a photograph cleans up its image assets and removes associated depth
records; the GPU worker later removes unreferenced depth files while online.

## Gallery Backgrounds and Film Frames

In latest, random, nearby, and faraway modes, the header and gallery share a
blurred background from the first photo in the current list. Switching modes
updates that background. Standard lightbox panels take their tint from the
photo currently open; film mode uses a separate desk background.

Film cards and lightboxes select their frame from the photo's film stock:

| Film stock | Frame artwork |
| --- | --- |
| `Fuji C200` | [`public/film-frames/fuji-c200.png`](./public/film-frames/fuji-c200.png) |
| `Kodak Gold 200` | [`public/film-frames/kodak-gold-200.png`](./public/film-frames/kodak-gold-200.png) |
| `富士一次性相机` / `FUJIFILM SIMPLE ACE 400` | [`public/film-frames/fuji-simple-ace.png`](./public/film-frames/fuji-simple-ace.png) |

When uploading or editing a film photo, select the film category and retain its
film stock (`filmStock` in the frontend, `film_stock` in storage). Existing
`film_stock:` tags remain supported. New photos automatically use the same
mapping; frames are not assigned by photo ID. Other stocks use the default frame.

Only the artwork's film edges surround the complete photograph; its opaque
centre never covers the image. Landscape and portrait photos retain their
original aspect ratio, with portrait frames rotated to put the perforations
along the sides. Film lightbox details place the category and stock below the
camera/lens cards and omit the like-count card.

To add another stock, extend `getFilmFrameStock` and its artwork configuration in
[`FilmFrame.tsx`](./src/pages/gallery/components/FilmFrame.tsx), then update the
frame geometry in [`darkroom.css`](./src/themes/darkroom.css) for both orientations
and both gallery cards and lightboxes. See [`AGENTS.md`](./AGENTS.md) for the
project's upload and frame conventions.

## Spatial Scenes

After a photo is saved, a database trigger queues depth processing. A GPU worker
on the owner's computer claims jobs, runs SharpDepth + UniDepth, and stores
private depth maps in OSS. The backend issues five-minute signed links after
checking that the photograph is approved and visible.

The browser loads the photograph and precomputed depth, then renders the scene
with WebGL. It preloads depth for the current lightbox photo and caches up to
three results. When the worker is offline, new jobs stay queued and existing
results remain available. Ordinary photo viewing remains available when depth
is pending or WebGL is unavailable.

This is a single-photo 2.5D effect; hidden backgrounds cannot be reconstructed.
The worker needs a separately prepared Python environment and model weights;
`npm ci` alone does not install them. See [Spatial scenes](./docs/spatial-scenes.md)
for migrations, runtime paths, model licenses, and worker operation.

## WeChat Mini Program — In Development

A separate Taro 4.3 + React 18 + TypeScript client is being developed in the local
working tree under `miniapp/`, with reusable business logic under
`packages/shared/`. These directories have not yet been committed to the public
repository, so cloning this revision provides the web application and backend.

The implementation covers gallery browsing, themes, details, native-map
exploration, admin workflows, and a spatial Canvas. Simulator checks have
covered the public gallery, details, map transitions, and spatial rendering.
Full device testing, authenticated admin writes/uploads, production domain
configuration, and complete visual/function acceptance remain in progress.

The backend already includes WeChat-compatible `POST /api/photos/:id/likes` and
`POST /api/admin/photos/:id/update` routes alongside the web client's PATCH
routes. The mini program is not yet a published release.

## Available Commands

### Frontend

| Command | Description |
| --- | --- |
| `npm run dev` | Start the Vite development server |
| `npm run build` | Create a production build |
| `npm run preview` | Preview the production build locally |
| `npm run lint` | Run ESLint |
| `npm run test:ui` | Run Playwright UI regression tests |
| `npm run test:themes` | Check theme switching, persistence, and layout |
| `npm run test:maps` | Check city flights and map interactions |
| `npm run test:spatial` | Check spatial input/cache logic and WebGL UI |
| `npm run test:admin` | Check submissions, retries, resubmission, and deletion |
| `npm run test:admin:ui` | Check admin UI workflows |
| `npm run test:likes` | Check likes and notification behavior |
| `npm run spatial:worker` | Start the configured GPU depth worker |
| `npm run deploy:oss -- --dry-run` | Validate frontend OSS publishing inputs |
| `npm run deploy:oss` | Publish the built frontend to its dedicated OSS bucket |
| `npm run server` | Start the backend in development mode |

### Backend

| Command | Description |
| --- | --- |
| `npm start` | Start the production server |
| `npm run dev` | Start the server in watch mode |
| `npm run previews:rebuild` | Rebuild HD previews for historical OSS files |
| `npm run mail:test` | Check the configured SMTP connection and authentication |

Run backend commands inside `server/`, or use `npm --prefix server run <script>`
from the root.

## Testing and Quality Checks

Install Playwright's Chromium browser once with `npx playwright install chromium`.
Start `npm run dev` in a separate terminal before browser regression checks;
they use `http://127.0.0.1:5173` by default (`UI_BASE_URL` can override it).
The basic UI suite needs visible gallery photos. Spatial UI fixtures check
precomputed results; they do not validate GPU inference.

Run checks appropriate to your changes:

```bash
npm run lint
npm run build
npm run test:ui
npm run test:themes
npm run test:maps
npm run test:spatial
npm run test:admin
npm run test:admin:ui
npm run test:likes
npm audit --omit=dev
npm --prefix server audit --omit=dev
```

The UI suite covers gallery loading, keyboard lightbox controls, landscape and
portrait ratios, iPad layout, the mobile two-column grid, map transitions, and
the admin login page.

## Deployment

### Frontend: Beijing OSS + Aliyun CDN

The primary frontend uses a dedicated Beijing OSS bucket and Aliyun CDN. Fonts
are bundled with the application. Publishing commands and CDN configuration
are documented in [the Aliyun deployment guide](./docs/aliyun-frontend-deployment.md).
The [OSS workflow](./.github/workflows/deploy-oss.yml) runs only when the repository
variable `OSS_FRONTEND_ENABLED=true` is set; it supports pushes to `main` and
manual dispatch. Photo storage uses a separate bucket.

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

Map appearance is controlled by repository variables `VITE_MAP_STYLE_PRESET`
and `VITE_AMAP_MAP_STYLE`; the current workflows enable the AMap JS SDK.

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
The optional like-email feature also requires backend SMTP credentials; see
[`server/.env.example`](./server/.env.example).

## Documentation

| Guide | Contents |
| --- | --- |
| [Global themes](./docs/global-themes.md) | Paper Gallery, Warm Analog, persistence, and animation |
| [Spatial scenes](./docs/spatial-scenes.md) | GPU jobs, private depth storage, signed URLs, and model runtime |
| [Aliyun frontend deployment](./docs/aliyun-frontend-deployment.md) | OSS + CDN setup, publishing, and rollback |
| [Backend guide](./server/README.md) | API setup and like-email notifications |
| [Supabase CLI reference](https://supabase.com/docs/reference/cli/introduction) | Official CLI usage |

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
