import { calculateEventHash, calculateProposalHash, jcs } from '../canonicalize';

describe('execution-ledger canonicalization', () => {
  it('produces stable RFC 8785 JSON regardless of object key order', () => {
    expect(jcs({ b: 2, a: 1 })).toBe('{"a":1,"b":2}');
    expect(jcs({ a: 1, b: 2 })).toBe('{"a":1,"b":2}');
  });

  it('rejects values that cannot be represented as JSON', () => {
    expect(() => jcs(undefined)).toThrow(
      'Canonicalization failed: input could not be serialized to JSON',
    );
  });
});

describe('execution-ledger hashes', () => {
  it('calculates the versioned proposal hash deterministically', () => {
    const hash = calculateProposalHash({ b: 2, a: 1 });

    expect(hash).toHaveLength(32);
    expect(hash.toString('hex')).toBe(
      'b39c511952ca856740e99aec93a0790a730f600c0c09c88adc740a4b22f44b93',
    );
  });

  it('binds receipt hashes to sequence, previous hash, and event content', () => {
    const canonicalEvent = '{"status":"started"}';
    const baseline = calculateEventHash('action-123', 1, null, canonicalEvent);

    expect(baseline.toString('hex')).toBe(
      'd4c1397965711923d0b4fecf280d6c3c91746d02e53cc9e3089a38a3686a6fef',
    );
    expect(calculateEventHash('action-123', 2, null, canonicalEvent)).not.toEqual(baseline);
    expect(calculateEventHash('action-123', 1, Buffer.alloc(32, 1), canonicalEvent)).not.toEqual(
      baseline,
    );
    expect(calculateEventHash('action-123', 1, null, '{"status":"completed"}')).not.toEqual(
      baseline,
    );
  });
});
