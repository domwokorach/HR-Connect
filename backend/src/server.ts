import { config } from './config';
import { createApp } from './app';
import { prisma } from './lib/prisma';

const app = createApp();
const server = app.listen(config.PORT, '0.0.0.0', () => console.log(`HR Connect API listening on :${config.PORT} (${config.NODE_ENV})`));

for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => server.close(async () => { await prisma.$disconnect(); process.exit(0); }));
