const http = require("http");

function makePostRequest(postData) {
    return new Promise((resolve, reject) => {
        const req = http.request({
            hostname: "localhost",
            port: 3000,
            path: "/api/summarize-document",
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Content-Length": Buffer.byteLength(postData)
            }
        }, (res) => {
            let data = "";
            res.on("data", chunk => data += chunk);
            res.on("end", () => resolve({ status: res.statusCode, data: JSON.parse(data) }));
        });

        req.on("error", reject);
        req.write(postData);
        req.end();
    });
}

async function runLiveTest() {
    console.log("Testing live /api/summarize-document endpoint on localhost:3000...");

    // Test 1: Load metadata & summary for doc-sample-1
    const res1 = await makePostRequest(JSON.stringify({ fileId: "doc-sample-1" }));
    console.log("\n[Live Test 1] Summarize Document (fileId: doc-sample-1):");
    console.log("Status:", res1.status);
    console.log("File Name:", res1.data.summary.fileName);
    console.log("Word Count:", res1.data.summary.wordCount);
    console.log("Executive Summary:", res1.data.summary.executiveSummary.slice(0, 120) + "...");
    console.log("Key Takeaways:", res1.data.summary.keyTakeaways);

    // Test 2: In-Scope Q&A
    const res2 = await makePostRequest(JSON.stringify({
        fileId: "doc-sample-1",
        question: "What is NeuraNotebook RAG Architecture?"
    }));
    console.log("\n[Live Test 2] Grounded Q&A (In-Scope Question):");
    console.log("Answer:", res2.data.answer);
    console.log("Sources:", res2.data.sources);

    // Test 3: Out-of-Scope Q&A
    const res3 = await makePostRequest(JSON.stringify({
        fileId: "doc-sample-1",
        question: "Who won the World Cup in 2022?"
    }));
    console.log("\n[Live Test 3] Grounded Q&A (Out-of-Scope Question):");
    console.log("Answer:", res3.data.answer);
    console.log("Sources:", res3.data.sources);
}

runLiveTest().catch(console.error);
