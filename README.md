# NOUFAR CDSS — Run with Docker

Medical web app for hyperthyroidism relapse prediction.
Stack: **Node/Express backend**, **Python/Flask AI server**, **MongoDB**, static frontend served by the backend.

This README explains exactly how your partner can clone the repo from GitHub and start the whole project with **one command**, on Windows / macOS / Linux.

---

## 1) Prerequisites (install once)

Your partner only needs two things:

1. **Docker Desktop** — <https://www.docker.com/products/docker-desktop/>
   (On Windows, this enables WSL2 automatically. Make sure Docker Desktop is *running* before going further.)
2. **Git** — <https://git-scm.com/downloads>

Check both work:

```bash
docker --version
docker compose version
git --version
```

That's it. Node, Python, MongoDB are **not** needed on the host — Docker handles them.

---

## 2) Clone the repository

```bash
git clone <YOUR_NEW_REPO_URL>.git noufar-cdss
cd noufar-cdss
```

---

## 3) Create the secrets file

The repository ships with a template — copy it and fill the secrets.

**Linux / macOS:**

```bash
cp backend/.env.example backend/.env
```

**Windows (PowerShell):**

```powershell
Copy-Item backend\.env.example backend\.env
```

Then open `backend/.env` and replace every value that says `change_me_to_...` or `replace_with_...`.
At minimum, set strong values for:

- `JWT_SECRET` and `JWT_REFRESH_SECRET` (must be **different** from each other)
- `ADMIN_REGISTRATION_KEY`
- `PATIENT_DATA_KEYS` and `PATIENT_BLIND_INDEX_KEY` (64-hex strings)
- `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`
- SMTP creds if you want password-reset emails to work

> Generate a 64-char hex key (works inside Docker too):
>
> ```bash
> docker run --rm node:20-alpine node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
> ```

The owner of the project will share their exact values privately. **Never commit `backend/.env` to GitHub.**

---

## 4) Start everything

```bash
docker compose up --build
```

The first run takes a few minutes (downloads Node, Python, MongoDB images and builds the project). Next runs start in seconds.

When you see something like:

```
noufar-backend   | MongoDB connected
noufar-backend   | Server running on port 5000
```

…open <http://localhost:5000> in your browser. The frontend is served by the backend at the root URL.

To stop:

```bash
# Ctrl+C in the terminal, then:
docker compose down
```

To stop **and wipe the database** (fresh start):

```bash
docker compose down -v
```

---

## 5) One-time admin seed

After the first start, in another terminal, create the platform admin account using values from `backend/.env` (`SEED_ADMIN_*`):

```bash
docker compose exec backend npm run seed:admin
```

---

## 6) Project layout

```
noufar-cdss/
├── docker-compose.yml         # orchestrates the 3 services
├── .dockerignore              # excludes node_modules, venv, .env, …
├── .gitignore                 # never commit .env / node_modules / uploads
├── README.md
├── backend/                   # Node / Express API + serves frontend as static
│   ├── Dockerfile
│   ├── .env.example
│   ├── package.json
│   ├── scripts/               # admin seed, migrations
│   └── src/                   # app.js, server.js, routes, controllers, …
├── frontend/                  # HTML / CSS / JS (served by backend on /)
├── ai-server/                 # Python / Flask prediction service
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── app.py
│   └── exports/               # trained model artifacts (.pkl, .keras)
└── scripts/                   # offline ML utilities (not run by Docker)
```

### Services & ports

| Service      | Container name   | Inside Docker         | On the host          |
|--------------|------------------|-----------------------|----------------------|
| backend      | `noufar-backend` | `backend:5000`        | <http://localhost:5000> |
| ai-server    | `noufar-ai`      | `ai-server:5001`      | not exposed          |
| mongo        | `noufar-mongo`   | `mongo:27017`         | not exposed          |

The backend talks to Mongo via `mongodb://mongo:27017/...` and to the AI server via `http://ai-server:5001/...` — these hostnames work **because Docker Compose creates an internal network** where service names are DNS entries. Nothing for you to configure.

---

## 7) Common commands

```bash
# View live logs from one service
docker compose logs -f backend
docker compose logs -f ai-server

# Restart just the backend (after code change)
docker compose up -d --build backend

# Open a shell inside the backend container
docker compose exec backend sh

# Run a migration
docker compose exec backend npm run migrate:encrypt-patients
```

---

## 8) Troubleshooting

| Symptom                                                              | Fix                                                                                                  |
|----------------------------------------------------------------------|------------------------------------------------------------------------------------------------------|
| `port is already allocated` for 5000                                 | Another app uses 5000. Change `"5000:5000"` to e.g. `"5050:5000"` in `docker-compose.yml`.            |
| `MongoDB connection failed`                                          | Wait — Mongo can take 10–20 s to be ready on first start. Compose retries via healthcheck.            |
| Backend exits with `JWT_SECRET ...`                                  | `backend/.env` is missing or still has placeholder values. Fill in real secrets and rebuild.         |
| `docker: command not found` on Windows                               | Docker Desktop is not running. Start it from the Start menu and wait for the whale icon to be green. |
| Frontend loads but API calls fail with CORS                          | `APP_BASE_URL` and `CORS_ALLOWED_ORIGINS` in `backend/.env` must match `http://localhost:5000`.       |
| You want to inspect the DB with Compass                              | Uncomment the `ports:` block under `mongo:` in `docker-compose.yml`, then `docker compose up -d`.    |
| `permission denied` writing to `uploads/`                            | Volume is owned by the container user. `docker compose down -v` and start again.                     |

---

## 9) Pushing to a new GitHub repo (project owner only)

```bash
# from the project root
git init
git add .
git commit -m "Initial commit: Docker-ready NOUFAR CDSS"
git branch -M main
git remote add origin https://github.com/<your-user>/<new-repo>.git
git push -u origin main
```

The `.gitignore` already excludes `node_modules/`, `venv/`, `backend/uploads/`, and any `.env` file, so secrets won't leak.
