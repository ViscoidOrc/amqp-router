import { Bind, ExchangeBind, QueueBind } from './types/bind';
import { AMQPChannel, AMQPError, AMQPMessage, AMQPQueue } from '@cloudamqp/amqp-client';
import { Declarator, queue } from './types/declare';
import { AMQPRequest } from './types/request';
import { AMQPResponse, MessageStatus } from './types/response';
import { AMQPMessageBuilder } from './types/message.builder';
import { Subscription } from './types/subscription';
import { AMQPRecoveryManager } from './recoveryManager';
import { EventEmitter } from 'node:stream';

import logger from './utils/logger';
import { AMQPExchange } from './types/exchange';

export class AMQPPublisher {
  _name: string;
  _topics: string[];
  _exchangeBinds: Set<Bind>;
  _declarations: Set<Declarator>;
  _subscriptions: Set<Subscription>;

  _client?: AMQPRecoveryManager;
  _channel?: AMQPChannel;
  _exchange?: ExchangeBind;

  _emitter: EventEmitter;

  constructor(name: string) {
    this._name = name;
    this._exchangeBinds = new Set<Bind>();
    this._declarations = new Set<Declarator>();
    this._subscriptions = new Set<Subscription>();

    this._topics = [];

    this._emitter = new EventEmitter();
    this._emitter.on('publisher.connected', this.onPublisherConnected);
  }

  public config(...args: (Bind | Declarator)[]): this {
    for (const arg of args) {
      if (arg instanceof Bind) {
        this.bind(arg);
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

  public attach(client: AMQPRecoveryManager): this {
    this._client = client;
    client.on('client.ready', this.onClientReady);
    return this;
  }

  public message(): AMQPMessageBuilder {
    return new AMQPMessageBuilder(this);
  }

  public publish(message: AMQPMessageBuilder, ...topics: string[]) {
    let promises: Promise<number>[] = [];
    for (const topic of [topics, this._topics].flat()) {
      promises.push(
        this._channel!.basicPublish(
          this._exchange!.name,
          topic,
          message._body,
          message._properties,
          message._mandatory,
          message._immediate
        )
      );
    }
    return Promise.all(promises).then((responses) => {
      return 0;
    });
  }

  private onClientReady = async (client: AMQPRecoveryManager) => {
    client.client
      .channel()
      .then((channel) => {
        logger.info(`[AMQP] Publisher connected on channel ${channel.id}`);
        this._channel = channel;
        return channel.prefetch(1000);
      })
      .then(() => {
        this._emitter.emit('publisher.connected');
        return client;
      });
  };

  private onPublisherConnected = async (publisher: AMQPPublisher) => {
    Promise.all(
      Array.from(this._declarations.values()).map((declaration) => {
        if (!this._channel) {
          return Promise.reject(new Error('AMQPPublisher has an undefined channel'));
        }
        return declaration.run(this._channel);
      }, this)
    )
      .then((amqpObjects) => {
        for (const obj of amqpObjects) {
          if (obj instanceof ExchangeBind) {
            if (this._exchange) {
              throw new Error('only one exchange per publisher supported');
            }
            this._exchange = obj;
          }
        }
        // should only be exchanges if anything
        return this;
      })
      .then((publisher) => {
        if (this._exchangeBinds.size > 1) {
          throw new Error('only one exchange per publisher supported');
        }
        for (const exchange of this._exchangeBinds) {
          this._topics.push(exchange.routingKey!);
          this._exchange = exchange;
        }
        publisher._emitter.emit('publisher.ready', publisher);
      })
      .then(() => {
        if (!this._exchange) {
          throw new Error('Failed to configure exchange');
        }
        logger.info(`[AMQP] Publisher bound to exchange ${this._exchange.name}`);
      })
      .catch((reason) => {
        logger.error(`[AMQP] Failed to setup declarations: ${reason}`);
        throw reason;
      });
  };
}
