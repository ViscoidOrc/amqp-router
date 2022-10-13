import { AMQPRouter } from '../router/router';
import { AMQPRequest } from './request';
import { AMQPResponse } from './response';

export interface NextFunction {
  (err?: any): void;
  (deferToNext: 'break'): void;
  (deferToNext: 'stack'): void;
}

export type MessageHandler = (req: AMQPRequest, res: AMQPResponse, next: NextFunction) => void;

export type ErrorMessageHandler = (
  req: AMQPRequest,
  res: AMQPResponse,
  next: NextFunction,
  err?: any
) => void;

export type AMQPRouteHandler = MessageHandler | ErrorMessageHandler;
