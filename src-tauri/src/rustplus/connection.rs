use std::sync::Arc;
use std::time::Duration;

use futures_util::stream::SplitSink;
use futures_util::{SinkExt, StreamExt};
use log::{error, info, warn};
use prost::Message;
use tokio::net::TcpStream;
use tokio::sync::{broadcast, Mutex};
use tokio_tungstenite::tungstenite::Message as WsMessage;
use tokio_tungstenite::{connect_async, MaybeTlsStream, WebSocketStream};

use crate::generated::{AppMessage, AppRequest, AppResponse};
use super::rate_limiter::RateLimiter;

type WsWriter = SplitSink<WebSocketStream<MaybeTlsStream<TcpStream>>, WsMessage>;

/// Manages the WebSocket connection to a Rust+ companion server.
pub struct RustPlusConnection {
    pub ip: String,
    pub port: u16,
    pub player_id: u64,
    pub player_token: i32,
    writer: Arc<Mutex<Option<WsWriter>>>,
    seq: Arc<Mutex<u32>>,
    event_tx: broadcast::Sender<AppMessage>,
    rate_limiter: Arc<Mutex<RateLimiter>>,
    shutdown_tx: Option<tokio::sync::oneshot::Sender<()>>,
}

impl RustPlusConnection {
    /// Create a new connection and start the read loop in the background.
    pub async fn connect(
        ip: String,
        port: u16,
        player_id: u64,
        player_token: i32,
    ) -> Result<Self, String> {
        let url = format!("ws://{}:{}", ip, port);
        info!("Connecting to Rust+ server at {}", url);

        let (ws_stream, _) = connect_async(&url)
            .await
            .map_err(|e| format!("WebSocket connection failed: {}", e))?;

        info!("Connected to Rust+ server");

        let (writer, mut reader) = ws_stream.split();
        let (event_tx, _) = broadcast::channel::<AppMessage>(256);

        let writer = Arc::new(Mutex::new(Some(writer)));
        let event_tx_clone = event_tx.clone();
        let writer_clone = Arc::clone(&writer);
        let ip_clone = ip.clone();
        let (shutdown_tx, mut shutdown_rx) = tokio::sync::oneshot::channel::<()>();

        // Spawn the read loop
        tokio::spawn(async move {
            loop {
                tokio::select! {
                    _ = &mut shutdown_rx => {
                        info!("Read loop shutting down");
                        break;
                    }
                    msg = reader.next() => {
                        match msg {
                            Some(Ok(WsMessage::Binary(data))) => {
                                match AppMessage::decode(data.as_ref()) {
                                    Ok(app_msg) => {
                                        let _ = event_tx_clone.send(app_msg);
                                    }
                                    Err(e) => {
                                        error!("Failed to decode protobuf message: {}", e);
                                    }
                                }
                            }
                            Some(Ok(WsMessage::Close(_))) => {
                                warn!("Server closed connection");
                                // Clear the writer so sends fail gracefully
                                let mut w = writer_clone.lock().await;
                                *w = None;
                                break;
                            }
                            Some(Err(e)) => {
                                error!("WebSocket error: {}", e);
                                let mut w = writer_clone.lock().await;
                                *w = None;
                                break;
                            }
                            None => {
                                info!("WebSocket stream ended");
                                let mut w = writer_clone.lock().await;
                                *w = None;
                                break;
                            }
                            _ => {} // Ignore ping/pong/text
                        }
                    }
                }
            }

            info!("Attempting reconnect to {} in 5 seconds...", ip_clone);
        });

        Ok(Self {
            ip,
            port,
            player_id,
            player_token,
            writer,
            seq: Arc::new(Mutex::new(1)),
            event_tx,
            rate_limiter: Arc::new(Mutex::new(RateLimiter::new(25, Duration::from_secs(1)))),
            shutdown_tx: Some(shutdown_tx),
        })
    }

    /// Send a protobuf request to the server and wait for a matching response.
    pub async fn send_request(&self, mut request: AppRequest) -> Result<AppResponse, String> {
        // Rate-limit outgoing requests
        {
            let mut limiter = self.rate_limiter.lock().await;
            limiter.acquire().await;
        }

        // Set seq, playerId, playerToken
        let seq = {
            let mut s = self.seq.lock().await;
            let current = *s;
            *s = s.wrapping_add(1);
            current
        };
        request.seq = seq;
        request.player_id = self.player_id;
        request.player_token = self.player_token;

        // Encode and send
        let mut buf = Vec::with_capacity(request.encoded_len());
        request
            .encode(&mut buf)
            .map_err(|e| format!("Failed to encode request: {}", e))?;

        {
            let mut writer_guard = self.writer.lock().await;
            let writer = writer_guard
                .as_mut()
                .ok_or_else(|| "Not connected".to_string())?;
            writer
                .send(WsMessage::Binary(buf.into()))
                .await
                .map_err(|e| format!("Failed to send message: {}", e))?;
        }

        // Subscribe and wait for matching response
        let mut rx = self.event_tx.subscribe();
        let timeout = Duration::from_secs(10);

        tokio::time::timeout(timeout, async move {
            loop {
                match rx.recv().await {
                    Ok(msg) => {
                        if let Some(response) = msg.response {
                            if response.seq == seq {
                                return Ok(response);
                            }
                        }
                        // Broadcasts are ignored here; they're handled by event listeners
                    }
                    Err(e) => {
                        return Err(format!("Event channel error: {}", e));
                    }
                }
            }
        })
        .await
        .map_err(|_| "Request timed out".to_string())?
    }

    /// Subscribe to broadcast events (team changes, entity changes, etc.)
    pub fn subscribe(&self) -> broadcast::Receiver<AppMessage> {
        self.event_tx.subscribe()
    }

    /// Disconnect from the server.
    pub async fn disconnect(&mut self) {
        info!("Disconnecting from Rust+ server");

        // Signal the read loop to stop.
        if let Some(tx) = self.shutdown_tx.take() {
            let _ = tx.send(());
        }

        // Close the writer, but never block longer than ~1s on the close
        // handshake — otherwise an unresponsive server would delay the next
        // connection. We drop the writer regardless once the timeout elapses.
        let mut writer_guard = self.writer.lock().await;
        if let Some(mut writer) = writer_guard.take() {
            let _ = tokio::time::timeout(Duration::from_millis(800), writer.close()).await;
        }
    }
}

impl Drop for RustPlusConnection {
    fn drop(&mut self) {
        if let Some(tx) = self.shutdown_tx.take() {
            let _ = tx.send(());
        }
    }
}
