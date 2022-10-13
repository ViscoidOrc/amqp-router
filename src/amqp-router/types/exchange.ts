import { ExchangeParams } from '@cloudamqp/amqp-client';
import { ExtraArgsT } from './declare';
export class AMQPExchange {
  name: string;
  type: string;
  namedParams?: ExchangeParams;
  extraArgs?: ExtraArgsT;

  public constructor(
    name: string,
    type: string,
    namedParams?: ExchangeParams,
    extraArgs?: ExtraArgsT
  ) {
    this.name = name;
    this.type = type;
    this.namedParams = namedParams;
    this.extraArgs = extraArgs;
  }
}
