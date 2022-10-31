import { AMQPChannel, AMQPQueue, ExchangeParams, QueueParams } from '@cloudamqp/amqp-client';
import logger from '../utils/logger';
import { AMQPExchange } from './exchange';

export type ExtraArgsT = { [key: string]: string };

export interface Declarator {
  run(channel: AMQPChannel): Promise<any>;
}

class QueueDeclarator implements Declarator {
  name?: string;
  namedParams?: QueueParams;
  extraArgs?: ExtraArgsT;

  constructor(name?: string, namedParams?: QueueParams, extraArgs?: ExtraArgsT) {
    this.name = name;
    this.namedParams = namedParams;
    this.extraArgs = extraArgs;
  }

  public run(channel: AMQPChannel): Promise<AMQPQueue> {
    return channel.queue(this.name, this.namedParams, this.extraArgs);
  }
}

class ExchangeDeclarator implements Declarator {
  name: string;
  type: string;
  namedParams?: ExchangeParams;
  extraArgs?: ExtraArgsT;

  public constructor(
    name: string,
    type: string,
    namedParams?: ExchangeParams,
    extraArgs?: ExtraArgsT
  ) {
    this.name = name;
    this.type = type;
    this.namedParams = namedParams;
    this.extraArgs = extraArgs;
  }

  public run(channel: AMQPChannel): Promise<AMQPExchange> {
    logger.info(`[AMQP] Declaring exchange ${this.name}`);
    return channel
      .exchangeDeclare(this.name, this.type, this.namedParams, this.extraArgs)
      .then(() => {
        return new AMQPExchange(this.name, this.type, this.namedParams, this.extraArgs);
      });
  }
}

export function exchange({
  name,
  type,
  namedParameters,
  args,
}: {
  name: string;
  type: string;
  namedParameters?: ExchangeParams;
  args?: ExtraArgsT;
}): Declarator {
  return new ExchangeDeclarator(name, type, namedParameters, args);
}

export function queue(
  name?: string,
  __namedParameters?: QueueParams,
  args?: ExtraArgsT
): Declarator {
  return new QueueDeclarator(name, __namedParameters, args);
}

export default {
  exchange,
  queue,
};
