# Phase 1: Core Infrastructure - Universe Concept

This phase focuses on the foundational work required for the Universe concept, including database changes, server models, API endpoints, and the basic frontend store.

## Tasks

### 1. Database Migrations
- [x] Create migration for `universes` table.
- [x] Create migration to add `universeId` to `collections` table.
- [x] Seed initial universes (`univers1`, `univers2`, `univers3`) for existing teams.

### 2. Server Models
- [x] Create `server/models/Universe.ts`.
- [x] Register `Universe` in `server/models/index.ts`.
- [x] Add `universeId` and `Universe` association to `server/models/Collection.ts`.

### 3. Server Presenters
- [x] Create `server/presenters/universe.ts`.
- [x] Export `presentUniverse` from `server/presenters/index.ts`.

### 4. API Endpoints
- [x] Create `server/routes/api/universes/` with `schema.ts`, `universes.ts`, and `index.ts`.
- [x] Register `universes` router in `server/routes/api/index.ts`.
- [x] Update `CollectionsCreateSchema` and `CollectionsListSchema` in `server/routes/api/collections/schema.ts`.
- [x] Update `collections.create` and `collections.list` in `server/routes/api/collections/collections.ts`.

### 5. Frontend Infrastructure
- [x] Create `app/models/Universe.ts`.
- [x] Create `app/stores/UniversesStore.ts`.
- [x] Add `UniversesStore` to `app/stores/RootStore.ts`.
- [x] Update `shared/types.ts` with `Universe` type.

### 6. Verification
- [x] Run database migrations.
- [x] Add/Run tests for `universes.list`.
- [x] Add/Run tests for `collections.create` with `universeId`.
