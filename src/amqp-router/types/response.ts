import { AMQPChannel, AMQPError, AMQPMessage, AMQPProperties, Field } from '@cloudamqp/amqp-client';
import { AMQPMessageBuilder } from './message.builder';

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

export class AMQPResponse extends AMQPMessageBuilder {
  _tag: number;

  _serverResponse: ResponseMethod = ResponseMethod.ACK;
  _requeue: boolean = false;
  _ackMultiple: boolean = false;

  _exchange: string;
  _channel: AMQPChannel;

  constructor(channel: AMQPChannel, msg: AMQPMessage) {
    super();
    this._channel = channel;
    this._exchange = msg.exchange;
    this._tag = msg.deliveryTag;
  }

  public ack(multiple: boolean = false): this {
    this._serverResponse = ResponseMethod.ACK;
    this._ackMultiple = multiple;
    return this;
  }

  public nack(requeue: boolean = false, multiple: boolean = false): this {
    this._serverResponse = ResponseMethod.NACK;
    this._requeue = requeue;
    this._ackMultiple = multiple;
    return this;
  }

  public reject(requeue: boolean = false, multiple: boolean = false): this {
    this._serverResponse = ResponseMethod.REJECT;
    this._requeue = requeue;
    this._ackMultiple = multiple;
    return this;
  }

  public exchange(exchange: string) {
    this._exchange = exchange;
    return this;
  }
  // ---------------
  // Below here are functions that trigger network activity
  public sendAck(): Promise<void> {
    this.finalized = true;
    switch (this._serverResponse) {
      case ResponseMethod.ACK:
        return this._channel.basicAck(this._tag, this._ackMultiple);

      case ResponseMethod.NACK:
        this.status = MessageStatus.ERROR;
        return this._channel.basicNack(this._tag, this._requeue, this._ackMultiple);

      case ResponseMethod.REJECT:
        this.status = MessageStatus.ERROR;
        return this._channel.basicReject(this._tag, this._requeue);
    }
  }

  public publish(...topics: string[]) {
    let promises: Promise<number>[] = [];
    for (const topic of topics) {
      promises.push(
        this._channel!.basicPublish(
          this._exchange!,
          topic,
          this._body,
          this._properties,
          this._mandatory,
          this._immediate
        )
      );
    }
    return Promise.all(promises).then((responses) => {
      return 0;
    });
  }
}
