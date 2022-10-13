import logger from './logger';

const options = {
  maxRetryTime: 30 * 1000,
  initialRetryTime: 300,
  factor: 0.2, // randomization factor
  multiplier: 2, // exponential factor
};

function randomInRange(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

function calculateRetryTime(retryTime: number): number {
  retryTime = retryTime * options.multiplier;
  const delta = options.factor * retryTime;
  return Math.ceil(randomInRange(retryTime - delta, retryTime + delta));
}

export async function promiseRetry<T>(
  fn: () => Promise<T>,
  retries: number,
  retryIntervalMillis: number = options.initialRetryTime,
  previousError?: Error
): Promise<T> {
  if (!retries) {
    return Promise.reject(previousError);
  } else {
    return fn().catch(async (error) => {
      if (retries > 1) {
        logger.info(`${error}: Retrying in ${retryIntervalMillis} ms`);
      }
      await new Promise((resolve) => setTimeout(resolve, retryIntervalMillis));
      let newInterval = calculateRetryTime(retryIntervalMillis);
      return promiseRetry(fn, retries - 1, newInterval, error);
    });
  }
}
