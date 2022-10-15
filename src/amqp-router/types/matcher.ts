import { AMQPMessage, AMQPProperties } from '@cloudamqp/amqp-client';
import { Minimatch } from 'minimatch';

import { AMQPResponse } from './response';
import { AMQPRequest } from './request';
import { match } from 'assert';

export type AMQPPropertyKey = keyof AMQPProperties;

export interface Pattern {
  match(value: string): boolean;
}

export class GlobPattern implements Pattern {
  _glob: Minimatch;

  constructor(pattern: string, nocase: boolean = false) {
    this._glob = new Minimatch(pattern, {
      noglobstar: true,
      nocase: nocase,
    });
  }

  public match(value: string) {
    return this._glob.match(value);
  }
}

export class ExactPattern implements Pattern {
  _value: string;
  _nocase: boolean;

  constructor(value: string, nocase: boolean = false) {
    this._value = value;
    this._nocase = nocase;
  }

  public match(value: string): boolean {
    let options: Intl.CollatorOptions | undefined = undefined;

    if (this._nocase) {
      options = { sensitivity: 'accent' };
    }
    return this._value.localeCompare(value, undefined, options) === 0;
  }
}

export class Matcher {
  public match(msg: AMQPMessage): boolean {
    return false;
  }
}

export class MatchAllMatcher extends Matcher {
  public match(msg: AMQPMessage): boolean {
    return true;
  }
}
const _matchAll = new MatchAllMatcher();
const _matchNone = new Matcher();

export class PropertyMatcher implements Matcher {
  _key: AMQPPropertyKey;

  _pattern: Pattern;

  constructor(key: keyof AMQPProperties, pattern: Pattern) {
    this._key = key;
    this._pattern = pattern;
  }

  public match(msg: AMQPMessage): boolean {
    if (this._key in msg.properties) {
      let val = msg.properties[this._key]?.toString();
      if (val) {
        return this._pattern.match(val);
      }
    }
    return false;
  }
}

type BodyT = { [key: string]: any };

export class BodyMatcher implements Matcher {
  _key: string;
  _pattern: Pattern;

  constructor(key: string, pattern: Pattern) {
    this._key = key;
    this._pattern = pattern;
  }

  public match(msg: AMQPMessage): boolean {
    // TODO: this is a shit way to do this
    let body = msg.bodyString();
    if (!body) {
      return false;
    }
    let parsed = JSON.parse(body);
    if (this._key in parsed) {
      let val = parsed[this._key];
      if (val) {
        return this._pattern.match(val);
      }
    }
    return false;
  }
}

export class OrMatcher implements Matcher {
  _matchers: Matcher[];
  constructor(...matchers: Matcher[]) {
    this._matchers = matchers;
  }

  public match(msg: AMQPMessage) {
    for (const matcher of this._matchers) {
      if (matcher.match(msg)) {
        return true;
      }
    }

    return false;
  }
}
export function glob(pattern: string, insensitive: boolean = false) {
  return new GlobPattern(pattern, insensitive);
}

function _buildPropMatcher(propName: AMQPPropertyKey, pattern: Pattern): Matcher {
  return new PropertyMatcher(propName, pattern);
}
export function messageId(pattern: Pattern | string) {
  if (typeof pattern === 'string') {
    pattern = new ExactPattern(pattern);
  }

  return _buildPropMatcher('messageId' as AMQPPropertyKey, pattern);
}

function _buildBodyMatcher(propName: string, pattern: Pattern): Matcher {
  return new BodyMatcher(propName, pattern);
}
export function bodyRequestType(pattern: Pattern | string) {
  if (typeof pattern === 'string') {
    pattern = new ExactPattern(pattern);
  }

  return _buildBodyMatcher('requestType', pattern);
}

export function all(): Matcher {
  return _matchAll;
}

export function none(): Matcher {
  return _matchNone;
}

export function or(...matchers: Matcher[]) {
  return new OrMatcher(...matchers);
}

export default {
  or,
  none,
  all,
  bodyRequestType,
  messageId,
  glob,
};
