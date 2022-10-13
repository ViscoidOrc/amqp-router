import { AMQPRouteHandler, MessageHandler, NextFunction } from './types/middleware';
import { AMQPRequest } from './types/request';
import { AMQPResponse } from './types/response';

function bodyParserJson(req: AMQPRequest, res: AMQPResponse, next: NextFunction) {
  let err = '';
  try {
    let body = req.amqpMessage.bodyString();
    if (!body) {
      throw new Error('Received unexpected empty message');
    }
    let parsed = JSON.parse(body);
    req.json = parsed;
  } catch (err) {
    next(err);
  }
  next();
}

export function json() {
  return bodyParserJson;
}
