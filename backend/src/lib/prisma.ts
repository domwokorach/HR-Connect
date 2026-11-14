import { Prisma, PrismaClient } from '@prisma/client';

// Money is stored as Decimal; serialise it as a JSON number for the API.
(Prisma.Decimal.prototype as unknown as { toJSON: () => number }).toJSON = function (this: Prisma.Decimal) { return this.toNumber(); };

export const prisma = new PrismaClient();
export type Tx = Prisma.TransactionClient;
export { Prisma };
