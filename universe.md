# Universe Concept Implementation Plan

## Overview

The Universe concept allows users to filter and view only a subset of collections in the sidebar. Each collection belongs to exactly one universe, and users can switch between universes to manage large numbers of collections (200+).

## Requirements Summary

- **Mandatory**: Every collection must belong to a universe
- **Team-scoped**: Each team has its own set of universes
- **Simple properties**: Only `id`, `name`, `teamId`
- **No admin UI**: Universes are created directly in database
- **No permissions**: All users see all universes
- **No search impact**: Search remains global
- **Sidebar display**: Universe selector appears in sidebar (similar to team selector style)
- **Persistence**: Active universe deduced from current collection or stored in localStorage
- **API responses**: Only `universeId` field in collection objects (no nested universe object)
- **Creation behavior**: Collections automatically created in currently active universe (no UI selection needed)

## Plugin System Analysis

After reviewing Outline's plugin architecture, **the Universe feature cannot be implemented as a plugin** because:
- Plugins are designed for extensions (auth providers, integrations, processors)
- Universe requires **core data model changes** (database tables, model associations)
- Universe affects **fundamental UI components** (sidebar, collection listing)
- Plugins cannot modify core models or inject into existing core components

**However, we can minimize impact** by:
1. ✅ Keeping changes atomic and isolated
2. ✅ Using computed properties instead of modifying existing methods
3. ✅ Adding optional parameters to maintain backward compatibility
4. ✅ Creating new components instead of heavily modifying existing ones

---

## Database Changes

### 1. New Table: `universes`

| Column    | Type         | Constraints           |
| --------- | ------------ | --------------------- |
| id        | UUID         | PRIMARY KEY           |
| name      | VARCHAR(255) | NOT NULL              |
| teamId    | UUID         | NOT NULL, FK to teams |
| createdAt | TIMESTAMP    | NOT NULL              |
| updatedAt | TIMESTAMP    | NOT NULL              |

**Initial seed data** (per team): `univers1`, `univers2`, `univers3`

### 2. Alter Table: `collections`

| Column     | Type | Constraints               |
| ---------- | ---- | ------------------------- |
| universeId | UUID | NOT NULL, FK to universes |

---

## File Impact Summary

### Server (6 files)

| File                                                     | Change  | Purpose                                  |
| -------------------------------------------------------- | ------- | ---------------------------------------- |
| `server/models/Universe.ts`                              | **NEW** | Universe Sequelize model                 |
| `server/models/index.ts`                                 | MODIFY  | Export Universe model                    |
| `server/models/Collection.ts`                            | MODIFY  | Add universeId field + association       |
| `server/migrations/XXXXXX-create-universe.js`            | **NEW** | Create universe table + seed data        |
| `server/migrations/XXXXXX-add-universe-to-collection.js` | **NEW** | Add universeId to collections            |
| `server/routes/api/universes/universes.ts`               | **NEW** | `universes.list` endpoint                |
| `server/routes/api/universes/schema.ts`                  | **NEW** | Validation schema                        |
| `server/routes/api/universes/index.ts`                   | **NEW** | Router export                            |
| `server/routes/api/index.ts`                             | MODIFY  | Register universes router                |
| `server/routes/api/collections/collections.ts`           | MODIFY  | Add universeId to create, filter in list |
| `server/routes/api/collections/schema.ts`                | MODIFY  | Add universeId to schemas                |
| `server/presenters/universe.ts`                          | **NEW** | Universe presenter                       |
| `server/presenters/index.ts`                             | MODIFY  | Export universe presenter                |

### Frontend (10 files)

| File                                                     | Change  | Purpose                    |
| -------------------------------------------------------- | ------- | -------------------------- |
| `app/models/Universe.ts`                                 | **NEW** | Universe MobX model        |
| `app/stores/UniversesStore.ts`                           | **NEW** | Universe store             |
| `app/stores/RootStore.ts`                                | MODIFY  | Add UniversesStore         |
| `app/stores/CollectionsStore.ts`                         | MODIFY  | Filter by active universe  |
| `app/components/Sidebar/components/Sidebar.tsx`          | MODIFY  | Add universe selector      |
| `app/components/Sidebar/components/UniverseSelector.tsx` | **NEW** | Universe dropdown/selector |

| `app/hooks/useActiveUniverse.ts`                         | **NEW** | Hook to get/set active universe |
| `shared/types.ts`                                        | MODIFY  | Add Universe type if needed     |

---

## Detailed Implementation

### Server

#### 1. `server/models/Universe.ts` (NEW)

```typescript
@Table({ tableName: "universes", modelName: "universe" })
class Universe extends IdModel {
  @Length({ max: 255 })
  @Column
  name: string;

  @ForeignKey(() => Team)
  @Column(DataType.UUID)
  teamId: string;

  @BelongsTo(() => Team)
  team: Team;

  @HasMany(() => Collection)
  collections: Collection[];
}
```

#### 2. `server/models/Collection.ts` (MODIFY - 5 lines)

Add after existing foreign keys and associations:

```typescript
@ForeignKey(() => Universe)
@Column(DataType.UUID)
universeId: string;

@BelongsTo(() => Universe)
universe: Universe;
```
@Table({ tableName: "universes", modelName: "universe" })
class Universe extends IdModel {
  @Length({ max: 255 })
  @Column
  name: string;

  @ForeignKey(() => Team)
  @Column(DataType.UUID)
  teamId: string;

  @BelongsTo(() => Team)
  team: Team;

  @HasMany(() => Collection)
  collections: Collection[];
}
```

#### 2. `server/models/Collection.ts` (MODIFY)

Add:
```typescript
@ForeignKey(() => Universe)
@Column(DataType.UUID)
universeId: string;

@BelongsTo(() => Universe)
universe: Universe;
```

#### 3. `server/routes/api/universes/universes.ts` (NEW)

Simple endpoint:
- `universes.list` - Returns all universes for user's team

#### 4. `server/routes/api/collections/collections.ts` (MODIFY)

**Minimal changes to maintain fork compatibility:**

- `collections.create`: Extract `universeId` from input body (line ~65)
- `collections.create`: Add `universeId` to Collection.build (line ~75)
- `collections.list`: Extract optional `universeId` from input body (line ~710)
- `collections.list`: Add universeId filter to where clause if provided (line ~730)

```typescript
// In collections.create - around line 65
const { name, color, description, data, permission, sharing, icon, sort, index, commenting, universeId } = ctx.input.body;

// In collections.create - around line 75
const collection = Collection.build({
  name,
  content: data,
  // ...existing fields
  universeId, // <-- ADD THIS LINE
});

// In collections.list - around line 710
const { includeListOnly, query, statusFilter, universeId } = ctx.input.body;

// In collections.list - around line 730 (in where clause building)
if (universeId) {
  where[Op.and].push({ universeId });
}
```

#### 5. `server/routes/api/collections/schema.ts` (MODIFY)

Add 2 lines to existing schemas:

```typescript
// In CollectionsCreateSchema
universeId: z.string().uuid(),

// In CollectionsListSchema  
universeId: z.string().uuid().optional(),
```

---

### Frontend

#### 1. `app/models/Universe.ts` (NEW)

```typescript
export default class Universe extends Model {
  id: string;
  name: string;
  teamId: string;
}
```

#### 2. `app/stores/UniversesStore.ts` (NEW)

```typescript
export default class UniversesStore extends Store<Universe> {
  constructor(rootStore: RootStore) {
    super(rootStore, Universe);
  }
  
  @computed
  get orderedData(): Universe[] {
    return sortBy(Array.from(this.data.values()), "name");
  }
}
```

#### 3. `app/hooks/useActiveUniverse.ts` (NEW)

Logic:
1. If a collection is open, use its `universeId`
2. Otherwise, read from localStorage
3. Fallback to first universe in list

#### 4. `app/stores/CollectionsStore.ts` (MODIFY - 8 lines)

**Add computed property WITHOUT modifying existing methods:**

```typescript
// Add new computed property (don't modify orderedData)
@computed
get orderedDataFilteredByUniverse(): Collection[] {
  const activeUniverseId = this.rootStore.ui.activeUniverseId;
  if (!activeUniverseId) return this.orderedData;
  return this.orderedData.filter(c => c.universeId === activeUniverseId);
}

@computed
get allActiveFilteredByUniverse(): Collection[] {
  const activeUniverseId = this.rootStore.ui.activeUniverseId;
  if (!activeUniverseId) return this.allActive;
  return this.allActive.filter(c => c.universeId === activeUniverseId);
}
```

#### 5. `app/stores/UiStore.ts` (MODIFY - 5 lines)

Add universe state management:

```typescript
@observable
activeUniverseId: string | undefined;

@action
setActiveUniverse = (universeId: string | undefined) => {
  this.activeUniverseId = universeId;
  if (universeId) {
    localStorage.setItem('activeUniverseId', universeId);
  }
};
```

#### 6. `app/components/Sidebar/components/UniverseSelector.tsx` (NEW)

Dropdown component similar to TeamSelector showing:
- Current universe name
- List of all universes to switch
- Styled like existing team selector

#### 7. `app/components/Sidebar/Sidebar.tsx` (MODIFY - 2 lines)

Add `<UniverseSelector />` at top of sidebar (conditionally shown if team has multiple universes)

#### 8. `app/components/Sidebar/components/Collections.tsx` (MODIFY - 1 line)

```typescript
// Change line ~30
const orderedCollections = collections.allActiveFilteredByUniverse; // was: collections.allActive
```

#### 9. `app/components/Collection/CollectionNew.tsx` (MODIFY - ~2 lines)

**Implicit universe assignment** - No UI changes needed:

```typescript
// In handleSubmit, before calling collections.save()
const collection = await collections.save({
  ...data,
  universeId: ui.activeUniverseId, // <-- ADD THIS LINE
});
```

Collection automatically created in currently active universe. User switches universe first if they want to create in different universe.

---

## Migration Strategy

Since you don't want migration handling for existing data, the migrations will:
1. Create `universes` table
2. Seed initial universes per existing team
3. Add `universeId` column to `collections` (nullable initially for dev)

For production, you would need to:
1. Assign existing collections to a default universe
2. Make the column NOT NULL

---

## API Changes Summary

### New Endpoint

```
POST /api/universes.list
Response: { data: [{ id, name, teamId }] }
```

### Modified Endpoints

```
POST /api/collections.create
Body: { ..., universeId: string (required) }

POST /api/collections.list  
Body: { ..., universeId?: string (optional filter) }
```

---

## Estimated Effort

| Area      | New Files | Modified Files | Complexity     |
| --------- | --------- | -------------- | -------------- |
| Server    | 5         | 5              | Low            |
| Frontend  | 4         | 4              | Medium         |
| **Total** | **9**     | **9**          | **Low-Medium** |

---

## Fork Maintenance Strategy

To minimize merge conflicts when syncing with upstream:

### 1. **Keep New Files Isolated**
All new files (Universe model, store, components) won't conflict with upstream changes.

### 2. **Minimal Modifications to Existing Files**
- Collection model: Add 5 lines (field + association)
- API routes: Add parameters without changing logic flow
- Stores: Add computed properties, don't modify existing ones
- Sidebar: Add component, don't restructure existing layout

### 3. **Database Migrations**
Keep migrations separate and sequential. They won't conflict with upstream migrations.

### 4. **Backward Compatibility**
- `universeId` filter is **optional** in `collections.list`
- API changes are additive, not breaking

### 5. **Testing Isolation**
Write tests for Universe-specific functionality in separate test files.

---

## Clarifications Received

1. ✅ **Universe selector style**: Like current team selector (dropdown)
2. ✅ **Empty universe**: Show nothing (no special message)
3. ✅ **Collection API**: Only `universeId` field (no nested object)
4. ✅ **Creation default**: Current active universe

---

## Design Decisions & Edge Cases

### **1. Direct Document Links (Auto-Switch Universe)** ✅
**Problem**: User navigates to document via direct link (e.g., `/doc/my-document-abc123`), but document's collection is in a different universe than currently active.

**Solution**: Auto-switch to document's collection universe when loading.

**Implementation**:
- In document loading logic (Document scene), detect if document's collection universe differs from active
- Call `ui.setActiveUniverse(document.collection.universeId)`
- Sidebar will automatically update to show correct universe

**Files impacted**:
- `app/scenes/Document/index.tsx` - Add universe auto-switch logic
- `app/scenes/Collection/index.tsx` - Add universe auto-switch logic

### **2. Collection Listings in Other Components** ⚠️
**Components showing collections**: Document move dialog, new document menu, search filters, document explorer, quick access actions.

**Decision**: **No filtering** - These components continue to use `collections.orderedData` (showing ALL collections regardless of universe).

**Rationale**: 
- Users should be able to move documents to any collection in any universe
- Search should be global across all universes
- Minimizes code changes and maintains flexibility

**No changes needed** for these components.

### **3. Breadcrumb Navigation** ✅
**Problem**: Clicking collection in document breadcrumb when that collection is in different universe.

**Solution**: Auto-switch to that collection's universe.

**Implementation**:
- In breadcrumb click handler, add universe switch logic
- When collection link is clicked, set active universe to collection's universe

**Files impacted**:
- `app/components/DocumentBreadcrumb.tsx` - Modify collection link onClick

### **4. Universe Store Initialization** ✅
**When**: On app load, after authentication.

**Logic**:
1. Fetch all universes for user's team via `universes.list` API
2. If there's an open document/collection → Use its universe
3. Else if localStorage has saved universe → Use saved universe
4. Else → Use first universe in list (sorted alphabetically)

**Implementation**:
- `app/stores/UniversesStore.ts` - Add `fetchAndSetActive()` method
- `app/components/Authenticated.tsx` - Call fetch on mount

### **5. Collection Move Operations** ⚠️
**Decision**: **No auto-switch** when moving documents between collections in different universes.

**Behavior**: 
- User can move document from Collection A (Universe1) to Collection B (Universe2)
- Active universe stays on Universe1
- Document disappears from current view (expected - it moved to another universe)

**Rationale**: Explicit is better than implicit; auto-switching could be disorienting.

### **6. Performance Optimization** ⚠️
**Decision**: **No special optimization needed initially**.

**Rationale**:
- MobX computed properties are efficient and cached
- Filtering 200 collections is fast (< 1ms)
- Only recomputes when `activeUniverseId` or `orderedData` changes
- Can add memoization later if performance issues arise

### **7. localStorage Edge Cases** ⚠️
**Decision**: **No special handling**.

**Behavior**:
- If stored `activeUniverseId` doesn't exist → Fall back to first universe
- No multi-tab synchronization needed
- Simple and robust

### **8. API Design** ⚠️
**Decision**: **Minimize API changes**.

**Changes**:
- Only `collections.create` requires `universeId` (mandatory)
- Only `collections.list` accepts optional `universeId` filter
- Other endpoints (`collections.info`, `documents.list`) remain unchanged

**Rationale**: 
- Keeps changes minimal
- Most API consumers don't need universe filtering
- Existing integrations continue to work

### **9. Archived Collections** ⚠️
**Decision**: **No universe filtering** for archived collections.

**Behavior**:
- `collections.fetchArchived()` returns archived collections from ALL universes
- Archive view shows all archived collections regardless of active universe

**Rationale**: Archive is a global view; users need to see all archived content.

### **10. Empty Universe Handling** ✅
**Scenario**: All collections in active universe are deleted.

**Behavior**: Same as loading document (question 1) - if user opens any document/collection, auto-switch to its universe.

**Rationale**: Empty universe is a valid state; no special handling needed.

---

## Additional File Impacts (Based on Edge Cases)

### **New Impacts Identified:**

| File                                    | Change | Lines | Purpose                                  |
| --------------------------------------- | ------ | ----- | ---------------------------------------- |
| `app/scenes/Document/index.tsx`         | MODIFY | ~5    | Auto-switch universe on document load    |
| `app/scenes/Collection/index.tsx`       | MODIFY | ~5    | Auto-switch universe on collection load  |
| `app/components/DocumentBreadcrumb.tsx` | MODIFY | ~3    | Auto-switch universe on breadcrumb click |
| `app/components/Authenticated.tsx`      | MODIFY | ~3    | Initialize universes on mount            |

### **Updated Impact Summary:**

**Server**: 8 new files + 5 modified = **13 files**  
**Frontend**: 4 new files + 7 modified = **11 files**  
**Total**: **24 files**, ~70 lines of changes to existing code

**Improvement**: Removed CollectionForm modification - universe is implicitly assigned from active universe.

---

## Implementation Priority

### Phase 1: Core Infrastructure ⭐
1. Database migrations (universes table + collection.universeId)
2. Server models (Universe, Collection association)
3. API endpoints (universes.list, collections.create/list with universeId)
4. Frontend models & stores (Universe, UniversesStore)

### Phase 2: UI Integration ⭐⭐
5. Universe selector component
6. Sidebar integration
7. Collection creation (implicit universe assignment)
8. Store initialization logic

### Phase 3: Navigation & Edge Cases ⭐⭐⭐
9. Auto-switch on document load
10. Auto-switch on collection load
11. Breadcrumb navigation auto-switch
12. Testing & polish

---

## 🎯 SIMPLIFIED PROPOSAL (Minimum Viable Implementation)

### **Goal**: Ship Phase 1 + Phase 2 only, defer Phase 3 features.

### **What's Included (MVP)**:
✅ Database schema (universes table + collection.universeId)  
✅ Backend API (universes.list, collections.create with universeId)  
✅ Frontend store (UniversesStore)  
✅ Universe selector in sidebar  
✅ Collections filtered by active universe in sidebar  
✅ Implicit universe assignment on collection creation  

### **What's Deferred**:
⏸️ Auto-switch on document load  
⏸️ Auto-switch on collection load  
⏸️ Auto-switch on breadcrumb click  
⏸️ Complex initialization logic  

### **User Experience (MVP)**:
- User manually switches universe using dropdown
- Collections in sidebar update to show selected universe
- New collections created in active universe
- **Manual switch needed** when clicking links to different universe (acceptable trade-off)

### **Reduced Impact**:

| Category       | MVP | Full Version | Reduction |
| -------------- | --- | ------------ | --------- |
| New files      | 7   | 8            | -1 file   |
| Modified files | 7   | 11           | -4 files  |
| Lines changed  | ~45 | ~70          | -25 lines |

### **Files Changed (MVP Only)**:

**Server (13 files - same as full version)**:
- All server changes remain (backend is stable)

**Frontend (7 files - reduced from 11)**:
| File                                                | Change  | Lines | Purpose                          |
| --------------------------------------------------- | ------- | ----- | -------------------------------- |
| `app/models/Universe.ts`                            | **NEW** | ~15   | Universe model                   |
| `app/stores/UniversesStore.ts`                      | **NEW** | ~25   | Universe store                   |
| `app/stores/RootStore.ts`                           | MODIFY  | 3     | Add UniversesStore               |
| `app/stores/UiStore.ts`                             | MODIFY  | 5     | Add activeUniverseId state       |
| `app/stores/CollectionsStore.ts`                    | MODIFY  | 10    | Add filtered computed properties |
| `app/components/Sidebar/Sidebar.tsx`                | MODIFY  | 5     | Add universe selector inline     |
| `app/components/Sidebar/components/Collections.tsx` | MODIFY  | 1     | Use filtered collections         |
| `app/components/Collection/CollectionNew.tsx`       | MODIFY  | 2     | Add universeId to save           |
| `app/components/Authenticated.tsx`                  | MODIFY  | 3     | Initialize universes             |

**Removed from MVP**:
- ❌ `app/components/Sidebar/components/UniverseSelector.tsx` (inline instead)
- ❌ `app/scenes/Document/index.tsx` modifications
- ❌ `app/scenes/Collection/index.tsx` modifications  
- ❌ `app/components/DocumentBreadcrumb.tsx` modifications

---

## 🔧 ALTERNATIVE: Centralized Auto-Switch

If you DO want auto-switch in Phase 2, here's a **cleaner approach**:

### **Single Responsibility: `useUniverseSync` Hook**

Create ONE hook that handles all auto-switch logic:

```typescript
// app/hooks/useUniverseSync.ts (NEW - ~30 lines)
export function useUniverseSync(
  entity?: Document | Collection,
  trigger: 'document' | 'collection' | 'breadcrumb' = 'document'
) {
  const { ui } = useStores();
  
  useEffect(() => {
    if (!entity) return;
    
    const targetUniverseId = entity instanceof Document 
      ? entity.collection?.universeId 
      : entity.universeId;
    
    if (targetUniverseId && targetUniverseId !== ui.activeUniverseId) {
      ui.setActiveUniverse(targetUniverseId);
    }
  }, [entity?.id, ui]);
}
```

**Usage** (only 1 line per component):

```typescript
// In Document scene
useUniverseSync(document, 'document');

// In Collection scene  
useUniverseSync(collection, 'collection');

// In DocumentBreadcrumb (onClick)
onClick={() => {
  useUniverseSync(collection, 'breadcrumb');
  navigate(collection.path);
}}
```

**Impact**:
- +1 new hook file (~30 lines)
- Only 1 line added per component (instead of 5 lines each)
- All auto-switch logic in ONE place
- Easy to disable/modify

---

## 📊 Comparison Table

| Approach                   | Files Changed | Lines Changed | Complexity | Ship Time |
| -------------------------- | ------------- | ------------- | ---------- | --------- |
| **Full Proposal**          | 24            | ~70           | Medium     | 2 weeks   |
| **MVP (No Auto-Switch)**   | 20            | ~45           | Low        | 1 week    |
| **MVP + Centralized Hook** | 21            | ~55           | Low-Medium | 1.5 weeks |

---

## 💡 Recommendation

**Start with MVP** (no auto-switch), then add **centralized hook** in Phase 3 if users request it.

**Rationale**:
- Delivers core value (filtering 200 collections) fastest
- Minimal risk and impact
- Can gather user feedback before adding auto-switch
- Easier to debug and maintain
- Natural upgrade path
