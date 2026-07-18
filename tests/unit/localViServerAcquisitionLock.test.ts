import { describe, expect, it } from 'vitest';

import {
  createLocalViServerAcquisitionLock,
  localViServerLockKey,
  sharedLocalViServerAcquisitionLock
} from '../../src/reporting/runtime/localViServerAcquisitionLock';

describe('localViServerLockKey (VHS-REQ-669.2)', () => {
  it('derives a stable key from provider and port', () => {
    expect(localViServerLockKey({ provider: 'host-native', portNumber: 3363 })).toBe(
      'host-native:3363'
    );
  });

  it('falls back to default when the port is missing, zero, negative, or non-integer', () => {
    expect(localViServerLockKey({ provider: 'host-native' })).toBe('host-native:default');
    expect(localViServerLockKey({ provider: 'host-native', portNumber: 0 })).toBe(
      'host-native:default'
    );
    expect(localViServerLockKey({ provider: 'host-native', portNumber: -1 })).toBe(
      'host-native:default'
    );
    expect(localViServerLockKey({ provider: 'host-native', portNumber: 33.5 })).toBe(
      'host-native:default'
    );
  });

  it('gives distinct ports distinct keys so they do not serialize together', () => {
    expect(localViServerLockKey({ provider: 'host-native', portNumber: 3363 })).not.toBe(
      localViServerLockKey({ provider: 'host-native', portNumber: 3364 })
    );
  });
});

describe('createLocalViServerAcquisitionLock (VHS-REQ-669.1)', () => {
  it('serializes same-key acquirers in FIFO order', async () => {
    const lock = createLocalViServerAcquisitionLock();
    const order: string[] = [];

    const releaseA = await lock.acquire('host-native:3363');
    order.push('a-acquired');

    // B and C queue behind A; neither resolves until A releases.
    let bReleased = false;
    let cReleased = false;
    const bPromise = lock.acquire('host-native:3363').then((release) => {
      order.push('b-acquired');
      return release;
    });
    const cPromise = lock.acquire('host-native:3363').then((release) => {
      order.push('c-acquired');
      return release;
    });

    await Promise.resolve();
    expect(order).toEqual(['a-acquired']);
    expect(lock.isBusy('host-native:3363')).toBe(true);
    expect(lock.waitingCount('host-native:3363')).toBe(2);

    releaseA();
    const releaseB = await bPromise;
    expect(order).toEqual(['a-acquired', 'b-acquired']);
    expect(bReleased).toBe(false);

    releaseB();
    bReleased = true;
    const releaseC = await cPromise;
    expect(order).toEqual(['a-acquired', 'b-acquired', 'c-acquired']);

    releaseC();
    cReleased = true;
    expect(cReleased).toBe(true);
    expect(lock.isBusy('host-native:3363')).toBe(false);
    expect(lock.waitingCount('host-native:3363')).toBe(0);
  });

  it('does not block distinct keys against each other (VHS-REQ-669.2)', async () => {
    const lock = createLocalViServerAcquisitionLock();
    const releaseFirst = await lock.acquire('host-native:3363');

    // A different endpoint acquires immediately even while the first is held.
    const releaseSecond = await lock.acquire('host-native:3364');
    expect(lock.isBusy('host-native:3363')).toBe(true);
    expect(lock.isBusy('host-native:3364')).toBe(true);

    releaseFirst();
    releaseSecond();
    expect(lock.isBusy('host-native:3363')).toBe(false);
    expect(lock.isBusy('host-native:3364')).toBe(false);
  });

  it('has an idempotent release that only frees the slot once (VHS-REQ-669.4)', async () => {
    const lock = createLocalViServerAcquisitionLock();
    const release = await lock.acquire('host-native:3363');

    let bAcquired = false;
    const bPromise = lock.acquire('host-native:3363').then((r) => {
      bAcquired = true;
      return r;
    });

    await Promise.resolve();
    expect(bAcquired).toBe(false);

    release();
    release(); // second call is a no-op
    const releaseB = await bPromise;
    expect(bAcquired).toBe(true);

    // The extra release() did not double-free and hand B's slot to a phantom.
    releaseB();
    expect(lock.isBusy('host-native:3363')).toBe(false);
  });

  it('reports idle state and prunes fully released keys', async () => {
    const lock = createLocalViServerAcquisitionLock();
    expect(lock.isBusy('host-native:3363')).toBe(false);
    expect(lock.waitingCount('host-native:3363')).toBe(0);

    const release = await lock.acquire('host-native:3363');
    expect(lock.isBusy('host-native:3363')).toBe(true);
    release();
    expect(lock.isBusy('host-native:3363')).toBe(false);
  });
});

describe('sharedLocalViServerAcquisitionLock (VHS-REQ-669.3)', () => {
  it('is a usable process-wide lock instance', async () => {
    const key = localViServerLockKey({ provider: 'host-native', portNumber: 65535 });
    const release = await sharedLocalViServerAcquisitionLock.acquire(key);
    expect(sharedLocalViServerAcquisitionLock.isBusy(key)).toBe(true);
    release();
    expect(sharedLocalViServerAcquisitionLock.isBusy(key)).toBe(false);
  });
});
