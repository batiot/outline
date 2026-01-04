import env from "../env";

interface DocumentChunk {
    chunkText: string;
    chunkIndex: number;
    startOffset: number;
    endOffset: number;
}

class ChunkingHelper {
    /**
     * Splits text into chunks of approximately RAG_CHUNK_SIZE characters
     * with RAG_CHUNK_OVERLAP overlap.
     * 
     * @param text The text to chunk
     * @returns Array of chunks
     */
    public static chunkText(text: string): DocumentChunk[] {
        const chunkSize = env.RAG_CHUNK_SIZE;
        const overlap = env.RAG_CHUNK_OVERLAP;
        const chunks: DocumentChunk[] = [];

        if (!text || text.length < 50) {
            return [];
        }

        let start = 0;
        let index = 0;

        while (start < text.length) {
            let end = start + chunkSize;

            // If not at the end, try to find a good break point (newline or space)
            if (end < text.length) {
                const nextNewline = text.indexOf("\n", end - 50);
                if (nextNewline !== -1 && nextNewline < end + 50) {
                    end = nextNewline + 1;
                } else {
                    const nextSpace = text.indexOf(" ", end - 20);
                    if (nextSpace !== -1 && nextSpace < end + 20) {
                        end = nextSpace + 1;
                    }
                }
            } else {
                end = text.length;
            }

            const chunkText = text.substring(start, end).trim();

            if (chunkText.length >= 50) {
                chunks.push({
                    chunkText,
                    chunkIndex: index++,
                    startOffset: start,
                    endOffset: end,
                });
            }

            start = end - overlap;
            if (start >= text.length || end === text.length) {
                break;
            }
        }

        return chunks;
    }
}

export default ChunkingHelper;
