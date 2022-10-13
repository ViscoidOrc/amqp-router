type ExtraBindArgsT = { [key: string]: string };

export class Bind {
  name: string;
  routingKey?: string;
  extraArgs?: ExtraBindArgsT;

  constructor(name: string, routingKey?: string, extraArgs?: ExtraBindArgsT) {
    this.name = name;
    this.routingKey = routingKey;
    this.extraArgs = extraArgs;
  }
}

export class ExchangeBind extends Bind {}
export class QueueBind extends Bind {}

export function exchange(name: string, routingKey?: string, args?: ExtraBindArgsT): Bind {
  return new ExchangeBind(name, routingKey, args);
}

export default {
  exchange,
};
