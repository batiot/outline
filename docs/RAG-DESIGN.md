# RAG Search Feature - Design Document

## 1. Overview

This document describes the design for adding RAG (Retrieval Augmented Generation) search capabilities to Outline. The feature enables semantic search via embeddings, allowing users to query documents using natural language and receive contextually relevant results.

### 1.1 Goals

- **API-Only Implementation**: Provide RAG search via API endpoint only (no UI changes)
- **Minimal Fork Impact**: Add new files with minimal modifications to existing codebase
- **Permission-Aware**: Respect existing collection and document access permissions
- **LLM-Agnostic**: Support embeddings via LiteLLM (compatible with AWS Bedrock, OpenAI, etc.)
- **Basic Implementation**: Focus on document content embeddings (no attachments/metadata initially)

### 1.2 Non-Goals (Phase 1)

- User interface changes
- Attachment content indexing
- Document metadata embeddings
- Fine-tuning or custom model training
- Real-time embedding updates via WebSocket

---

## 2. Architecture

### 2.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              Outline Server                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────────┐    ┌──────────────────┐    ┌───────────────────┐  │
│  │   RAG Plugin     │───▶│  RAG Search      │───▶│  LiteLLM Client   │  │
│  │   (API Routes)   │    │  Helper          │    │                   │  │
│  └──────────────────┘    └──────────────────┘    └─────────┬─────────┘  │
│           │                      │                          │            │
│           │                      │                          ▼            │
│           │                      │               ┌───────────────────┐  │
│           │                      │               │  LiteLLM Server   │  │
│           │                      │               │  (External)       │  │
│           │                      │               │  AWS Bedrock      │  │
│           │                      │               └───────────────────┘  │
│           │                      │                                       │
│           │                      ▼                                       │
│           │           ┌──────────────────┐                              │
│           │           │  PostgreSQL      │                              │
│           │           │  + pgvector      │                              │
│           │           │                  │                              │
│           │           │  ┌────────────┐  │                              │
│           │           │  │ document_  │  │                              │
│           │           │  │ embeddings │  │                              │
│           │           │  └────────────┘  │                              │
│           │           └──────────────────┘                              │
│           │                                                              │
│           ▼                                                              │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                     Existing Outline Components                    │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌───────────────────┐  │  │
│  │  │ Document │  │  User    │  │Collection│  │ SearchHelper      │  │  │
│  │  │ Model    │  │  Model   │  │ Model    │  │ (Permission-aware)│  │  │
│  │  └──────────┘  └──────────┘  └──────────┘  └───────────────────┘  │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Component Overview

| Component | Location | Purpose |
|-----------|----------|---------|
| RAG Plugin | `plugins/rag/` | Plugin entry point, API routes |
| RAG Search Helper | `plugins/rag/server/helpers/` | Core RAG search logic |
| LiteLLM Client | `plugins/rag/server/services/` | Embedding API client |
| Document Embeddings Model | `plugins/rag/server/models/` | Sequelize model for embeddings |
| Embedding Task | `plugins/rag/server/tasks/` | Background task for generating embeddings |
| Embedding Processor | `plugins/rag/server/processors/` | Event processor for document changes |

---

## 3. Data Model

### 3.1 Document Embeddings Table

A new table `document_embeddings` will store vector embeddings for document chunks.

```sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE document_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "documentId" UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  "teamId" UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  "chunkIndex" INTEGER NOT NULL,
  "chunkText" TEXT NOT NULL,
  "documentVersion" INTEGER NOT NULL,  -- Document version for change detection
  embedding vector(1536),             -- Configurable dimension
  "modelId" VARCHAR(255) NOT NULL,    -- e.g., "amazon.titan-embed-text-v1"
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  
  CONSTRAINT document_embeddings_unique_chunk 
    UNIQUE ("documentId", "chunkIndex", "modelId")
);

-- Index for similarity search with HNSW (recommended for large datasets)
CREATE INDEX document_embeddings_vector_idx 
  ON document_embeddings 
  USING hnsw (embedding vector_cosine_ops);

-- Index for filtering by team and document
CREATE INDEX document_embeddings_team_idx ON document_embeddings ("teamId");
CREATE INDEX document_embeddings_document_idx ON document_embeddings ("documentId");
CREATE INDEX document_embeddings_model_idx ON document_embeddings ("modelId");
```

### 3.2 Chunking Strategy

Documents will be split into chunks for embedding:

- **Chunk Size**: ~500 tokens (configurable)
- **Overlap**: ~50 tokens between chunks
- **Boundaries**: Prefer paragraph/sentence boundaries
- **Minimum Size**: Skip chunks < 50 tokens
- **Update Strategy**: Re-embed entire document on any change (simpler than tracking individual chunk changes)

```typescript
interface DocumentChunk {
  documentId: string;
  chunkIndex: number;
  chunkText: string;
  startOffset: number;
  endOffset: number;
}
```

**Note**: For simplicity, document updates trigger a full re-embedding. A single character change may shift chunk boundaries, making partial updates complex and error-prone. Full re-embedding is fast enough with modern embedding APIs.

### 3.3 Embedding Metadata

Embeddings are tracked by document version and model ID:

- **Version Check**: Compare `document.version` with `max(documentVersion)` from embeddings table
- **Model Filter**: Always filter by current `RAG_EMBEDDING_MODEL` in searches
- **Cleanup**: Periodically remove embeddings for obsolete models

---

## 4. API Design

### 4.1 RAG Search Endpoint

**POST `/api/rag.search`**

Search documents using semantic similarity. This is the only API endpoint needed for the feature.

#### Request

```typescript
interface RAGSearchRequest {
  /** Natural language search query */
  query: string;
  
  /** Maximum number of results (default: 10, max: 50) */
  limit?: number;
  
  /** Minimum similarity threshold (0-1, default: 0.7) */
  threshold?: number;
  
  /** Filter by collection ID */
  collectionId?: string;
  
  /** Filter by document ID (search within document) */
  documentId?: string;
  
  /** Include document context snippets */
  includeContext?: boolean;
}
```

#### Response

```typescript
interface RAGSearchResponse {
  data: Array<{
    /** Unique result ID */
    id: string;
    
    /** The matching document */
    document: {
      id: string;
      title: string;
      url: string;
      collectionId: string;
      updatedAt: string;
    };
    
    /** Cosine similarity score (0-1) */
    score: number;
    
    /** Matching text chunk */
    context: string;
    
    /** Chunk position in document */
    chunkIndex: number;
  }>;
  
  pagination: {
    limit: number;
    total: number;
  };
}
```

#### Example Request

```bash
curl -X POST https://outline.example.com/api/rag.search \
  -H "Authorization: Bearer <API_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "How do I configure SSO for our organization?",
    "limit": 10,
    "threshold": 0.7,
    "includeContext": true
  }'
```

#### Example Response

```json
{
  "data": [
    {
      "id": "emb_abc123",
      "document": {
        "id": "doc_xyz789",
        "title": "Single Sign-On (SSO) Configuration Guide",
        "url": "/doc/sso-configuration-abc123",
        "collectionId": "col_def456",
        "updatedAt": "2024-01-15T10:30:00Z"
      },
      "score": 0.92,
      "context": "To configure SSO for your organization, navigate to Settings > Security > Single Sign-On. You can choose between SAML 2.0 and OIDC protocols...",
      "chunkIndex": 2
    }
  ],
  "pagination": {
    "limit": 10,
    "total": 1
  }
}
```

---

## 5. Permission Model

RAG search respects Outline's existing permission system:

### 5.1 Search Permission Flow

```
User Request
    │
    ▼
┌────────────────────┐
│ Get User's         │
│ Accessible         │
│ Collection IDs     │
│ (user.collectionIds)│
└────────┬───────────┘
         │
         ▼
┌────────────────────┐
│ Vector Similarity  │
│ Search with        │
│ Collection Filter  │
└────────┬───────────┘
         │
         ▼
┌────────────────────┐
│ Document-Level     │
│ Permission Check   │
│ (authorize)        │
└────────┬───────────┘
         │
         ▼
┌────────────────────┐
│ Return Filtered    │
│ Results            │
└────────────────────┘
```

### 5.2 Permission Implementation

**Critical**: Permissions must be enforced in the SQL query, not after retrieval. This ensures the database returns the top N results the user can actually access.

```typescript
// Get accessible collection IDs for user
const collectionIds = await user.collectionIds();

// Use raw SQL with permission filtering in WHERE clause
const results = await sequelize.query(`
  SELECT 
    de.*,
    d.id as "documentId",
    d.title,
    d."collectionId",
    1 - (de.embedding <=> :queryEmbedding) as score
  FROM document_embeddings de
  INNER JOIN documents d ON de."documentId" = d.id
  LEFT JOIN user_memberships um ON d.id = um."documentId" AND um."userId" = :userId
  LEFT JOIN collection_memberships cm ON d."collectionId" = cm."collectionId" 
    AND cm."userId" = :userId
  WHERE de."teamId" = :teamId
    AND de."modelId" = :modelId
    AND d."publishedAt" IS NOT NULL
    AND d."deletedAt" IS NULL
    AND d."archivedAt" IS NULL
    AND (
      d."collectionId" = ANY(:collectionIds)
      OR um.id IS NOT NULL
      OR cm.id IS NOT NULL
    )
    AND 1 - (de.embedding <=> :queryEmbedding) > :threshold
  ORDER BY score DESC
  LIMIT :limit
`, {
  replacements: {
    queryEmbedding: pgvector.toSql(embedding),
    userId: user.id,
    teamId: user.teamId,
    modelId: env.RAG_EMBEDDING_MODEL,
    collectionIds,
    threshold: options.threshold,
    limit: options.limit
  },
  type: QueryTypes.SELECT
});
```

### 5.3 Draft Documents

- Draft documents are **excluded** from RAG search by default
- Only the document creator can search their own drafts
- This matches the existing search behavior

---

## 6. LiteLLM Integration

### 6.1 Configuration

Environment variables for LiteLLM connection:

```env
# LiteLLM/Embedding Configuration
RAG_ENABLED=true
RAG_LITELLM_BASE_URL=http://localhost:4000
RAG_LITELLM_API_KEY=sk-xxxxxxxx
RAG_EMBEDDING_MODEL=amazon.titan-embed-text-v1
RAG_EMBEDDING_DIMENSION=1536
RAG_SIMILARITY_THRESHOLD=0.7
RAG_CHUNK_SIZE=500
RAG_CHUNK_OVERLAP=50
```

### 6.2 LiteLLM Client

```typescript
interface LiteLLMEmbeddingRequest {
  model: string;
  input: string | string[];
}

interface LiteLLMEmbeddingResponse {
  data: Array<{
    embedding: number[];
    index: number;
  }>;
  model: string;
  usage: {
    prompt_tokens: number;
    total_tokens: number;
  };
}

class LiteLLMClient {
  async createEmbedding(
    input: string | string[]
  ): Promise<LiteLLMEmbeddingResponse>;
  
  async batchCreateEmbeddings(
    inputs: string[],
    batchSize?: number
  ): Promise<LiteLLMEmbeddingResponse>;
}
```

### 6.3 Batching & Error Handling

- **Batch Size**: 20 chunks per request (configurable)
- **Retry Logic**: Exponential backoff on failures
- **Queue**: Use Bull queue for embedding jobs

---

## 7. Background Processing

### 7.1 Embedding Generation Task

```typescript
class GenerateDocumentEmbeddingsTask extends BaseTask<{
  documentId: string;
  force?: boolean;
}> {
  async perform(props: { documentId: string; force?: boolean }) {
    // 1. Load document
    // 2. Check if embedding is current (version comparison)
    // 3. If current and not forced, skip
    // 4. Delete ALL existing embeddings for this document
    // 5. Chunk document content
    // 6. Generate embeddings via LiteLLM for all chunks
    // 7. Store new embeddings with current document version
  }
}
```

### 7.2 Document Change Processor

```typescript
class DocumentEmbeddingProcessor extends BaseProcessor {
  static applicableEvents = [
    "documents.create",
    "documents.update",
    "documents.publish",
    "documents.delete",
  ];

  async perform(event: Event) {
    switch (event.name) {
      case "documents.create":
      case "documents.publish":
        // Queue embedding generation
        break;
      case "documents.update":
        // Queue embedding update if content changed
        break;
      case "documents.delete":
        // Remove embeddings
        break;
    }
  }
}
```

### 7.3 Bulk Indexing Task

For initial setup or reindexing:

```typescript
class BulkIndexDocumentsTask extends BaseTask<{
  teamId: string;
  force?: boolean;
}> {
  async perform(props: { teamId: string; force?: boolean }) {
    // 1. Get all published documents for team
    // 2. Filter documents needing indexing
    // 3. Queue individual embedding tasks
    // 4. Track progress
  }
}
```

### 7.4 Model Cleanup Task

Clean up embeddings from obsolete models:

```typescript
class CleanupObsoleteEmbeddingsTask extends BaseTask<{
  teamId?: string;
}> {
  async perform(props: { teamId?: string }) {
    // 1. Get current model ID from config
    // 2. Delete embeddings where modelId != current model
    // 3. Log cleanup statistics
  }
}
```

---

## 8. File Structure

```
plugins/rag/
├── plugin.json                    # Plugin metadata
├── client/                        # (Empty for API-only)
└── server/
    ├── index.ts                   # Plugin registration
    ├── env.ts                     # RAG environment config
    ├── api/
    │   ├── index.ts               # Route registration
    │   ├── rag.ts                 # API routes (search, status, embed)
    │   └── schema.ts              # Zod validation schemas
    ├── helpers/
    │   ├── RAGSearchHelper.ts     # Core search logic
    │   ├── ChunkingHelper.ts      # Document chunking
    │   └── EmbeddingHelper.ts     # Embedding utilities
    ├── models/
    │   ├── DocumentEmbedding.ts   # Sequelize model
    │   └── index.ts               # Model exports
    ├── presenters/
    │   └── ragResult.ts           # Response formatting
    ├── processors/
    │   └── DocumentEmbeddingProcessor.ts
    ├── services/
    │   └── LiteLLMClient.ts       # Embedding API client
    └── tasks/
        ├── GenerateDocumentEmbeddingsTask.ts
        ├── BulkIndexDocumentsTask.ts
        └── CleanupOrphanedEmbeddingsTask.ts

server/migrations/
└── YYYYMMDDHHMMSS-add-document-embeddings.js  # Migration file
```

---

## 9. Error Handling

### 9.1 Error Types

| Error | HTTP Code | Description |
|-------|-----------|-------------|
| `RAGDisabledError` | 400 | RAG feature not enabled |
| `EmbeddingServiceUnavailable` | 503 | LiteLLM service unreachable |
| `EmbeddingRateLimited` | 429 | Too many embedding requests |
| `InvalidQueryError` | 400 | Query too short/long |
| `NoEmbeddingsAvailable` | 404 | No embeddings indexed yet |

### 9.2 Graceful Degradation

- If embedding service is unavailable, return error but don't break existing search
- Queue failed embedding jobs for retry
- Log all embedding failures for monitoring

---

## 14. Testing Strategy

The RAG feature is designed to be tested in isolation without modifying Outline's core codebase.

### 14.1 Integration Testing (Jest)
We will use Outline's existing Jest infrastructure. A new test file `plugins/rag/index.test.ts` will:
- **Seed Data**: Create temporary Teams, Collections, and Documents using Sequelize models.
- **Mock LiteLLM**: Use `nock` or Jest mocks to simulate embedding and completion responses.
- **Verify Permissions**: Ensure the SQL-based permission filtering correctly excludes documents from unauthorized collections.
- **Verify RRF**: Check that the hybrid search correctly merges keyword and semantic results.

### 14.2 CLI Playground
A standalone TypeScript script `plugins/rag/scripts/query.ts` will allow developers to:
- Manually trigger embedding generation for a specific document.
- Run RAG queries and see the raw context chunks being passed to the LLM.
- Debug the RRF ranking scores.

### 14.3 Manual Verification
Since the plugin registers a new API endpoint `POST /api/plugins.rag.query`, it can be tested using `curl` or Postman once the server is running, provided a valid API key is used.

---

## 15. Security Considerations

### 10.1 Data Privacy

- Embeddings are stored in the same database as documents
- No document content sent to external services except embedding generation
- LiteLLM can be self-hosted for complete data control

### 10.2 API Security

- All endpoints require authentication
- Input validation and sanitization

### 10.3 Input Validation

- Query length limits (min: 3 chars, max: 1000 chars)
- Sanitize input before embedding generation
- Validate all request parameters

---

## 11. Performance Considerations

### 11.1 Query Performance

- Use pgvector HNSW index for fast similarity search
- Limit results with threshold and limit parameters
- Cache frequently used embeddings (optional)

### 11.2 Indexing Performance

- Background task processing via Bull queue
- Batch embedding requests to reduce API calls
- Skip unchanged documents via hash comparison
- Index only published documents by default

### 11.3 Database Performance

- Regular VACUUM on embeddings table
- Monitor index performance
- Consider archiving old embedding versions

---

## 12. Monitoring & Observability

### 12.1 Metrics

- Embedding generation latency
- Search query latency
- Embedding queue depth
- Error rates by type
- Token usage for billing

### 12.2 Logging

```typescript
Logger.info("rag", `Search query processed`, {
  teamId,
  queryLength: query.length,
  resultCount: results.length,
  latencyMs,
});

Logger.info("rag", `Document embedding generated`, {
  documentId,
  chunkCount,
  tokenUsage,
  latencyMs,
});
```

---

## 13. Hybrid Search (Simple Implementation)

### 13.1 Approach

Implement basic hybrid search directly in the RAG endpoint without modifying existing code:

```typescript
// In rag.search endpoint
const [vectorResults, keywordResults] = await Promise.all([
  RAGSearchHelper.searchForUser(user, options),
  SearchHelper.searchForUser(user, { 
    query: options.query,
    limit: options.limit 
  })
]);

// Simple merge: combine and deduplicate by document ID
const mergedResults = mergeSearchResults(vectorResults, keywordResults, {
  vectorWeight: 0.7,  // Configurable
  keywordWeight: 0.3
});
```

### 13.2 Scoring Strategy

**Reciprocal Rank Fusion (RRF)** - Simple and effective:

```typescript
function mergeSearchResults(
  vectorResults: RAGSearchResult[],
  keywordResults: SearchResult[],
  weights: { vectorWeight: number; keywordWeight: number }
): MergedResult[] {
  const scores = new Map<string, number>();
  
  // RRF constant (typically 60)
  const k = 60;
  
  // Add vector scores
  vectorResults.forEach((result, rank) => {
    const rrf = 1 / (k + rank + 1);
    scores.set(result.documentId, (scores.get(result.documentId) || 0) + rrf * weights.vectorWeight);
  });
  
  // Add keyword scores
  keywordResults.forEach((result, rank) => {
    const rrf = 1 / (k + rank + 1);
    scores.set(result.document.id, (scores.get(result.document.id) || 0) + rrf * weights.keywordWeight);
  });
  
  // Sort by combined score
  return Array.from(scores.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, options.limit);
}
```

### 13.3 API Extension

Add optional hybrid mode to search schema:

```typescript
export const RAGSearchSchema = BaseSchema.extend({
  body: z.object({
    query: z.string().min(3).max(1000),
    limit: z.number().min(1).max(50).default(10),
    threshold: z.number().min(0).max(1).default(0.7),
    collectionId: z.string().uuid().optional(),
    documentId: z.string().uuid().optional(),
    includeContext: z.boolean().default(true),
    mode: z.enum(['vector', 'hybrid']).default('vector'),  // NEW
  }),
});
```

**Benefits**:
- No modification to existing SearchHelper
- Leverages existing keyword search infrastructure
- Simple to implement and test
- Easy to adjust weights based on feedback

---

## 14. Future Enhancements

### Phase 2

- [ ] Attachment content indexing
- [ ] Document metadata embeddings
- [ ] Search result explanations
- [ ] Embedding cache layer

### Phase 3

- [ ] RAG-powered AI answers
- [ ] Custom embedding fine-tuning
- [ ] Cross-collection search insights
- [ ] Search analytics dashboard

---

## 14. Dependencies

### Required Extensions

- PostgreSQL with `pgvector` extension

### New NPM Packages

```json
{
  "dependencies": {
    "pgvector": "^0.1.8"  // pgvector Sequelize support
  }
}
```

### External Services

- LiteLLM server (self-hosted or managed)
- AWS Bedrock / OpenAI (via LiteLLM)

---

## 15. Configuration Reference

| Variable | Default | Description |
|----------|---------|-------------|
| `RAG_ENABLED` | `false` | Enable RAG search feature |
| `RAG_LITELLM_BASE_URL` | - | LiteLLM server URL |
| `RAG_LITELLM_API_KEY` | - | LiteLLM API key |
| `RAG_EMBEDDING_MODEL` | `amazon.titan-embed-text-v1` | Embedding model ID |
| `RAG_EMBEDDING_DIMENSION` | `1536` | Vector dimension |
| `RAG_SIMILARITY_THRESHOLD` | `0.7` | Minimum similarity score |
| `RAG_CHUNK_SIZE` | `500` | Target chunk size (tokens) |
| `RAG_CHUNK_OVERLAP` | `50` | Chunk overlap (tokens) |
| `RAG_MAX_QUERY_LENGTH` | `1000` | Max query length |
| `RAG_BATCH_SIZE` | `20` | Embedding batch size |
