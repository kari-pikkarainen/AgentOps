const express = require('express');
const path = require('path');
const WebSocket = require('ws');
const http = require('http');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// Basic route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// WebSocket connection for real-time updates
wss.on('connection', (ws) => {
    console.log('Client connected');
    
    ws.on('message', (message) => {
        console.log('Received:', message.toString());
        
        // Echo message back for now
        ws.send(JSON.stringify({
            type: 'response',
            data: `Server received: ${message}`
        }));
    });
    
    ws.on('close', () => {
        console.log('Client disconnected');
    });
    
    // Send welcome message
    ws.send(JSON.stringify({
        type: 'welcome',
        data: 'Connected to Claude Code Monitor'
    }));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Claude Code Monitor running on http://localhost:${PORT}`);
    console.log('Press Ctrl+C to stop the server');
});