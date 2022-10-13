import { AMQPRequest } from '../types/request';
import { AMQPResponse } from '../types/response';
import { AMQPRouteHandler, NextFunction } from '../types/middleware';
import { Matcher } from '../types/matcher';
import { AMQPMessage } from '@cloudamqp/amqp-client';

export class Layer {
  _matcher: Matcher;
  handler: AMQPRouteHandler;
  name: string;

  constructor(matcher: Matcher, handler: AMQPRouteHandler) {
    this._matcher = matcher;
    this.handler = handler;
    this.name = handler.name ? handler.name : '(anonymous)';
  }

  public match(message: AMQPMessage) {
    return this._matcher.match(message);
  }

  public async handle_request(req: AMQPRequest, res: AMQPResponse, next: NextFunction) {
    if (this.handler.length > 3) {
      return next();
    }

    try {
      this.handler(req, res, next);
    } catch (err) {
      next(err);
    }
  }

  public async handle_error(err: any, req: AMQPRequest, res: AMQPResponse, next: NextFunction) {
    if (this.handler.length !== 4) {
      next(err);
      return;
    }

    try {
      this.handler(req, res, next, err);
    } catch (err) {
      next(err);
    }
  }
}
