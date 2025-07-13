const { spawn } = require("child_process"); 
const proc = spawn("/opt/homebrew/bin/claude", ["--print", "--model", "sonnet"], {stdio: ["pipe", "pipe", "pipe"]});
proc.stdin.write("Generate 2 tasks as JSON array\n");
proc.stdin.end();
proc.stdout.on("data", d => console.log("OUT:", d.toString()));
proc.stderr.on("data", d => console.log("ERR:", d.toString()));
proc.on("close", code => { console.log("CODE:", code); process.exit(0); });
setTimeout(() => { console.log("TIMEOUT"); proc.kill(); process.exit(1); }, 15000);
