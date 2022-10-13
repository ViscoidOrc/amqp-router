export type SubscriptionArgsT = { [key: string]: string };

export class Subscription {
  exclusive: boolean = false;
  noAck: boolean = true;
  args?: SubscriptionArgsT;
  tag?: string;

  constructor({
    exclusive = false,
    noAck = true,
    args = undefined,
    tag = undefined,
  }: {
    exclusive: boolean;
    noAck: boolean;
    args?: SubscriptionArgsT;
    tag?: string;
  }) {
    this.exclusive = exclusive;
    this.noAck = noAck;
    this.args = args;
    this.tag = tag;
  }
}

export function subscribe(exclusive = false, noAck = true, args = undefined, tag = undefined) {
  return new Subscription({
    exclusive: exclusive,
    noAck: noAck,
    args: args,
    tag: tag,
  });
}

export default {
  subscribe,
};
