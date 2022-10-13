import { AMQPChannel, AMQPError, AMQPMessage, AMQPProperties, Field } from '@cloudamqp/amqp-client';
import { AMQPPublisher } from '../publisher';

export enum AMQPDeliveryMode {
  NON_PERSISTENT = 1,
  PERSISTENT = 2,
}

enum ResponseMethod {
  ACK = 1,
  NACK = 2,
  REJECT = 3,
}

export enum MessageStatus {
  OK = 'OK',
  ERROR = 'ERROR',
}

export type BodyType = null | string | ArrayBuffer | Buffer | Uint8Array;

export class AMQPMessageBuilder {
  _publisher: AMQPPublisher | undefined;
  _properties: AMQPProperties;
  _body: BodyType = null;

  _mandatory: boolean = false;
  _immediate: boolean = false;
  finalized: boolean = false;
  status: MessageStatus = MessageStatus.OK;

  constructor(publisher?: AMQPPublisher) {
    this._publisher = publisher;
    this._properties = {};
  }

  public mandatory(mandatory: boolean) {
    this._mandatory = mandatory;
    return this;
  }

  public immediate(immediate: boolean) {
    this._immediate = immediate;
    return this;
  }

  public body(body: BodyType): this {
    this._body = body;
    return this;
  }

  public contentType(type: string): this {
    this._properties.contentType = type;
    return this;
  }

  public contentEncoding(encoding: string): this {
    this._properties.contentEncoding = encoding;
    return this;
  }

  public deliveryMode(mode: AMQPDeliveryMode): this {
    this._properties.deliveryMode = mode;
    return this;
  }

  public priority(priority: number): this {
    this._properties.priority = priority;
    return this;
  }

  public correlationId(id: string): this {
    this._properties.correlationId = id;
    return this;
  }

  public replyTo(topic: string): this {
    this._properties.replyTo = topic;
    return this;
  }

  public expiration(ttl: number): this {
    this._properties.expiration = ttl.toString();
    return this;
  }

  public messageId(messageId: string): this {
    this._properties.messageId = messageId;
    return this;
  }

  public timestamp(time: Date | undefined = undefined): this {
    if (!time) {
      time = new Date();
    }
    this._properties.timestamp = time;
    return this;
  }

  public type(type: string): this {
    this._properties.type = type;
    return this;
  }

  public userId(userId: string): this {
    this._properties.userId = userId;
    return this;
  }

  public appId(appId: string): this {
    this._properties.appId = appId;
    return this;
  }

  public set(headerName: string, value: Field): this {
    if (!this._properties.headers) {
      this._properties.headers = {};
    }
    this._properties.headers[headerName] = value;
    return this;
  }

  // ---------------
  // Below here are functions that trigger network activity
  public publish(...topics: string[]): Promise<number> {
    if (this._publisher) {
      return this._publisher.publish(this, ...topics);
    }

    throw new Error(
      'Cannot publish directly from disconnected builder. use publisher.publish(message) instead.'
    );
  }
}
