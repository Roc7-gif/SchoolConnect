# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

School Connect is a pan-African SaaS communication platform (built by AfriLab/BENILAB SARL) connecting schools and parents via SMS, WhatsApp, email and notifications. The current MVP scope: multi-school management, Excel/CSV student import (deterministic or AI-assisted), student/parent management, message templates, message sending, and a dashboard.

Backend and frontend are two independent apps in one repo, talking over a JSON REST API — there is no shared build tooling between them.

## Commands

### Backend (Django, from `backend/SchoolConnect/`)

```bash
source ../venv/bin/activate        # venv lives at backend/venv
python manage.py runserver
python manage.py makemigrations
python manage.py migrate
python manage.py createsuperuser
celery -A SchoolConnect worker -l info   # required for AI import + message sending (see below)
```

Requires `backend/SchoolConnect/.env` (copy from `.env.example`): `SECRET_KEY`, `DATABASE_URL` (Neon Postgres), `CELERY_BROKER_URL`/`CELERY_RESULT_BACKEND` (Redis), `CORS_ALLOWED_ORIGINS`; optional `RESEND_API_KEY`/`DEFAULT_FROM_EMAIL` (real email sending), `SIMULATE_UNWIRED_CHANNELS`, `AI_PROXY_API_KEY` (AI import).

```bash
python manage.py test              # 64 tests, no external services needed
```

Test coverage is deliberately narrow: it targets school-year scoping (`academics`,
`data_import`), message targeting/rendering and billing (`messaging`), and tenant
isolation of parents (`parents`) — everything that decides who gets billed an SMS or
whose data another school can see. `accounts` and `schools` are still Django stubs.

### Frontend (React, from `frontend/`)

```bash
npm install
npm run dev        # Vite dev server on :5173
npm run build
npm run lint
```

Requires `frontend/.env` (copy from `.env.example`): `VITE_API_URL`.

> The `package.json`/`package-lock.json`/`node_modules/` at the **repo root** are not the frontend app — they're a stray local install (just `@anthropic-ai/claude-code`, unused by any app code). The real frontend manifest is `frontend/package.json`.

## Architecture

### Multi-tenancy

`schools.School` is the tenant root. Every tenant-scoped model (`Classe`, `Eleve`, `Parent`, `MessageTemplate`, `Message`, `CustomFieldDefinition`, `AnneeScolaire`) carries a `school` FK. `Parent` gained its own FK rather than being reached through its children: without it, the importer matched parents **by phone number across the whole database**, so two schools importing the same number shared one record and either could rewrite the other's contact details. A parent with children in two schools therefore has one record per school, and `(school, phone_number)` is unique when the number is non-empty. There is **no shared queryset-scoping base class used project-wide** — `academics/views.py` defines a local `SchoolScopedViewSet` (checks `user.is_superuser`, else filters `qs.filter(school_id=user.school_id)`), but `parents/views.py` and `messaging/views.py` each re-implement the same `is_superuser` bypass + `school_id` filter inline in their own `get_queryset()`/`perform_create()`. When adding a new ViewSet, follow the existing inline pattern used in the app you're editing rather than assuming a shared mixin is available.

### School year — the second scoping axis

`academics.AnneeScolaire` (per school, `label` like `2025-2026`) scopes everything academic. A partial `UniqueConstraint` on `(school)` where `is_current=True` enforces **one current year per school in the database**, so switching years must go through `academics/services.py: definir_annee_courante()` (it clears the previous one first, or the constraint rejects the write).

**`Inscription` (eleve, classe, annee, statut) is the source of truth for which class a student is in.** `Eleve.classe` still exists but is only a **denormalized cache of the current year**, kept for display and for the existing ORM filters. The two can only drift if someone assigns `eleve.classe` directly — so **all class assignment goes through `academics/services.py: inscrire()`**, which writes the `Inscription` and updates the cache *only when the year is the current one*. `cloturer_inscription()` handles departures (`PARTI`/`DIPLOME`/`TRANSFERE`), and `promouvoir()` does the end-of-year mass re-enrollment from a user-validated class→class mapping.

Consequences to respect when adding code:
- **Reading a list of students is `Eleve.objects.pour_annee(annee)`**, never `filter(classe=…)` — the cache is wrong for any past year. `Eleve.classe_pour(annee)` gives one student's class for a given year.
- ViewSets get the consulted year from `SchoolScopedViewSet.get_annee()` (`?annee=<id>`, falling back to the current year) and pass it into the serializer context.
- `unique_together` on `Classe` is `('school', 'annee', 'name')` — the same "6ème A" legitimately reappears every year — and `('eleve', 'annee')` on `Inscription`, so a student has exactly one class per year (repeating a year = two `Inscription`s in different years pointing at the same `Classe`).

### URL routing

All routes are registered in a single `SchoolConnect/urls.py` — apps do **not** have their own `urls.py`. Most endpoints go through one `DefaultRouter` (`schools`, `annees`, `classes`, `eleves`, `custom-fields`, `parents`, `student-guardians`, `message-templates`, `messages`); auth (`/api/login/`, `/api/register/`, `/api/me/`, ...) and import (`/api/imports/...`) endpoints are added as explicit `path()` entries alongside it.

`INSTALLED_APPS` order matters and is commented in `settings.py`: `schools` first (no dependencies), `parents` last (depends on `academics`).

### No roles — one account is the school

`accounts.User` has **no role field and no permission tiers**: every view is plain
`IsAuthenticated`, and whoever holds a school's account has full rights over that school's
data. Don't reintroduce a "directeur vs enseignant" distinction unless asked. The only
privileged axis is `is_superuser` — the AfriLab account, not attached to any school, which
every `get_queryset()` lets through.

### Billing — a consumption statement, not a wallet

`GET /api/billing/summary/` (`messaging/views.py: billing_summary_view`) aggregates
**`MessageRecipient` rows in `ENVOYE` status**, not `Message.cost`: an unreachable
recipient costs nothing and only the channel that succeeded is billed. It returns the
current month, 12 months of history, the last sends and the `COST_PER_CHANNEL` tariffs.
There is no prepaid credit and no send-blocking — deliberately out of MVP scope.

### Auth: session + CSRF

DRF uses `SessionAuthentication` (not tokens). The frontend must call `GET /api/csrf/` to receive the CSRF cookie before any mutating request (`src/lib/api.js: ensureCsrfCookie()`), and the axios client (`withCredentials: true`) reads the `csrftoken` cookie and sets `X-CSRFToken` on non-GET requests.

**Dev gotcha:** session/CSRF cookies are host-scoped. The frontend's default API base (`http://127.0.0.1:8000`) and Django's default `CORS_ALLOWED_ORIGINS`/`.env.example` (`http://localhost:5173`) use *different* hostnames — if the browser is pointed at `localhost:5173` while the API base resolves to `127.0.0.1:8000` (or vice versa), the session cookie won't be sent and auth silently fails. Keep frontend and backend on the same hostname (both `localhost` or both `127.0.0.1`) during local dev.

### Data import (`data_import` app) — two parser paths feeding one matcher

- `parsers.py` — deterministic Excel/PDF parsing: header detection, accent/case-insensitive column normalization, block-based parsing (one block per sheet/table). Required columns: `Nom`, `Prenom`, `ParentNom`, `ParentPrenom`, `ParentTelephone`.
- `ai_parser.py` — AI-assisted path. **Goes through a third-party OpenAI-compatible proxy (HighwayAPI), not the official Anthropic API**: it uses the `openai` SDK pointed at `settings.AI_PROXY_BASE_URL` with `MODEL = 'claude-sonnet-5'`, forcing a `submit_rows` tool call, batching rows (`BATCH_SIZE = 100`, `MAX_TOKENS_PER_BATCH = 24000`). That proxy is unvetted — **do not send real student data through it in production**; swap it for a real `ANTHROPIC_API_KEY` when one is available. AI mode is optional and raises a validation error pointing to standard mode when no key is set; deterministic mode always works.
- Both paths normalize to the same row shape and call `matching.py: build_plan(rows, school, annee)`, which fuzzy-matches class names against existing `Classe` records (`RapidFuzz`, `FUZZY_THRESHOLD = 80`) and produces a plan (classes to create/match + rows to import).
- **Every import targets one school year**, taken from the request (`annee`) or the current year; an import with no year at all is rejected. The two lookups are deliberately asymmetric: **classes** are matched only within the imported year (otherwise a 2026 intake would land in the 2024 "6ème A"), while **students** are matched across the whole school minus definitive leavers (`DIPLOME`/`TRANSFERE`) — that is what lets a student moving from 6ème A to 5ème B be recognized instead of duplicated.
- AI parsing runs as a Celery task (`tasks.py: run_ai_preview_task`) because the model call is slow — `ImportPreviewAsyncView` dispatches it and returns a `task_id`; the frontend polls `ImportPreviewStatusView`. The deterministic path (`ImportPreviewView`) runs synchronously. `ImportCommitView` writes the previewed plan (classes/students/parents) to the DB inside a transaction, assigning classes through `academics.services.inscrire()` — writing `eleve.classe` there directly used to erase the previous year's enrollment.

### Messaging

`Message.scope_type` (classe/niveau/école/liste) determines which `Eleve`s a message targets (`messaging/services.py: resolve_eleves`) and a per-channel cost is applied (`COST_PER_CHANNEL`). **Targeting is scoped by `Message.annee`** (filled with the current year when the client doesn't send one) and resolved through `Inscription`, not through the `Eleve.classe` cache — without it, an "école entière" send reaches the families of every student ever recorded, including those gone for years, and bills an SMS for each. A message with `annee=None` is a pre-migration record and deliberately falls back to the old unscoped behaviour. Sending is dispatched via a Celery task (`send_message_task`), so a worker must be running for message creation to complete the "send" step.

A student can have several guardians (`parents.StudentGuardian`, unique per (student, parent)). `Message.notify_all_parents` decides what that means when sending: `False` (default) contacts one guardian per student — `_ordered_parents()` puts `is_primary_contact` first, then falls back to the next reachable one; `True` sends to every guardian, one `MessageRecipient` each, multiplying the cost. That is why `MessageRecipient`'s uniqueness is `(message, eleve, parent)` and not `(message, eleve)`.

**Personalization variables (`messaging/variables.py`).** A body may cite `{variable}` tokens: school (`ecole`, `annee`), parent (`parent_nom`, `parent_telephone`, …), student (`eleve_nom`, `classe`, `matricule`, …) **plus one per `CustomFieldDefinition` of the school**, read from `Eleve.extra_data` — so any column invented during an Excel import is usable. Rendering happens once per (student, parent) in `build_recipients`, and the result is persisted on `MessageRecipient.rendered_body` so you can prove afterwards what each parent received.

Two rules that are easy to break:
- Substitution uses a **regex, never `str.format`** — a stray `{` typed by a head teacher would otherwise raise and kill the whole send. An unknown or empty variable renders as an empty string; `preview_message()` reports both in `variable_warnings` so nothing goes out blind.
- Variable names are normalized (`normalize()`): case-insensitive, and `-`/`_` are interchangeable, because `slugify` produces hyphens for custom fields.

**Per-family deduplication.** The loop is per student, so a guardian with two children in scope would get the message twice. **`is_per_student(body, school)`** decides whether that is wanted: if the body cites no variable from `variables.student_variable_names(school)`, a guardian already contacted for a sibling is skipped and the existing `MessageRecipient.eleves_count` is incremented instead. So "réunion samedi" costs one SMS per family, while "{eleve_nom} était absent" costs one per child. **It takes the school** because custom fields belong to it: a body citing `{moyenne}` is per-student, and deduplicating it would send siblings a single message carrying only one child's grade.

`build_recipients(message, dry_run=False)` is the single decision path; `send_message()` persists its output, `preview_message()` aggregates it. Under `dry_run` no provider is called and a channel counts as successful as soon as the parent has the matching contact. Keep it that way — `POST /api/messages/preview/` must not be able to disagree with the real send. That endpoint saves the message inside a transaction it then rolls back (a `_PreviewRollback` exception), because resolving `scope_eleves` needs a PK; it persists nothing.

`Message.channel` picks the delivery strategy: a fixed channel, `AUTO` (the parent's `preferred_channel` only), or `CASCADE` — try channels in order per parent, moving on whenever one has no usable contact or fails, and stopping at the first success. The order is **chosen by the user per message** and stored in `Message.channel_order` (e.g. `['EMAIL', 'SMS']`; a single entry means "this channel only"); empty falls back to `CASCADE_ORDER` (SMS → WhatsApp → Email). Every try is recorded on `MessageRecipient.attempts` (`[{parent, parent_name, channel, status, error}]`), which the frontend renders as a trail; only the channel that succeeded is billed.

Each attempt is isolated in `services.py: _try_channel()` — an exception from one provider is caught, logged and recorded as a failed attempt so the cascade still tries the next channel. Never let a provider call escape that boundary, or one unknown SMS error would silently cancel the email that would have worked.

**Email is real, SMS/WhatsApp are not.** `services.py: _deliver()` is the single provider touchpoint: `EMAIL` goes out through Resend (`django-anymail`; without `RESEND_API_KEY` Django falls back to the console backend), while SMS and WhatsApp are simulated. `is_wired(channel)` reads `SIMULATE_UNWIRED_CHANNELS` — `fail` (default) makes them fail so the cascade falls through to the email that actually leaves, `success` restores the old optimistic simulation. Wiring a real SMS gateway means editing `_deliver()` and `is_wired()` only; the cascade already branches on their `(ok, error)` return and on exceptions.

**The dry-run path applies `is_wired()` too**, and it must keep doing so. Otherwise the preview would count a successful SMS for a message that will really go out by email — breaking the "preview cannot disagree with the real send" invariant above, and quoting a cost the school will not be billed.

`Message.subject` / `MessageTemplate.subject` exist only for email; empty falls back to the school name, and the subject goes through the same variable engine as the body.

### Celery

Both the AI import preview and message sending depend on a running Celery worker (Redis broker/backend, `CELERY_TIMEZONE` pinned to `Africa/Abidjan`). Without a worker, async import preview requests and message sends will hang in a pending/queued state.

### Database

Postgres via Neon (serverless). `DATABASES['default']['CONN_MAX_AGE'] = 60` with `CONN_HEALTH_CHECKS = True` — short persistent connections with a health check before reuse, tuned to avoid stale-connection errors after Neon's compute suspends on idle.

### List search

`schools/search.py: filter_search(qs, term, fields, related_fields)` backs the `?search=` param on `/api/eleves/`, `/api/classes/` and `/api/parents/`. Two passes: a case-insensitive LIKE where every typed word must hit at least one field, then — only if that returns nothing — a RapidFuzz pass in Python over the (school-scoped) queryset so `Konne` still finds `Koné`. Deliberately no `pg_trgm`: no extension to provision on Neon, and a school's list fits well within `MAX_FUZZY_CANDIDATES`. `fields` must be direct model attributes (the fuzzy pass reads them with `getattr`); relation lookups go in `related_fields` and are LIKE-only.

Frontend side, `src/components/SearchInput.jsx` (debounced) and `src/components/EleveMultiSelect.jsx` (searchable multi-select of students, used by the parent form, the add-child dialog and the individual-message scope) are the shared pieces — reuse them rather than rebuilding a picker.

### DRF pagination

Global `PageNumberPagination`, `PAGE_SIZE = 200`. The frontend's `unwrapList()` helper (`src/lib/api.js`) unwraps `{count, next, previous, results}` but only reads the first page — fine under ~200 records per school/type, but any list that can exceed that needs real pagination UI before it will scale.

### Frontend stack specifics

- JavaScript only, not TypeScript (`jsconfig.json` for the `@/*` → `src/*` alias; `.jsx` files).
- shadcn/ui in JS mode (`components.json`: `"tsx": false`), Tailwind v4 via `@tailwindcss/vite` (no separate `tailwind.config.js`).
- react-hook-form + zod for forms, TanStack Query for server state (see `AuthProvider` in `src/lib/auth.jsx` for the query/mutation pattern used for auth), TanStack Table for data grids, react-router v7, axios for the API client.
- **`AnneeProvider` (`src/lib/annee.jsx`) holds the consulted school year**, picked in `AnneeSelector` in the app header and persisted in `localStorage`. The selected id is part of the `queryKey` of every academic list (`['classes', anneeId]`, `['eleves', classeId, search, anneeId]`) and is passed to `fetchClasses`/`fetchEleves`/import calls — switching years therefore refetches on its own, with no manual invalidation. **Any new academic query must include it in both its key and its request**, or it will silently show another year's data.
- `src/lib/*-api.js` files (`import-api.js`, `messaging-api.js`, `parents-api.js`, `schools-api.js`) wrap the shared `api` axios instance per domain — follow that convention for new API modules rather than calling axios directly from components.
