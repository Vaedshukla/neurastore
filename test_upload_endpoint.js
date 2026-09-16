const http = require("http");
const fs = require("fs");
const path = require("path");

function uploadFileTest() {
    return new Promise((resolve, reject) => {
        const boundary = "--------------------------" + Date.now().toString(16);
        const content = "Test document content for fast upload validation.\nLine 2 of test document.";
        
        let body = "";
        body += `--${boundary}\r\n`;
        body += `Content-Disposition: form-data; name="file"; filename="upload_test_doc.txt"\r\n`;
        body += `Content-Type: text/plain\r\n\r\n`;
        body += content;
        body += `\r\n--${boundary}--\r\n`;

        const req = http.request({
            hostname: "localhost",
            port: 3000,
            path: "/api/upload",
            method: "POST",
            headers: {
                "Content-Type": `multipart/form-data; boundary=${boundary}`,
                "Content-Length": Buffer.byteLength(body)
            }
        }, (res) => {
            let data = "";
            res.on("data", chunk => data += chunk);
            res.on("end", () => resolve({ status: res.statusCode, data: JSON.parse(data) }));
        });

        req.on("error", reject);
        req.write(body);
        req.end();
    });
}

async function runUploadTest() {
    console.log("Testing live /api/upload endpoint on localhost:3000...");
    const start = Date.now();
    const res = await uploadFileTest();
    const duration = Date.now() - start;

    console.log("\n[Upload Test Result]:");
    console.log("Status:", res.status);
    console.log("Success:", res.data.success);
    console.log("File Name:", res.data.metadata.name);
    console.log("Public URL:", res.data.publicUrl);
    console.log("Category:", res.data.category);
    console.log(`Speed: Upload completed in ${duration} ms`);
}

runUploadTest().catch(console.error);
