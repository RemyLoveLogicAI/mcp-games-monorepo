import { createHash } from 'node:crypto';
import canonicalize from 'canonicalize';

/**
 * Canonicalizes an object using RFC 8785 JCS (JSON Canonicalization Scheme)
 * as implemented by the 'canonicalize' package.
 */
export function jcs(obj: unknown): string {
  const result = canonicalize(obj);
  if (result === undefined) {
    throw new Error('Canonicalization failed: input could not be serialized to JSON');
  }
  return result;
}

/**
 * Calculates the proposal hash for a security envelope.
 * proposal_hash = SHA-256("mcp-games-action-v1\0" + UTF8(JCS(envelope)))
 */
export function calculateProposalHash(envelope: Record<string, unknown>): Buffer {
  const canonical = jcs(envelope);
  const prefix = Buffer.from('mcp-games-action-v1\0', 'utf8');
  const payload = Buffer.from(canonical, 'utf8');

  return createHash('sha256').update(prefix).update(payload).digest();
}

/**
 * Calculates the event hash for a receipt event.
 * event_hash = SHA-256(
 *   "mcp-games-receipt-v1\0" +
 *   action_id +
 *   sequence +
 *   previous_hash +
 *   canonical_event
 * )
 */
export function calculateEventHash(
  actionId: string,
  sequence: number,
  previousHash: Buffer | null,
  canonicalEvent: string,
): Buffer {
  const hash = createHash('sha256');
  hash.update('mcp-games-receipt-v1\0', 'utf8');
  hash.update(actionId, 'utf8');

  const seqBuf = Buffer.alloc(4);
  seqBuf.writeInt32BE(sequence);
  hash.update(seqBuf);

  if (previousHash) {
    hash.update(previousHash);
  }

  hash.update(canonicalEvent, 'utf8');
  return hash.digest();
}
