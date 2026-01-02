// Structured logging utility
interface LogEntry {
    level: 'info' | 'warn' | 'error';
    message: string;
    timestamp: string;
    context?: Record<string, any>;
}

export function log(level: LogEntry['level'], message: string, context?: Record<string, any>) {
    const entry: LogEntry = {
        level,
        message,
        timestamp: new Date().toISOString(),
        context
    };

    // Log to console
    console.log(JSON.stringify(entry));

    // Also log to file for server manager
    try {
        const fs = require('fs');
        const logMessage = `${new Date().toISOString()} [${level.toUpperCase()}] ${message}${context ? ' ' + JSON.stringify(context) : ''}\n`;
        fs.appendFileSync('server.log', logMessage);
    } catch (err) {
        // Ignore file logging errors
    }
}
