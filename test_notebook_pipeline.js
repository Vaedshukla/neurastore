const assert = require("assert");

// Test document text
const sampleDocText = `
NeuraStore+ Architecture and Specification Document

Section 1: Executive Overview
NeuraStore+ is an intelligent multi-modal storage system designed for modern cloud architectures. It automatically categorizes uploaded files including images, videos, documents, and code. Furthermore, NeuraStore+ features an automated JSON processing engine that determines whether incoming JSON data should be stored in structured SQL tables or NoSQL document collections.

Section 2: Intelligent Storage Pipeline
When a user uploads a JSON file, NeuraStore+ evaluates the schema depth and field consistency. If the dataset contains tabular data with low nesting depth (3 levels or fewer), NeuraStore+ automatically creates PostgreSQL tables in Supabase and normalizes sub-objects into related child tables with foreign keys.

Section 3: NeuraNotebook Document Intelligence
NeuraNotebook transforms static documents into interactive AI-powered workspaces. Users can generate executive summaries, key takeaways, topic breakdowns, and ask grounded questions. All generated answers strictly reference indexed text chunks from the original document.

Section 4: Conclusion & Deployment
NeuraStore+ is deployed using Next.js App Router and Supabase serverless Edge Functions. It provides 100% client-side privacy compliance and zero vendor lock-in.
`;

// Helper chunking function to test
function chunkText(text, chunkSize = 300) {
    const paragraphs = text.split(/\n\n+/);
    const chunks = [];
    let currentChunk = "";
    let chunkIndex = 1;

    for (const para of paragraphs) {
        const trimmed = para.trim();
        if (!trimmed) continue;

        if ((currentChunk + "\n\n" + trimmed).length > chunkSize && currentChunk.length > 0) {
            chunks.push({ chunkIndex: chunkIndex++, text: currentChunk.trim() });
            currentChunk = trimmed;
        } else {
            currentChunk = currentChunk ? currentChunk + "\n\n" + trimmed : trimmed;
        }
    }

    if (currentChunk.trim().length > 0) {
        chunks.push({ chunkIndex: chunkIndex++, text: currentChunk.trim() });
    }

    return chunks;
}

// Helper lexical relevance chunk finder
function findRelevantChunks(chunks, question, topK = 3) {
    const stopWords = new Set(["the", "and", "is", "in", "to", "of", "for", "with", "on", "at", "from", "by", "an", "be", "this", "that", "are", "was", "as", "it", "or", "what", "where", "how", "why", "who", "which"]);
    const qWords = question.toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter(w => w.length > 2 && !stopWords.has(w));

    if (qWords.length === 0) return chunks.slice(0, topK).map(chunk => ({ chunk, score: 1 }));

    const scored = chunks.map(chunk => {
        const cText = chunk.text.toLowerCase();
        let score = 0;
        qWords.forEach(word => {
            if (cText.includes(word)) score += 1;
        });
        return { chunk, score };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK);
}

// Grounded Q&A simulation
function answerQuestionGrounded(question, text) {
    const chunks = chunkText(text, 300);
    const topScored = findRelevantChunks(chunks, question, 2);
    const maxScore = topScored.length > 0 ? topScored[0].score : 0;

    if (maxScore === 0) {
        return {
            answer: "I couldn't find the answer in this document.",
            sources: []
        };
    }

    const relevantChunks = topScored.filter(s => s.score > 0);
    const sources = relevantChunks.map(item => ({
        chunkIndex: item.chunk.chunkIndex,
        snippet: item.chunk.text.slice(0, 100) + "..."
    }));

    return {
        answer: relevantChunks[0].chunk.text,
        sources
    };
}

console.log("==========================================");
console.log("RUNNING NEURANOTEBOOK VERIFICATION TESTS");
console.log("==========================================");

// Test 1: Chunking
console.log("\n[Test 1] Document Chunking...");
const chunks = chunkText(sampleDocText, 300);
assert(chunks.length > 1, "Document should be divided into multiple indexed chunks");
console.log(`✓ Passed: Generated ${chunks.length} chunks successfully.`);

// Test 2: Grounded Answer for Valid Question
console.log("\n[Test 2] Grounded Q&A - In-Scope Question...");
const inScopeQ = "How does NeuraStore process JSON files?";
const res1 = answerQuestionGrounded(inScopeQ, sampleDocText);
assert(res1.sources.length > 0, "In-scope question must return source citations");
assert(!res1.answer.includes("couldn't find"), "In-scope question must provide grounded answer");
console.log(`✓ Passed: Received grounded answer with Chunk ${res1.sources[0].chunkIndex} citation.`);

// Test 3: Grounded Answer for Out-of-Scope Question
console.log("\n[Test 3] Grounded Q&A - Out-of-Scope Question...");
const outOfScopeQ = "What is the capital city of France?";
const res2 = answerQuestionGrounded(outOfScopeQ, sampleDocText);
assert.strictEqual(res2.sources.length, 0, "Out-of-scope question must have 0 sources");
assert(res2.answer.includes("couldn't find"), "Out-of-scope question must explicitly refuse to hallucinate");
console.log(`✓ Passed: Correctly responded with: "${res2.answer}"`);

console.log("\n==========================================");
console.log("ALL NEURANOTEBOOK PIPELINE TESTS PASSED!");
console.log("==========================================");
