import { Inject, Injectable, Optional } from '@nestjs/common';
import { PRISMA_CLIENT } from './prisma.constants';

type PrismaClientLike = Record<string, Record<string, (args: unknown) => Promise<unknown>>>;

@Injectable()
export class PrismaService {
  constructor(
    @Optional()
    @Inject(PRISMA_CLIENT)
    private readonly client?: PrismaClientLike,
  ) {}

  async execute<T>(model: string, action: string, args: unknown): Promise<T> {
    if (!this.client) {
      throw new Error('Prisma client has not been provided');
    }

    const delegate = this.client[model];
    if (!delegate || typeof delegate[action] !== 'function') {
      throw new Error(`Prisma client is missing delegate for ${model}.${action}`);
    }

    return (await delegate[action](args)) as T;
  }
}
