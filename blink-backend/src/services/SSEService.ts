/**
 * ============================================================================
 * SERVER-SENT EVENTS (SSE) HUB SERVICE
 * ============================================================================
 * Enterprise real-time event hub.
 * 
 * Key Features:
 * - O(1) client lookup and memory management via Set<Response>.
 * - TCP Keep-Alive Engine (30s comments) preventing proxy/ALB connection drops.
 * - Auto-pruning on socket disconnects to prevent server memory leaks.
 * - Strict BOLA Isolation: Events strictly routed to target user ID.
 * ============================================================================
 */

import { Response } from 'express';

class SSEService {
    private clients: Map<string, Set<Response>> = new Map();

    constructor() {
        setInterval(() => {
            this.clients.forEach((userClients) => {
                userClients.forEach((res) => {
                    res.write(':\n\n'); 
                    if (typeof (res as any).flush === 'function') (res as any).flush();
                });
            });
        }, 30000); 
    }

    public addClient(userId: string | number, res: Response) {
        const uid = String(userId);
        if (!this.clients.has(uid)) this.clients.set(uid, new Set());
        
        this.clients.get(uid)?.add(res);
        console.log(`[SSE STRICT TELEMETRY] REGISTERED: User [${uid}] connected. Active tabs: ${this.clients.get(uid)?.size}`);

        res.on('close', () => this.removeClient(uid, res));
    }

    private removeClient(userId: string | number, res: Response) {
        const uid = String(userId);
        const userClients = this.clients.get(uid);
        if (userClients) {
            userClients.delete(res);
            if (userClients.size === 0) this.clients.delete(uid);
            console.log(`[SSE STRICT TELEMETRY] DISCONNECTED: User [${uid}] dropped.`);
        }
    }

    public emitToUser(userId: string | number, eventName: string, payload: any) {
        const uid = String(userId);
        const userClients = this.clients.get(uid);
        
        if (userClients && userClients.size > 0) {
            const padding = ': ' + ' '.repeat(4096) + '\n\n';
            const dataString = `event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n${padding}`;
            
            userClients.forEach((res) => {
                res.write(dataString);
                if (typeof (res as any).flush === 'function') (res as any).flush();
            });
            console.log(`[SSE STRICT TELEMETRY] ⚡ SUCCESS: Sent [${eventName}] to User [${uid}]`);
        } else {
            console.log(`[SSE STRICT TELEMETRY] 👻 GHOST EMIT: Sweeper tried to send [${eventName}] to User [${uid}], but Map is empty.`);
        }
    }
}

export const sseService = new SSEService();