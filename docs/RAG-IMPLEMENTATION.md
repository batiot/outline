# RAG Search Implementation Plan

This document outlines the detailed implementation tasks for adding RAG search capabilities to Outline.

## Prerequisites

Before starting implementation:

- [ ] LiteLLM server deployed and accessible
- [ ] AWS Bedrock credentials configured in LiteLLM
- [ ] Review [RAG-DESIGN.md](./RAG-DESIGN.md) for architecture details

Note: The `pgvector` PostgreSQL extension will be installed automatically via the database migration in Task 1.1.

---

## Phase 1: Foundation (Priority: High)

### Task 1.1: Database Migration

**File**: `server/migrations/YYYYMMDDHHMMSS-add-document-embeddings.js`

Create database migration for document embeddings table with pgvector support.

**Steps**:
1. Create migration file using Sequelize CLI:
   ```bash
   yarn sequelize migration:create --name=add-document-embeddings
   ```
2. Add pgvector extension installation
3. Create `document_embeddings` table:
   - `id` (UUID, primary key)
   - `documentId` (UUID, foreign key to documents)
   - `teamId` (UUID, foreign key to teams)
   - `chunkIndex` (INTEGER)
   - `chunkText` (TEXT)
   - `documentVersion` (INTEGER) - for change detection
   - `embedding` (vector(1536))
   - `modelId` (VARCHAR(255))
   - `createdAt`, `updatedAt` (TIMESTAMP)
4. Create indexes:
   - HNSW index on embedding column for vector search
   - Indexes on teamId, documentId, modelId for filtering
   - Unique constraint on (documentId, chunkIndex, modelId)
5. Test migration up and down

**Acceptance Criteria**:
- [ ] Migration runs successfully on fresh database
- [ ] Migration rollback works correctly
- [ ] pgvector extension is available
- [ ] Indexes are created properly

---

### Task 1.2: Plugin Structure Setup

**Files**:
- `plugins/rag/plugin.json`
- `plugins/rag/server/index.ts`
- `plugins/rag/server/env.ts`

Create the RAG plugin skeleton following Outline's plugin conventions.

**Steps**:
1. Create plugin directory structure:
   ```
   plugins/rag/
   ├── plugin.json
   └── server/
       ├── index.ts
       ├── env.ts
       ├── api/
       ├── helpers/
       ├── models/
       ├── presenters/
       ├── processors/
       ├── services/
       └── tasks/
   ```

2. Create `plugin.json`:
   ```json
   {
     "id": "rag",
     "name": "RAG Search",
     "priority": 500,
     "description": "Adds semantic search via RAG (Retrieval Augmented Generation)"
   }
   ```

3. Create `env.ts` with configuration:
   ```typescript
   import { bool, cleanEnv, num, str } from "envalid";

   export default cleanEnv(process.env, {
     RAG_ENABLED: bool({ default: false }),
     RAG_LITELLM_BASE_URL: str({ default: "" }),
     RAG_LITELLM_API_KEY: str({ default: "" }),
     RAG_EMBEDDING_MODEL: str({ default: "amazon.titan-embed-text-v1" }),
     RAG_EMBEDDING_DIMENSION: num({ default: 1536 }),
     RAG_SIMILARITY_THRESHOLD: num({ default: 0.7 }),
     RAG_CHUNK_SIZE: num({ default: 500 }),
     RAG_CHUNK_OVERLAP: num({ default: 50 }),
     RAG_MAX_QUERY_LENGTH: num({ default: 1000 }),
     RAG_BATCH_SIZE: num({ default: 20 }),
   });
   ```

4. Create `index.ts` plugin registration (initially empty hooks)

**Acceptance Criteria**:
- [ ] Plugin is recognized by PluginManager
- [ ] Environment variables are loaded correctly
- [ ] Plugin structure follows existing patterns (webhooks, slack, etc.)

---

### Task 1.3: DocumentEmbedding Model

**File**: `plugins/rag/server/models/DocumentEmbedding.ts`

Create Sequelize model for document embeddings with pgvector support.

**Steps**:
1. Install pgvector package:
   ```bash
   yarn add pgvector
   ```

2. Create DocumentEmbedding model:
   ```typescript
   import {
     Table,
     Column,
     BelongsTo,
     ForeignKey,
     DataType,
   } from "sequelize-typescript";
   import { Document, Team } from "@server/models";
   import IdModel from "@server/models/base/IdModel";

   @Table({ tableName: "document_embeddings" })
   class DocumentEmbedding extends IdModel<
     InferAttributes<DocumentEmbedding>,
     InferCreationAttributes<DocumentEmbedding>
   > {
     @ForeignKey(() => Document)
     @Column(DataType.UUID)
     documentId: string;

     @ForeignKey(() => Team)
     @Column(DataType.UUID)
     teamId: string;

     @Column(DataType.INTEGER)
     chunkIndex: number;

     @Column(DataType.TEXT)
     chunkText: string;

     @Column(DataType.INTEGER)
     documentVersion: number;

     @Column(DataType.ARRAY(DataType.FLOAT))
     embedding: number[];

     @Column(DataType.STRING(255))
     modelId: string;

     @BelongsTo(() => Document)
     document: Document;

     @BelongsTo(() => Team)
     team: Team;
   }
   ```

3. Add static methods:
   - `findSimilar(embedding, teamId, collectionIds, options)`
   - `deleteForDocument(documentId)`
   - `getEmbeddingStatus(documentId)`

4. Register model in plugin index

**Acceptance Criteria**:
- [ ] Model syncs with database correctly
- [ ] Associations work (document, team)
- [ ] Vector column stores embeddings correctly
- [ ] CRUD operations work

---

### Task 1.4: LiteLLM Client Service

**File**: `plugins/rag/server/services/LiteLLMClient.ts`

Create client service for LiteLLM embedding API.

**Steps**:
1. Create LiteLLMClient class:
   ```typescript
   interface EmbeddingResponse {
     data: Array<{ embedding: number[]; index: number }>;
     model: string;
     usage: { prompt_tokens: number; total_tokens: number };
   }

   class LiteLLMClient {
     private baseUrl: string;
     private apiKey: string;
     private model: string;

     constructor(config: { baseUrl: string; apiKey: string; model: string });

     async createEmbedding(input: string): Promise<number[]>;
     
     async createEmbeddings(inputs: string[]): Promise<number[][]>;
     
     async batchCreateEmbeddings(
       inputs: string[], 
       batchSize?: number
     ): Promise<number[][]>;

     private async request<T>(endpoint: string, body: object): Promise<T>;
   }
   ```

2. Implement error handling:
   - Connection errors
   - Rate limiting (429)
   - Invalid responses
   - Timeout handling

3. Add retry logic with exponential backoff

4. Add request/response logging

**Acceptance Criteria**:
- [ ] Can connect to LiteLLM server
- [ ] Single embedding generation works
- [ ] Batch embedding generation works
- [ ] Error handling is robust
- [ ] Retries work correctly

---

## Phase 2: Core Features (Priority: High)

### Task 2.1: Document Chunking Helper

**File**: `plugins/rag/server/helpers/ChunkingHelper.ts`

Create helper for splitting documents into chunks for embedding.

**Steps**:
1. Create ChunkingHelper class:
   ```typescript
   interface DocumentChunk {
     index: number;
     text: string;
     startOffset: number;
     endOffset: number;
   }

   class ChunkingHelper {
     static chunkDocument(
       document: Document,
       options?: {
         chunkSize?: number;
         chunkOverlap?: number;
         minChunkSize?: number;
       }
     ): DocumentChunk[];
     
     private static splitAtBoundaries(
       text: string,
       targetSize: number
     ): string[];
   }
   ```

2. Implement chunking logic:
   - Use `DocumentHelper.toPlainText()` to get text
   - Split on paragraph boundaries when possible
   - Fall back to sentence boundaries
   - Apply overlap between chunks
   - Skip very small chunks

3. Add unit tests

**Acceptance Criteria**:
- [ ] Documents are chunked correctly
- [ ] Chunks respect size limits
- [ ] Overlap is applied correctly
- [ ] Edge cases handled (empty doc, single paragraph, etc.)

---

### Task 2.2: Embedding Generation Task

**File**: `plugins/rag/server/tasks/GenerateDocumentEmbeddingsTask.ts`

Create background task for generating document embeddings.

**Steps**:
1. Create task class extending BaseTask:
   ```typescript
   interface GenerateDocumentEmbeddingsProps {
     documentId: string;
     force?: boolean;
   }

   class GenerateDocumentEmbeddingsTask 
     extends BaseTask<GenerateDocumentEmbeddingsProps> {
     
     async perform(props: GenerateDocumentEmbeddingsProps): Promise<void>;
   }
   ```

2. Implement task logic:
   - Load document with permissions check
   - Skip if document is draft or deleted
   - Check if embeddings exist with current document version
   - If current version already embedded (and not forced), skip
   - Delete ALL existing embeddings for this document
   - Chunk document content
   - Generate embeddings for all chunks via LiteLLM
   - Save new embeddings with current document version and model ID

3. Handle errors gracefully:
   - Log failures
   - Don't fail entire job on single chunk failure

4. Register task in plugin index

**Acceptance Criteria**:
- [ ] Task generates embeddings for documents
- [ ] Skips documents with current version already embedded
- [ ] Fully replaces embeddings on document updates
- [ ] Task handles large documents
- [ ] Errors don't crash the task
- [ ] Old embeddings are properly cleaned up

---

### Task 2.3: Document Change Processor

**File**: `plugins/rag/server/processors/DocumentEmbeddingProcessor.ts`

Create event processor to trigger embedding updates on document changes.

**Steps**:
1. Create processor class:
   ```typescript
   class DocumentEmbeddingProcessor extends BaseProcessor {
     static applicableEvents = [
       "documents.create",
       "documents.update", 
       "documents.publish",
       "documents.unpublish",
       "documents.delete",
       "documents.permanent_delete",
     ];

     async perform(event: Event): Promise<void>;
   }
   ```

2. Implement event handling:
   - `documents.publish`: Queue embedding generation
   - `documents.update`: Queue if content changed
   - `documents.delete`/`unpublish`: Remove embeddings
   - `documents.permanent_delete`: Remove embeddings

3. Add debouncing for rapid updates

4. Register processor in plugin index

**Acceptance Criteria**:
- [ ] New published documents get indexed
- [ ] Updated documents get re-indexed
- [ ] Deleted documents have embeddings removed
- [ ] Rapid updates are debounced
- [ ] Events from drafts are ignored

---

### Task 2.4: RAG Search Helper

**File**: `plugins/rag/server/helpers/RAGSearchHelper.ts`

Create core search helper with permission-aware vector search.

**Steps**:
1. Create RAGSearchHelper class:
   ```typescript
   interface RAGSearchOptions {
     query: string;
     limit?: number;
     threshold?: number;
     collectionId?: string;
     documentId?: string;
   }

   interface RAGSearchResult {
     id: string;
     documentId: string;
     document: Document;
     score: number;
     context: string;
     chunkIndex: number;
   }

   class RAGSearchHelper {
     static async searchForUser(
       user: User,
       options: RAGSearchOptions
     ): Promise<{
       results: RAGSearchResult[];
       total: number;
     }>;

     private static async getQueryEmbedding(query: string): Promise<number[]>;
     
     private static buildPermissionFilter(
       user: User,
       collectionId?: string
     ): WhereOptions;
   }
   ```

2. Implement search logic:
   - Generate embedding for query
   - Get user's accessible collection IDs
   - Execute vector similarity search with permission filters in SQL
   - Load full document data for results
   - Return results sorted by score

3. Use raw SQL for vector search with permission filtering:
   ```sql
   SELECT 
     de.*,
     d.id as "documentId",
     d.title,
     d."collectionId",
     1 - (de.embedding <=> $1) as score
   FROM document_embeddings de
   INNER JOIN documents d ON de."documentId" = d.id
   LEFT JOIN user_memberships um ON d.id = um."documentId" AND um."userId" = $2
   WHERE de."teamId" = $3
     AND de."modelId" = $4
     AND d."publishedAt" IS NOT NULL
     AND d."deletedAt" IS NULL
     AND (
       d."collectionId" = ANY($5)
       OR um.id IS NOT NULL
     )
     AND 1 - (de.embedding <=> $1) > $6
   ORDER BY score DESC
   LIMIT $7
   ```
   
   **Critical**: Permissions MUST be in the WHERE clause, not applied after retrieval.

4. Add caching for query embeddings (optional)

**Acceptance Criteria**:
- [ ] Search returns relevant results
- [ ] Permissions are enforced in SQL query
- [ ] Score threshold works
- [ ] Collection filtering works
- [ ] Results are sorted by relevance

---

## Phase 3: API Layer (Priority: High)

### Task 3.1: API Schema

**File**: `plugins/rag/server/api/schema.ts`

Create Zod schemas for API request/response validation.

**Steps**:
1. Create request schemas:
   ```typescript
   export const RAGSearchSchema = BaseSchema.extend({
     body: z.object({
       query: z.string().min(3).max(1000),
       limit: z.number().min(1).max(50).default(10),
       threshold: z.number().min(0).max(1).default(0.7),
       collectionId: z.string().uuid().optional(),
       documentId: z.string().uuid().optional(),
       includeContext: z.boolean().default(true),
     }),
   });
   ```

2. Create response types
3. Export request types for type inference

**Acceptance Criteria**:
- [ ] All schemas validate correctly
- [ ] Types are exported for API routes
- [ ] Validation errors are descriptive

---

### Task 3.2: Result Presenter

**File**: `plugins/rag/server/presenters/ragResult.ts`

Create presenter for RAG search results.

**Steps**:
1. Create presenter function:
   ```typescript
   interface PresentedRAGResult {
     id: string;
     document: {
       id: string;
       title: string;
       url: string;
       collectionId: string;
       updatedAt: string;
     };
     score: number;
     context: string;
     chunkIndex: number;
   }

   export function presentRAGResult(
     result: RAGSearchResult,
     ctx: APIContext
   ): PresentedRAGResult;

   export function presentRAGResults(
     results: RAGSearchResult[],
     ctx: APIContext
   ): PresentedRAGResult[];
   ```

2. Include document URL generation
3. Sanitize context text

**Acceptance Criteria**:
- [ ] Results are formatted correctly
- [ ] Document URLs are generated properly
- [ ] Context text is safe

---

### Task 3.3: API Routes

**File**: `plugins/rag/server/api/rag.ts`

Create API routes for RAG search functionality.

**Steps**:
1. Create router with endpoint:

   **`POST /api/rag.search`**:
   - Validate request with RAGSearchSchema
   - Check RAG_ENABLED flag
   - Call RAGSearchHelper.searchForUser
   - Return presented results

2. Apply middleware:
   - `auth()` for authentication
   - `validate()` for schema validation

3. Register routes in plugin index

**Acceptance Criteria**:
- [ ] Search endpoint works correctly
- [ ] Authentication is enforced
- [ ] Validation works correctly
- [ ] Errors are handled gracefully
- [ ] Results respect user permissions

---

### Task 3.4: Plugin Registration

**File**: `plugins/rag/server/index.ts`

Complete plugin registration with all hooks.

**Steps**:
1. Register API routes:
   ```typescript
   import { PluginManager, Hook } from "@server/utils/PluginManager";
   import config from "../plugin.json";
   import ragRoutes from "./api/rag";
   import DocumentEmbeddingProcessor from "./processors/DocumentEmbeddingProcessor";
   import GenerateDocumentEmbeddingsTask from "./tasks/GenerateDocumentEmbeddingsTask";
   import BulkIndexDocumentsTask from "./tasks/BulkIndexDocumentsTask";
   import CleanupOrphanedEmbeddingsTask from "./tasks/CleanupOrphanedEmbeddingsTask";

   PluginManager.add([
     {
       ...config,
       type: Hook.API,
       value: ragRoutes,
     },
     {
       type: Hook.Processor,
       value: DocumentEmbeddingProcessor,
     },
     {
       type: Hook.Task,
       value: GenerateDocumentEmbeddingsTask,
     },
     {
       type: Hook.Task,
       value: BulkIndexDocumentsTask,
     },
     {
       type: Hook.Task,
       value: CleanupOrphanedEmbeddingsTask,
     },
     {
       type: Hook.Task,
       value: CleanupObsoleteEmbeddingsTask,
     },
   ]);
   ```

2. Add feature flag check

**Acceptance Criteria**:
- [ ] Plugin loads correctly
- [ ] API routes are mounted at /api/rag.*
- [ ] Tasks are registered
- [ ] Processor is registered

---

## Phase 4: Quality & Operations (Priority: Medium)

### Task 4.1: Bulk Indexing Task

**File**: `plugins/rag/server/tasks/BulkIndexDocumentsTask.ts`

Create task for bulk indexing all team documents.

**Steps**:
1. Create task:
   ```typescript
   interface BulkIndexDocumentsProps {
     teamId: string;
     force?: boolean;
   }

   class BulkIndexDocumentsTask extends BaseTask<BulkIndexDocumentsProps> {
     async perform(props: BulkIndexDocumentsProps): Promise<void>;
   }
   ```

2. Implement:
   - Query all published documents for team
   - Filter out already indexed (unless force)
   - Queue individual GenerateDocumentEmbeddingsTask jobs
   - Add progress logging

**Acceptance Criteria**:
- [ ] All team documents get queued
- [ ] Existing embeddings are skipped (unless force)
- [ ] Progress is logged
- [ ] Large teams are handled efficiently

---

### Task 4.2: Cleanup Task

**File**: `plugins/rag/server/tasks/CleanupOrphanedEmbeddingsTask.ts`

Create task for removing orphaned embeddings.

**Steps**:
1. Create scheduled task:
   - Find embeddings without corresponding documents
   - Delete orphaned embeddings
   - Log cleanup statistics

2. Run periodically (daily)

**Acceptance Criteria**:
- [ ] Orphaned embeddings are identified
- [ ] Cleanup removes correct records
- [ ] Statistics are logged

---

### Task 4.3: Model Cleanup Task

**File**: `plugins/rag/server/tasks/CleanupObsoleteEmbeddingsTask.ts`

Create task for removing embeddings from obsolete models.

**Steps**:
1. Create scheduled task:
   - Get current `RAG_EMBEDDING_MODEL` from config
   - Find embeddings where `modelId` != current model
   - Delete obsolete embeddings
   - Log cleanup statistics (models removed, embeddings deleted)

2. Run on-demand or periodically (weekly)

**Acceptance Criteria**:
- [ ] Identifies embeddings from old models
- [ ] Removes obsolete embeddings
- [ ] Logs statistics
- [ ] Current model embeddings are preserved

---

### Task 4.4: Unit Tests

**Files**:
- `plugins/rag/server/helpers/ChunkingHelper.test.ts`
- `plugins/rag/server/helpers/RAGSearchHelper.test.ts`
- `plugins/rag/server/services/LiteLLMClient.test.ts`
- `plugins/rag/server/api/rag.test.ts`

Create comprehensive unit tests.

**Steps**:
1. ChunkingHelper tests:
   - Document chunking
   - Edge cases (empty, small, large)
   - Hash computation

2. RAGSearchHelper tests:
   - Permission filtering
   - Score thresholding
   - Collection filtering

3. LiteLLMClient tests:
   - Mock API responses
   - Error handling
   - Retry logic

4. API route tests:
   - Authentication
   - Validation
   - Response format

**Acceptance Criteria**:
- [ ] All helpers have >80% coverage
- [ ] API routes are tested
- [ ] Edge cases are covered
- [ ] Tests pass in CI

---

### Task 4.5: Documentation

**Files**:
- `plugins/rag/README.md`
- Update `docs/ARCHITECTURE.md`

Create documentation for the RAG feature.

**Steps**:
1. Create plugin README:
   - Feature overview
   - Configuration guide
   - API reference
   - Troubleshooting

2. Update architecture docs

**Acceptance Criteria**:
- [ ] README is comprehensive
- [ ] Configuration is documented
- [ ] API is documented

---

## Phase 5: Advanced Features (Priority: Low)

### Task 5.1: Hybrid Search

**File**: `plugins/rag/server/helpers/HybridSearchHelper.ts`

Implement simple hybrid search combining vector and keyword results.

**Steps**:
1. Create HybridSearchHelper with Reciprocal Rank Fusion (RRF):
   ```typescript
   class HybridSearchHelper {
     static async searchForUser(
       user: User,
       options: RAGSearchOptions & { mode: 'vector' | 'hybrid' }
     ): Promise<RAGSearchResult[]> {
       if (options.mode === 'vector') {
         return RAGSearchHelper.searchForUser(user, options);
       }
       
       // Execute both searches in parallel
       const [vectorResults, keywordResults] = await Promise.all([
         RAGSearchHelper.searchForUser(user, options),
         SearchHelper.searchForUser(user, { 
           query: options.query,
           limit: options.limit 
         })
       ]);
       
       // Merge using RRF
       return this.mergeWithRRF(vectorResults, keywordResults, options);
     }
     
     private static mergeWithRRF(
       vectorResults: RAGSearchResult[],
       keywordResults: SearchResult[],
       options: { vectorWeight?: number; keywordWeight?: number; limit: number }
     ): RAGSearchResult[] {
       const k = 60; // RRF constant
       const scores = new Map<string, { score: number; result: any }>();
       
       // Add vector scores
       vectorResults.forEach((result, rank) => {
         const rrf = 1 / (k + rank + 1);
         scores.set(result.documentId, {
           score: rrf * (options.vectorWeight || 0.7),
           result
         });
       });
       
       // Add keyword scores
       keywordResults.forEach((result, rank) => {
         const docId = result.document.id;
         const rrf = 1 / (k + rank + 1);
         const existing = scores.get(docId);
         if (existing) {
           existing.score += rrf * (options.keywordWeight || 0.3);
         } else {
           scores.set(docId, {
             score: rrf * (options.keywordWeight || 0.3),
             result: { ...result, score: 0 } // Convert to RAG format
           });
         }
       });
       
       // Sort and return top results
       return Array.from(scores.values())
         .sort((a, b) => b.score - a.score)
         .slice(0, options.limit)
         .map(({ result }) => result);
     }
   }
   ```

2. Update API schema to include `mode` parameter:
   ```typescript
   export const RAGSearchSchema = BaseSchema.extend({
     body: z.object({
       // ... existing fields
       mode: z.enum(['vector', 'hybrid']).default('vector'),
     }),
   });
   ```

3. Update API route to use HybridSearchHelper

**Acceptance Criteria**:
- [ ] Hybrid mode combines vector + keyword results
- [ ] RRF scoring works correctly
- [ ] No modification to existing SearchHelper
- [ ] Results are properly deduplicated
- [ ] Weights are configurable

---

### Task 5.2: Search Analytics (Future)

Track RAG search usage for improvement.

**Steps**:
1. Create RAGSearchQuery model
2. Log search queries and results
3. Add analytics endpoint

---

## Phase 6: Testing & Validation (No Core Changes)

### Task 6.1: Plugin Integration Test

**File**: `plugins/rag/server/index.test.ts`

Create a comprehensive integration test for the plugin.

**Steps**:
1. Create `index.test.ts` in the plugin directory.
2. Implement test cases for:
   - **Chunking**: Verify `ChunkingHelper` splits text correctly.
   - **Permissions**: Verify `RAGSearchHelper` respects collection access.
   - **Hybrid Search**: Verify `HybridSearchHelper` merges results correctly.
   - **LiteLLM**: Mock API responses to test error handling and retries.
3. Run with: `yarn test plugins/rag/server/index.test.ts`.

### Task 6.2: CLI Playground Script

**File**: `plugins/rag/scripts/query.ts`

A standalone script to test the RAG engine from the terminal.

**Steps**:
1. Create `scripts/query.ts`.
2. Implement CLI arguments using `yargs` or similar:
   - `--embed <docId>`: Manually trigger embedding for a document.
   - `--query <text>`: Run a hybrid search query and print ranked results with scores.
   - `--debug`: Print the full prompt sent to the LLM.
3. Usage:
   ```bash
   ./node_modules/.bin/ts-node plugins/rag/scripts/query.ts --query "How do I setup SSO?"
   ```

---

## Implementation Order

### Sprint 1 (Week 1-2): Foundation
- [x] Task 1.1: Database Migration
- [x] Task 1.2: Plugin Structure Setup
- [x] Task 1.3: DocumentEmbedding Model
- [x] Task 1.4: LiteLLM Client Service

### Sprint 2 (Week 3-4): Core Features
- [ ] Task 2.1: Document Chunking Helper
- [ ] Task 2.2: Embedding Generation Task
- [ ] Task 2.3: Document Change Processor
- [ ] Task 2.4: RAG Search Helper

### Sprint 3 (Week 5-6): API Layer
- [ ] Task 3.1: API Schema
- [ ] Task 3.2: Result Presenter
- [ ] Task 3.3: API Routes
- [ ] Task 3.4: Plugin Registration

### Sprint 4 (Week 7-8): Quality & Operations
- [ ] Task 4.1: Bulk Indexing Task
- [ ] Task 4.2: Cleanup Task
- [ ] Task 4.3: Unit Tests
- [ ] Task 4.4: Documentation

### Sprint 5 (Week 9): Testing & Validation
- [ ] Task 6.1: Plugin Integration Test
- [ ] Task 6.2: CLI Playground Script

---

## Dependencies Between Tasks

```
Task 1.1 (Migration)
    │
    └──▶ Task 1.3 (Model)
              │
              ├──▶ Task 2.2 (Embedding Task)
              │         │
              │         └──▶ Task 2.3 (Processor)
              │
              └──▶ Task 2.4 (Search Helper)
                        │
                        └──▶ Task 3.3 (API Routes)

Task 1.2 (Plugin Setup)
    │
    ├──▶ Task 1.4 (LiteLLM Client)
    │         │
    │         └──▶ Task 2.1 (Chunking) ──▶ Task 2.2
    │
    └──▶ Task 3.4 (Registration)

Task 3.1 (Schema) ──▶ Task 3.3 (API Routes)
Task 3.2 (Presenter) ──▶ Task 3.3 (API Routes)
```

---

## Verification Checklist

After implementation, verify:

- [ ] Run migrations successfully
- [ ] Plugin loads without errors
- [ ] Can generate embeddings for a document
- [ ] Can search and get results
- [ ] Permissions are enforced
- [ ] Tests pass
- [ ] No memory leaks with large documents
- [ ] Error handling works correctly
- [ ] Logging is comprehensive

---

## Rollback Plan

If issues are found:

1. **Disable feature**: Set `RAG_ENABLED=false`
2. **Stop processing**: Clear embedding queue
3. **Rollback migration**: `yarn db:migrate:undo`
4. **Remove plugin**: Delete `plugins/rag/` directory

---

## Success Criteria

The implementation is complete when:

1. ✅ Users can search documents semantically via API
2. ✅ Results respect document permissions
3. ✅ Embeddings update automatically on document changes
4. ✅ Search performance is acceptable (<500ms p95)
5. ✅ All tests pass
6. ✅ Documentation is complete
