import { AMQPRouter } from './router/router';
import { Bind, ExchangeBind, QueueBind } from './types/bind';
import {
  AMQPChannel,
  AMQPMessage,
  AMQPQueue,
  AMQPConsumer,
  QueueParams,
} from '@cloudamqp/amqp-client';
import { Declarator, queue } from './types/declare';
import { AMQPRequest } from './types/request';
import { AMQPResponse, MessageStatus } from './types/response';
import { Subscription } from './types/subscription';
import { AMQPRecoveryManager } from './recoveryManager';
import { EventEmitter } from 'node:stream';

import logger from './utils/logger';

class ConsumerMessageStats {
  acked: number = 0;
  nacked: number = 0;
  replied: number = 0;
  pending: number = 0;
  received: number = 0;
}

class ConsumerStats {
  totalAcked: number = 0;
  totalNacked: number = 0;
  totalReplied: number = 0;
  totalPending: number = 0;
  totalReceived: number = 0;

  typeStats: { [key: string]: ConsumerMessageStats } = {};
}

export class AMQPRoutableConsumer extends AMQPRouter {
  _queueBinds: Set<Bind>;
  _exchangeBinds: Set<Bind>;
  _declarations: Set<Declarator>;
  _subscriptions: Set<Subscription>;

  _client?: AMQPRecoveryManager;
  _channel?: AMQPChannel;
  _queues: AMQPQueue[];
  _consumers: AMQPConsumer[];

  _emitter: EventEmitter;

  constructor(name = undefined, queueParams: QueueParams | undefined = undefined) {
    super();

    this._queueBinds = new Set<Bind>();
    this._exchangeBinds = new Set<Bind>();
    this._declarations = new Set<Declarator>();
    this._subscriptions = new Set<Subscription>();

    this._queues = [];
    this._consumers = [];

    if (!queueParams) {
      queueParams = { exclusive: false };
    }
    this.declare(queue(name, queueParams));
    this._emitter = new EventEmitter();
    this._emitter.on('consumer.connected', this.onConsumerConnected);
    this._emitter.on('consumer.configured', this.onConsumerConfigured);
  }

  public config(...args: (Bind | Declarator | Subscription)[]): this {
    for (const arg of args) {
      if (arg instanceof Bind) {
        this.bind(arg);
      } else if (arg instanceof Subscription) {
        this.subscribe(arg);
      } else {
        this.declare(arg);
      }
    }

    return this;
  }

  public bind(...binds: Bind[]): this {
    for (const bind of binds) {
      if (bind instanceof ExchangeBind) {
        this._exchangeBinds.add(bind);
      } else if (bind instanceof QueueBind) {
        this._queueBinds.add(bind);
      }
    }
    return this;
  }

  public declare(...declarations: Declarator[]): this {
    for (const declaration of declarations) {
      this._declarations.add(declaration);
    }
    return this;
  }

  public subscribe(...subscriptions: Subscription[]): this {
    for (const subscription of subscriptions) {
      this._subscriptions.add(subscription);
    }
    return this;
  }

  public attach(client: AMQPRecoveryManager): this {
    this._client = client;
    client.on('client.ready', this.onClientReady);
    return this;
  }

  private async consume(msg: AMQPMessage) {
    if (!this._channel) {
      throw new Error('cannot consume from undefined channel');
    }

    let req = new AMQPRequest(msg);
    let res = new AMQPResponse(this._channel, msg);

    return this.handle(req, res, finalResponse);

    function finalResponse(err: any = undefined) {
      if (!res.finalized) {
        res
          .sendAck()
          .then(() => {
            if (res.status != MessageStatus.OK) {
              logger.error(`Routable consumer failed to process message "${req.tag}": ${err}'`);
            }
          })
          .catch((ackErr) => {
            logger.error(`Routable consumer failed to ack message "${req.tag}": ${ackErr}`);
          });
      } else if (err) {
        logger.error(`Routable consumer failed to process message "${req.tag}": ${err}`);
      } else {
        logger.debug(`Routable Consumer: processing finished for ${req.tag}`);
      }
    }
  }

  private onClientReady = async (client: AMQPRecoveryManager) => {
    client.client
      .channel()
      .then((channel) => {
        logger.info(`[AMQP] Routable consumer connected on channel ${channel.id}`);
        this._channel = channel;
        return channel.prefetch(1000);
      })
      .then(() => {
        this._emitter.emit('consumer.connected');
        return client;
      });
  };

  private onConsumerConnected = async (consumer: AMQPRoutableConsumer) => {
    Promise.all(
      Array.from(this._declarations.values()).map((declaration) => {
        if (!this._channel) {
          return Promise.reject(new Error('AMQPRecoveryClient has an undefined channel'));
        }
        return declaration.run(this._channel);
      }, this)
    )
      .then((amqpObjects) => {
        this._queues = [];
        // I'm only expecting void or AMPQQueue types
        for (const object of amqpObjects) {
          if (object instanceof AMQPQueue) {
            logger.info(`[AMQP] Routable Consumer created queue ${object.name}`);
            this._queues.push(object);
          } else if (object) {
            logger.error(`[AMQP] Got unexpected result during declare ${object}`);
          }
        }

        if (this._queues.length < 1) {
          throw new Error('AMQPRoutableConsumer failed to create underlying queue');
        }
        return this;
      })
      .then((consumer) => {
        consumer._emitter.emit('consumer.configured', consumer);
      })
      .catch((reason) => {
        logger.error(`[AMQP] Failed to setup declarations: ${reason}`);
        throw reason;
      });
  };

  private onConsumerConfigured = async (consumer: AMQPRoutableConsumer) => {
    let promises: Promise<AMQPQueue>[] = [];
    for (const queue of this._queues) {
      for (const exchange of this._exchangeBinds) {
        logger.info(
          `[AMQP] Routable consumer binding queue ${queue.name} to exchange ${exchange.name}`
        );
        promises.push(queue.bind(exchange.name, exchange.routingKey, exchange.extraArgs));
      }
    }

    Promise.all(promises)
      .then((results) => {
        let promises: Promise<AMQPConsumer>[] = [];
        for (const queue of results) {
          if (queue instanceof AMQPQueue) {
            for (const subscription of this._subscriptions) {
              logger.info(`[AMQP] Routable consumer subscribing to queue ${queue.name}`);
              promises.push(
                queue.subscribe(
                  {
                    noAck: subscription.noAck,
                    exclusive: subscription.exclusive,
                    tag: subscription.tag,
                    args: subscription.args,
                  },
                  this.consume.bind(this)
                )
              );
            }
          }
        }
        return Promise.all(promises);
      })
      .then((consumers) => {
        this._consumers = [];
        for (const consumer of consumers) {
          if (consumer instanceof AMQPConsumer) {
            logger.info(`[AMQP] Routable consumer configured with tag ${consumer.tag}`);
            this._consumers.push(consumer);
          }
        }

        if (this._consumers.length < 1) {
          throw new Error('AMPQRoutableConsumer failed to setup consumers');
        }

        return this;
      })
      .then((consumer) => {
        consumer._emitter.emit('consumer.ready', consumer);
      });
  };

  private onConsumerReady = async (consumer: AMQPRoutableConsumer) => {
    return 0;
  };
}
