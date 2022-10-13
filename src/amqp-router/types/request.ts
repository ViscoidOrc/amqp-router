import { AMQPMessage } from '@cloudamqp/amqp-client';

export class AMQPRequest {
  amqpMessage: AMQPMessage;
  tag: number;
  [key: string]: any;

  constructor(message: AMQPMessage) {
    this.amqpMessage = message;
    this.tag = message.deliveryTag;
  }
}
