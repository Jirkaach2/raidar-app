use std::time::{Duration, Instant};
use tokio::time::sleep;

/// A simple token bucket rate limiter.
///
/// Allows up to `capacity` requests, refilling at a rate
/// of `capacity` tokens per `refill_interval`.
pub struct RateLimiter {
    capacity: u32,
    tokens: u32,
    last_refill: Instant,
    refill_interval: Duration,
}

impl RateLimiter {
    pub fn new(capacity: u32, refill_interval: Duration) -> Self {
        Self {
            capacity,
            tokens: capacity,
            last_refill: Instant::now(),
            refill_interval,
        }
    }

    /// Refill tokens based on elapsed time.
    fn refill(&mut self) {
        let now = Instant::now();
        let elapsed = now.duration_since(self.last_refill);

        if elapsed >= self.refill_interval {
            let intervals = (elapsed.as_millis() / self.refill_interval.as_millis()) as u32;
            self.tokens = (self.tokens + intervals * self.capacity).min(self.capacity);
            self.last_refill = now;
        }
    }

    /// Acquire a token; waits if none are available.
    pub async fn acquire(&mut self) {
        self.refill();
        if self.tokens > 0 {
            self.tokens -= 1;
        } else {
            // Wait for the next refill
            let wait = self.refill_interval
                .checked_sub(Instant::now().duration_since(self.last_refill))
                .unwrap_or(Duration::from_millis(50));
            sleep(wait).await;
            self.refill();
            self.tokens = self.tokens.saturating_sub(1);
        }
    }
}
