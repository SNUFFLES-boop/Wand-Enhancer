// @vitest-environment node
import { createSocket, type Socket } from 'node:dgram';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { WebSocket as NodeWebSocket } from 'ws';

import { createDefaultOscConfig } from '../../../protocol/osc';
import { decodePacket, encodeMessage, type OscMessage } from './osc-codec';

describe('production bridge OSC bot', () => {
    it('drives the trainer from real UDP packets and talks to VRChat', async () => {
        const bridge = require('../../../dist/bridge.cjs');
        const directory = mkdtempSync(join(tmpdir(), 'wand-osc-'));
        const configFile = join(directory, 'osc.json');
        const port = await getFreeTcpPort();
        const listenPort = await getFreeUdpPort();
        const vrchat = await bindReceiver();
        const runtime = bridge.createBridgeRuntime({
            host: '127.0.0.1',
            port,
            maxPort: port,
            oscConfigFile: configFile,
        });
        const writes: unknown[] = [];
        runtime.setHandler((request: unknown) => {
            writes.push(request);
            return true;
        });
        runtime.sync(rawTrainerSnapshot());
        const sender = createSocket('udp4');
        let socket: NodeWebSocket | null = null;

        try {
            // Connect only once the bridge listens, or the upgrade races the server start.
            await waitFor(() => runtime.listening);
            socket = new NodeWebSocket(`ws://127.0.0.1:${port}/remote/ws`);
            await new Promise((resolve, reject) => {
                socket?.once('open', resolve);
                socket?.once('error', reject);
            });
            const incoming: any[] = [];
            socket.on('message', (raw) => incoming.push(JSON.parse(String(raw))));
            socket.send(
                envelope('hello', {
                    client: 'mobile-web',
                    clientVersion: 'test',
                    capabilities: { supportsDeltaValues: true, supportsTrainerSwitch: true },
                }),
            );
            socket.send(
                envelope('osc_config', {
                    config: {
                        ...createDefaultOscConfig(),
                        enabled: true,
                        listenPort,
                        targets: [
                            {
                                id: 'vrc',
                                name: 'VRChat',
                                host: '127.0.0.1',
                                port: vrchat.port,
                                enabled: true,
                                chatbox: true,
                                state: true,
                                bindings: false,
                            },
                        ],
                    },
                }),
            );

            await waitFor(() =>
                incoming.some(
                    (message) =>
                        message.type === 'osc_status' &&
                        message.payload.status.state === 'listening',
                ),
            );
            await waitFor(() =>
                vrchat.messages.some((message) => message.address === '/chatbox/input'),
            );
            const chatbox = vrchat.messages.find((message) => message.address === '/chatbox/input');
            expect(chatbox?.args[0].value).toContain('Game');

            sender.send(
                encodeMessage('/wand/cheat/god', [{ type: 'i', value: 0 }]),
                listenPort,
                '127.0.0.1',
            );
            await waitFor(() => writes.length > 0);
            expect(writes[0]).toMatchObject({ trainerId: 'trainer', target: 'god', value: false });
            await waitFor(() => incoming.some((message) => message.type === 'osc_activity'));

            expect(JSON.parse(readFileSync(configFile, 'utf8')).listenPort).toBe(listenPort);
        } finally {
            socket?.close();
            sender.close();
            vrchat.socket.close();
            runtime.close();
            rmSync(directory, { recursive: true, force: true });
        }
    });
});

function envelope(type: string, payload: unknown) {
    return JSON.stringify({ type, version: 1, requestId: `${type}-1`, payload });
}

async function bindReceiver(): Promise<{ socket: Socket; port: number; messages: OscMessage[] }> {
    const socket = createSocket('udp4');
    const messages: OscMessage[] = [];
    socket.on('message', (packet) => messages.push(...decodePacket(packet)));
    await new Promise<void>((resolve) => socket.bind(0, '127.0.0.1', resolve));
    return { socket, port: socket.address().port, messages };
}

async function getFreeUdpPort(): Promise<number> {
    const socket = createSocket('udp4');
    await new Promise<void>((resolve) => socket.bind(0, '127.0.0.1', resolve));
    const { port } = socket.address();
    await new Promise<void>((resolve) => socket.close(() => resolve()));
    return port;
}

async function getFreeTcpPort(): Promise<number> {
    return await new Promise((resolve, reject) => {
        const server = createServer();
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => {
            const address = server.address();
            const port = typeof address === 'object' && address ? address.port : 0;
            server.close((error) => (error ? reject(error) : resolve(port)));
        });
    });
}

async function waitFor(predicate: () => boolean): Promise<void> {
    const deadline = Date.now() + 4000;
    while (!predicate()) {
        if (Date.now() > deadline) throw new Error('Timed out waiting for the OSC bot.');
        await new Promise((resolve) => setTimeout(resolve, 10));
    }
}

function rawTrainerSnapshot() {
    return {
        instanceId: 'instance',
        trainerId: 'trainer',
        trainerInfo: { gameId: 'game', displayName: 'Game' },
        metadata: {
            info: {
                blueprint: {
                    cheats: [
                        {
                            uuid: 'god',
                            target: 'god',
                            type: 'toggle',
                            name: 'God mode',
                            category: 'player',
                            args: {},
                        },
                    ],
                },
            },
        },
        values: { god: 1 },
    };
}
