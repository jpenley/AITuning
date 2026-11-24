# Idempotency

Any state-changing operation that can be delivered twice (a client retry, a queue redelivery, a replayed webhook, a dead-letter replay) must produce its effect once. Accepting an idempotency key is the contract; honouring it is the implementation, and a key accepted but handled carelessly is worse than none, because the caller now believes retrying is safe.

No queue delivers exactly once across a consumer crash: the broker's acknowledgement and your side effect are not in one transaction. Design for at-least-once delivery with idempotent processing.

## Derive the key from the intent, not the attempt

The key must be the same across retries of one intent and different across distinct intents.

- **Wrong**: a fresh UUID per attempt (every retry is a new charge); a timestamp (the same thing in disguise); `user + amount` (two legitimate identical charges collapse into one).
- **Right**: a key the client generates once and reuses on retry; or one derived from an immutable identifier of the intent, such as `charge:v1:<orderId>`.

The key comes from the client or the initiating event, never from the layer doing the retrying.

## Claim atomically

"Does this key exist? If not, act and record it" is a race: two concurrent retries both see "not seen" and both act. Let the storage pick the winner in one operation:

1. Insert the key with state `in_progress` and a hash of the request, under a **unique constraint**.
2. If the insert violates the constraint, this is a duplicate: replay or reject (below).
3. Otherwise perform the effect, then record `succeeded` with the response.

A store that can't enforce uniqueness in one operation can't back this.

## Guard the payload

The same key with a different request body is a client bug: fail loudly (for example 422) rather than replaying the first response to a different request.

## Decide what an in-flight duplicate gets

The first request is still running when the duplicate arrives; this is the common case under retry storms. Choose deliberately:

| Strategy | Response | Use when |
|---|---|---|
| Reject | 409 Conflict | the caller can retry later; simplest and safest |
| Wait | block for the result, with a bound | the caller needs the result synchronously |
| Pending | 202 with a status location | long-running effects |

Never let the duplicate through because the first attempt "seems stuck": an attempt whose fate is unknown is exactly when duplicating costs most.

## Three outcomes, not two

Every outbound call ends in success, failure, or **unknown** (a timeout says nothing about whether the effect happened). Record the intent **before** calling out, so a crash between the call and its response leaves evidence that something must reconcile, rather than a silent retry that doubles the effect.

## Retention

Keep keys longer than the longest path that can redeliver the same intent: client retry windows, dead-letter queues replayed a week later, provider dispute windows. A 24-hour key behind a 7-day dead-letter queue is a duplicate waiting to happen.
