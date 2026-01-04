import { PluginManager, Hook } from "@server/utils/PluginManager";
import config from "../plugin.json";
import api from "./api";
import env from "./env";
import DocumentEmbeddingProcessor from "./processors/DocumentEmbeddingProcessor";
import GenerateDocumentEmbeddingsTask from "./tasks/GenerateDocumentEmbeddingsTask";
import BulkIndexDocumentsTask from "./tasks/BulkIndexDocumentsTask";
import CleanupObsoleteEmbeddingsTask from "./tasks/CleanupObsoleteEmbeddingsTask";

if (env.RAG_ENABLED) {
    PluginManager.add([
        {
            ...config,
            type: Hook.API,
            value: api,
        },
        {
            ...config,
            type: Hook.Processor,
            value: DocumentEmbeddingProcessor,
        },
        {
            ...config,
            type: Hook.Task,
            value: GenerateDocumentEmbeddingsTask,
        },
        {
            ...config,
            type: Hook.Task,
            value: BulkIndexDocumentsTask,
        },
        {
            ...config,
            type: Hook.Task,
            value: CleanupObsoleteEmbeddingsTask,
        },
    ]);
}
