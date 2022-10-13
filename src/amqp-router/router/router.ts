import { NextFunction, AMQPRouteHandler } from '../types/middleware';
import { AMQPRequest } from '../types/request';
import { AMQPResponse } from '../types/response';
import { matchAll, Matcher } from '../types/matcher';
import { Layer } from './layer';
import logger from '../utils/logger';

const DEBUG_ENABLED = true;
function layerDebug(msg: string) {
  DEBUG_ENABLED && logger.debug(msg);
}

export class AMQPRouter {
  stack: Layer[];

  constructor() {
    this.stack = [];
  }

  public route(
    matcher: Matcher | undefined = undefined,
    ...routes: (AMQPRouter | AMQPRouteHandler)[]
  ): this {
    if (!matcher) {
      matcher = matchAll();
    }

    let layer;
    for (const route of routes) {
      if (route instanceof AMQPRouter) {
        layer = new Layer(matcher, route.handle.bind(route));
      } else {
        layer = new Layer(matcher, route);
      }

      this.stack.push(layer);
    }
    return this;
  }

  /*
  public dispatch(req: AMQPRequest, res: AMQPResponse, done: NextFunction) {
    let index = 0;
    let stack = this.stack;
    let sync = 0;

    if (stack.length === 0) {
      return done();
    }

    next();

    function next(err: any = undefined): void {
      if (err && err === 'skip') {
        return done();
      }

      if (err && err === 'break') {
        return done(err);
      }
      if (++sync > 100) {
        setImmediate(next, err);
        return;
      }

      let layer = stack[index++];
      if (!layer) {
        return done(err);
      }

      if (err) {
        layer.handle_error(err, req, res, next);
      } else {
        layer.handle_request(req, res, next);
      }

      sync = 0;
    }
  }
*/
  public async handle(req: AMQPRequest, res: AMQPResponse, done: NextFunction) {
    let router = this;

    let index = 0;
    let sync = 0;

    let stack = router.stack;

    next();

    function next(err?: any) {
      layerDebug(`next passing: got err '${err}'`);

      let realError = err === 'skip' ? null : err;
      if (realError === 'break') {
        layerDebug('skipping to done');
        done(realError);
        return;
      }

      if (index >= stack.length) {
        layerDebug('finished with stack');
        done(realError);
        return;
      }

      if (++sync > 100) {
        layerDebug('sync max hit, requeuing on process');
        setImmediate(next, err);
        return;
      }

      let layer;
      let match = false;

      while (match !== true && index < stack.length) {
        layer = stack[index++];
        match = layer.match(req.amqpMessage);

        layerDebug(`looking at layer ${layer.name}, match ${match}`);
        if (!match) {
          continue;
        }
      }

      if (!match || !layer) {
        layerDebug(`no layer found; skipping to done`);
        return done(realError);
      }

      if (realError) {
        layerDebug(`passing error handler to layer`);
        layer.handle_error(realError, req, res, next);
      } else {
        layerDebug(`passing request handler to layer`);
        layer.handle_request(req, res, next);
      }
    }
  }
}

// needs list of exchanges
// needs source queues
// needs a process function to start the stack
