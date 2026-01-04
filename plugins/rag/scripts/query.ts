require("../../../server/scripts/bootstrap");
const yargs = require("yargs");
const { hideBin } = require("yargs/helpers");
const { User, Document: OutlineDocument } = require("../../../server/models/index");
const HybridSearchHelper = require("../server/helpers/HybridSearchHelper").default;
const GenerateDocumentEmbeddingsTask = require("../server/tasks/GenerateDocumentEmbeddingsTask").default;

async function main() {
    const argv = await yargs(hideBin(process.argv))
        .option("query", {
            alias: "q",
            type: "string",
            description: "Search query",
        })
        .option("embed", {
            alias: "e",
            type: "string",
            description: "Document ID to embed",
        })
        .option("user", {
            alias: "u",
            type: "string",
            description: "User ID to search as",
        })
        .option("mode", {
            alias: "m",
            type: "string",
            choices: ["vector", "hybrid"],
            default: "hybrid",
        })
        .help().argv;

    if (argv.embed) {
        console.log(`Embedding document ${argv.embed}...`);
        const task = new GenerateDocumentEmbeddingsTask();
        await task.perform({ documentId: argv.embed, force: true });
        console.log("Done.");
        return;
    }

    if (argv.query) {
        if (!argv.user) {
            console.error("Error: --user <userId> is required for search");
            process.exit(1);
        }

        const user = await User.findByPk(argv.user);
        if (!user) {
            console.error(`Error: User ${argv.user} not found`);
            process.exit(1);
        }

        console.log(`Searching for: "${argv.query}" (mode: ${argv.mode}) as user ${user.name}...`);
        const results = await HybridSearchHelper.searchForUser(user, {
            query: argv.query,
            mode: argv.mode as any,
        });

        console.log("\nResults:");
        results.forEach((r: any, i: number) => {
        });
        return;
    }

    yargs.showHelp();
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
