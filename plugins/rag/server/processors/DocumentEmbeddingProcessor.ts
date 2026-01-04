import BaseProcessor from "@server/queues/processors/BaseProcessor";
import type { Event } from "@server/types";
import GenerateDocumentEmbeddingsTask from "../tasks/GenerateDocumentEmbeddingsTask";
import env from "../env";

class DocumentEmbeddingProcessor extends BaseProcessor {
    static applicableEvents: (Event["name"] | "*")[] = [
        "documents.create",
        "documents.update",
        "documents.publish",
        "documents.delete",
    ];

    public async perform(event: Event) {
        if (!env.RAG_ENABLED) {
            return;
        }

        const task = new GenerateDocumentEmbeddingsTask();

        switch (event.name) {
            case "documents.create":
            case "documents.publish":
            case "documents.update":
                // Only queue if it's a published document
                // We'll check this inside the task or here
                await task.schedule({ documentId: event.modelId });
                break;
            case "documents.delete":
                // We could have a separate task for deletion, but for now
                // the GenerateDocumentEmbeddingsTask handles empty content by deleting.
                // Or we can just delete directly if we want.
                break;
        }
    }
}

export default DocumentEmbeddingProcessor;
