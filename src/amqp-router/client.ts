import { AMQPChannel, AMQPClient } from '@cloudamqp/amqp-client';
import { AMQPView } from '@cloudamqp/amqp-client/types/amqp-view';
import { AMQPRouterError } from './errors';
import { IRecoverableClient } from './types/client.interface';
import { IChannelFactory, ChannelConstructorT } from './channel';

function recoverableClientClosed() {
  return Promise.reject(new AMQPRouterError('Client closed'));
}

export class AMQPRecoverableClient<ChannelT extends AMQPChannel = AMQPChannel>
  extends AMQPClient
  implements IRecoverableClient, IChannelFactory<ChannelT>
{
  channels: ChannelT[];
  channelClass: ChannelConstructorT<ChannelT>;

  constructor(channelClass: ChannelConstructorT<ChannelT>, url: string) {
    super(url);
    this.channelClass = channelClass;
    this.channels = [];
  }
  openChannel(channel: ChannelT): Promise<ChannelT> {
    let j = 0;
    const channelOpen = new AMQPView(new ArrayBuffer(13));
    channelOpen.setUint8(j, 1);
    j += 1; // type: method
    channelOpen.setUint16(j, channel.id);
    j += 2; // channel id
    channelOpen.setUint32(j, 5);
    j += 4; // frameSize
    channelOpen.setUint16(j, 20);
    j += 2; // class: channel
    channelOpen.setUint16(j, 10);
    j += 2; // method: open
    channelOpen.setUint8(j, 0);
    j += 1; // reserved1
    channelOpen.setUint8(j, 206);
    j += 1; // frame end byte
    return new Promise((resolve, reject) => {
      this.send(new Uint8Array(channelOpen.buffer, 0, 13))
        .then(() => channel.promises.push([resolve, reject]))
        .catch(reject);
    });
  }

  createChannel(id: number): ChannelT {
    return new this.channelClass(this, id);
  }
  /**
   * Open a channel
   * @param [id] - An existing or non existing specific channel
   */
  channel(id?: number): Promise<ChannelT> {
    if (this.closed) return recoverableClientClosed();
    if (id && id > 0) {
      const channel = this.channels[id];
      if (channel) return Promise.resolve(channel);
    }
    // Store channels in an array, set position to null when channel is closed
    // Look for first null value or add one the end
    if (!id) id = this.channels.findIndex((ch) => ch === undefined);
    if (id === -1) id = this.channels.length;
    // FIXME: check max channels (or let the server deal with that?)
    const channel = this.createChannel(id);
    this.channels[id] = channel;

    return this.openChannel(channel);
  }
}
