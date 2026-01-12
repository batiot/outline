# Phase 2: UI Integration - Universe Concept

This phase focuses on exposing the Universe concept in the user interface, allowing users to switch between universes and see filtered collections.

## Tasks

### 1. UI Stores & State
- [x] Add `currentUniverseId` to `app/stores/UiStore.ts`.
- [x] Implement `setCurrentUniverseId` action in `UiStore`.
- [x] Persist `currentUniverseId` in `localStorage` if needed. (Handled via `UiStore` persistence)

### 2. Universe Selector Component
- [x] Create `app/components/UniverseSelector.tsx`.
- [x] Design the selector (a dropdown or a horizontal list). (Implemented as a horizontal pill list)
- [x] Fetch universes on mount in the root component or sidebar.

### 3. Sidebar Integration
- [x] Add `UniverseSelector` to `app/components/Sidebar/App.tsx`.
- [x] Update `app/stores/CollectionsStore.ts` to filter collections by `ui.currentUniverseId`.

### 4. Collection Creation Integration
- [x] Update `app/components/Collection/CollectionNew.tsx` to automatically set `universeId` from `ui.currentUniverseId`.
- [ ] Update `CollectionEdit` to allow moving a collection between universes (optional for Phase 2).

### 5. Verification
- [ ] Manually verify that switching universes updates the sidebar list.
- [ ] Verify that creating a new collection while in a universe assigns it to that universe.
