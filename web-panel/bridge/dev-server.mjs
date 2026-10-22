// Dev-only demo: runs the production bridge (dist/bridge.cjs, OSC bot included) seeded with the
// fixture trainer, so the panel can be exercised without Wand. Build first: `pnpm run build`.
//
//   pnpm bridge:demo              panel on http://localhost:3223/remote/
//   pnpm bridge:demo --vrchat     also simulate VRChat on UDP 9000/9001 for the OSC bot
import { createSocket } from 'node:dgram';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import demoSession from '../fixtures/demo-session.json' with { type: 'json' };
import webContract from '../protocol/web-contract.json' with { type: 'json' };

const require = createRequire(import.meta.url);
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distDir = path.join(rootDir, 'dist');
const bridgeFile = path.join(distDir, 'bridge.cjs');
const host = process.env.HOST || webContract.defaultRemoteHost;
const port = Number(process.env.PORT || webContract.defaultRemotePort);
const simulateVrchat = process.argv.includes('--vrchat');

if (!existsSync(bridgeFile) || !existsSync(path.join(distDir, 'index.html'))) {
    console.error('dist/ is missing. Run `pnpm run build` first.');
    process.exit(1);
}

const { createBridgeRuntime } = require(bridgeFile);
const { trainerMeta, trainerValues } = structuredClone(demoSession);
const trainer = trainerMeta.trainer;
const values = trainerValues.values;
const gameTitle = process.env.DEMO_GAME || trainer.displayName;

const runtime = createBridgeRuntime({
    host,
    port,
    maxPort: port,
    panelRoot: distDir,
    oscConfigFile: path.join(tmpdir(), 'wand-osc-demo.json'),
});

runtime.sync({
    instanceId: trainerMeta.session.instanceId,
    trainerId: trainer.trainerId,
    trainerInfo: { gameId: trainer.gameId, displayName: gameTitle },
    gameVersion: trainer.gameVersion,
    metadata: {
        info: { titleId: trainer.titleId, blueprint: { cheats: trainerMeta.schema.cheats } },
    },
    values,
});
runtime.syncGameStatus({
    session: {
        state: 'running',
        event: 'game-launched',
        gameId: trainer.gameId,
        titleId: trainer.titleId,
        titleName: gameTitle,
        startedAt: new Date(Date.now() - 47 * 60 * 1000).toISOString(),
    },
    trainer: {
        state: 'running',
        event: 'trainer-started',
        trainerId: trainer.trainerId,
        displayName: gameTitle,
        gameId: trainer.gameId,
    },
});
runtime.syncInstalledApps({
    apps: [
        {
            platform: 'steam',
            sku: '1245620',
            displayName: gameTitle,
            gameId: trainer.gameId,
            titleId: trainer.titleId,
        },
    ],
});

// Stand in for Wand's renderer: accept the write and confirm it like the real trainer does.
runtime.setHandler(({ target, value }) => {
    const oldValue = values[target];
    values[target] = value;
    setTimeout(() => {
        runtime.valueChanged({
            trainerId: trainer.trainerId,
            target,
            value,
            oldValue,
            source: 'remote',
        });
    }, 30);
    return true;
});
runtime.setCommandHandler(async ({ action, gameId }) => ({ ok: true, action, gameId }));

if (simulateVrchat) {
    startVrchatSimulator();
}

const shownHost = host === webContract.defaultRemoteHost ? 'localhost' : host;
console.log(`Demo bridge on http://${shownHost}:${port}${webContract.basePath}`);

process.on('SIGINT', () => {
    runtime.close();
    process.exit(0);
});

/** Prints what the bot sends to VRChat and streams avatar parameters back like VRChat does. */
function startVrchatSimulator() {
    const vrchatIn = createSocket('udp4');
    vrchatIn.on('message', (packet) => {
        const text = readOscString(packet);
        if (text.address === '/chatbox/input') {
            console.log(`[vrchat] chatbox: ${JSON.stringify(text.firstString)}`);
        }
    });
    vrchatIn.bind(9000, '127.0.0.1');

    const vrchatOut = createSocket('udp4');
    let tick = 0;
    setInterval(() => {
        tick += 1;
        send(vrchatOut, '/avatar/parameters/VelocityX', 'f', Math.sin(tick / 3));
        if (tick % 8 === 0) {
            send(vrchatOut, '/avatar/parameters/WandGodMode', tick % 16 === 0 ? 'T' : 'F');
        }
        if (tick % 5 === 0) {
            send(vrchatOut, '/avatar/parameters/WandGameSpeed', 'f', (tick % 20) / 20);
        }
    }, 400).unref();
    console.log('Simulating VRChat: listening on 9000, sending avatar parameters to 9001.');
}

function send(socket, address, type, value) {
    const parts = [oscString(address), oscString(`,${type}`)];
    if (type === 'f') {
        const chunk = Buffer.alloc(4);
        chunk.writeFloatBE(value);
        parts.push(chunk);
    }
    socket.send(Buffer.concat(parts), 9001, '127.0.0.1');
}

function oscString(value) {
    const bytes = Buffer.from(value, 'utf8');
    const padded = Buffer.alloc((bytes.length + 4) & ~3);
    bytes.copy(padded);
    return padded;
}

function readOscString(packet) {
    const end = packet.indexOf(0);
    const address = packet.toString('utf8', 0, end);
    const tagsStart = (end + 4) & ~3;
    const tagsEnd = packet.indexOf(0, tagsStart);
    const valueStart = (tagsEnd + 4) & ~3;
    const valueEnd = packet.indexOf(0, valueStart);
    return { address, firstString: packet.toString('utf8', valueStart, valueEnd) };
}
