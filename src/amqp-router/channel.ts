import { AMQPChannel } from '@cloudamqp/amqp-client';
import { IRecoverableClient } from './types/client.interface';

export type ChannelConstructorT<T> = new (client: IRecoverableClient, id: number) => T;

export interface IChannelFactory<ChannelT extends AMQPChannel> {
  channels: ChannelT[];
  channelClass: ChannelConstructorT<ChannelT>;

  openChannel(channel: ChannelT): Promise<ChannelT>;
  createChannel(id: number): ChannelT;
  channel(id?: number): Promise<ChannelT>;
}

export class AMQPRecoverableChannel extends AMQPChannel {}
