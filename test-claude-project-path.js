const { spawn } = require("child_process");

// Test Claude CLI with project path handling
function testClaudeProjectPath(projectPath, taskPrompt) {
    return new Promise((resolve, reject) => {
        console.log(`Testing Claude CLI with project path: ${projectPath}`);
        
        const proc = spawn("/opt/homebrew/bin/claude", ["--print", "--model", "sonnet"], {
            stdio: ["pipe", "pipe", "pipe"],
            cwd: projectPath // Set working directory
        });
        
        let output = '';
        let errorOutput = '';
        
        proc.stdout.on("data", d => {
            const chunk = d.toString();
            output += chunk;
            console.log("OUT:", chunk.substring(0, 100) + (chunk.length > 100 ? '...' : ''));
        });
        
        proc.stderr.on("data", d => {
            const chunk = d.toString();
            errorOutput += chunk;
            console.log("ERR:", chunk);
        });
        
        proc.on("close", code => {
            console.log(`Exit code: ${code}`);
            console.log(`Output length: ${output.length}`);
            if (code === 0) {
                resolve({ success: true, output, code });
            } else {
                reject({ success: false, error: errorOutput, code, output });
            }
        });
        
        proc.on("error", err => {
            console.error("Process error:", err);
            reject({ success: false, error: err.message });
        });
        
        // Send the task prompt
        const prompt = `Execute this task in project "EffectLabs" at ${projectPath}:

TASK: Initialize project structure and package.json
Set up basic directory structure and initialize package.json with project metadata.

Please change to the project directory and complete this task. Report what you accomplished.`;
        
        console.log("Sending prompt...");
        proc.stdin.write(prompt + '\n');
        proc.stdin.end();
        
        // Timeout after 30 seconds
        setTimeout(() => {
            console.log("TIMEOUT - killing process");
            proc.kill();
            reject({ success: false, error: "Timeout after 30 seconds" });
        }, 30000);
    });
}

// Test the exact scenario
const effectLabsPath = "/Users/karipikkarainen/Devel/EffectLabs";

testClaudeProjectPath(effectLabsPath)
    .then(result => {
        console.log("✅ SUCCESS!");
        console.log("Claude output preview:", result.output.substring(0, 500));
    })
    .catch(error => {
        console.log("❌ FAILED!");
        console.error("Error:", error.error);
        if (error.output) {
            console.log("Partial output:", error.output);
        }
    });