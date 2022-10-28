import {
  AMQPChannel,
  AMQPClient,
  AMQPConsumer,
  AMQPError,
  AMQPQueue,
} from '@cloudamqp/amqp-client';
import { EventEmitter } from 'node:events';

import { promiseRetry } from './utils/retry';
import { Declarator } from './types/declare';

import logger from './utils/logger';
import { AMQPRoutableConsumer } from './consumer';
import { AMQPPublisher } from './publisher';
import { AMQPRecoverableClient } from './client';
import { resolve } from 'node:path';

// TODO: to make this more generally robust
// integrate support for pulling events from
// https://github.com/rabbitmq/rabbitmq-event-exchange
export class AMQPRecoveryManager<
  ChannelT extends AMQPChannel = AMQPChannel,
  ClientT extends AMQPRecoverableClient<ChannelT> = AMQPRecoverableClient<ChannelT>
> extends EventEmitter {
  retryMax: number;
  client: ClientT;
  _channel: ChannelT | undefined;
  _declarations: Declarator[];
  _consumers: AMQPRoutableConsumer[];
  _publishers: Map<string, AMQPPublisher>;

  constructor(client: ClientT, retryMax = 5) {
    super();

    this.retryMax = retryMax;
    this._declarations = [];

    this.client = client;

    this.client.onerror = (error: AMQPError) => {
      //logger.error(`onerror [AMQP] ${error}`);
      this.emit('client.disconnected');
    };

    this.on('client.connected', this.onconnected);
    this._consumers = [];
    this._publishers = new Map();
  }

  public async channel(): Promise<ChannelT> {
    return this.channel();
  }
  public async connect(): Promise<this> {
    try {
      await promiseRetry(() => {
        return this.client.connect();
      }, this.retryMax);

      this.retry();
    } catch (error) {
      if (error instanceof AMQPError) {
        logger.error(`${error}`);
        await new Promise((resolve) => setTimeout(resolve, 3000));
        return this.connect();
      } else {
        throw error;
      }
    }

    return this.client.channel().then((channel) => {
      this._channel = channel;
      this.emit('client.connected', this);
      return this;
    });
  }

  public shutdown(): Promise<void> {
    logger.info('[AMQP] Shutting down connection');
    this.cancel();
    if (this.listenerCount('client.disconnected') > 0) {
      logger.error('[AMQP] entering shutdown with active disconnect listeners');
    }
    return this.client.close('client shutdown');
  }

  public retry(): void {
    this.once('client.disconnected', this.connect);
  }

  public cancel(): void {
    this.off('client.disconnected', this.ondisconnected);
    this.off('client.disconnected', this.connect);
  }

  public declare(object: Declarator): this {
    this._declarations.push(object);
    return this;
  }

  public config(object: Declarator): this {
    this.declare(object);

    return this;
  }

  public attach(friend: AMQPRoutableConsumer | AMQPPublisher): this {
    if (friend instanceof AMQPRoutableConsumer) {
      if (this._consumers.indexOf(friend) !== -1) {
        throw new Error('Consumer attached multiple times to client');
      }

      this._consumers.push(friend);
    } else if (friend instanceof AMQPPublisher) {
      this._publishers.set(friend._name, friend);
    }
    friend.attach(this);
    return this;
  }

  public publisher(named: string): AMQPPublisher {
    let pub = this._publishers.get(named);
    if (!pub) {
      throw new Error(`unknown publisher: ${named}`);
    }
    return pub;
  }

  ondisconnected = () => {
    setTimeout(() => {
      return this.connect();
    }, 3000);
  };

  onconnected = () => {
    logger.info('[AMQP] Setting up declarations');
    if (this._channel) {
      Promise.all(
        this._declarations.map((value) => {
          if (!this._channel) {
            return Promise.reject(
              new AMQPError('AMQPRecoveryClient has an undefined channel', this.client)
            );
          }
          return value.run(this._channel);
        }, this)
      )
        .then((value) => {
          this.emit('client.ready', this);
          return this;
        })
        .catch((reason) => {
          logger.error(`[AMQP] Failed to setup declarations: ${reason}`);
          throw reason;
        });
    }
  };
}

/*

client.connect()
channel = client.channel()
channel can
  exchangeDeclare(...)
    params
      autoDelete (autodelete when last binding is deleted)
      durable (survives restarts)
      internal (clients can't publish)
      passive (true == error if doesn't exist)

queue = channel.queue()
  queue.bind(exchange)

consumer = queue.subscribe()
  subscribe takes queue options like
    noAck
    exclusive
    tag

*/
