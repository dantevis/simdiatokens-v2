use actix_web::{web, HttpResponse, Responder};
use serde::{Deserialize, Serialize};
use chrono::Utc;
use sqlx::SqlitePool;
use jsonwebtoken::{encode, decode, Header, Validation, EncodingKey, DecodingKey};

// === Roles ===

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum Role {
    Admin,
    Operator,
    Viewer,
}

#[allow(dead_code)]
impl Role {
    pub fn from_str(s: &str) -> Self {
        match s.to_lowercase().as_str() {
            "admin" => Role::Admin,
            "operator" => Role::Operator,
            _ => Role::Viewer,
        }
    }

    pub fn can_delete_campaigns(&self) -> bool {
        matches!(self, Role::Admin)
    }

    pub fn can_change_settings(&self) -> bool {
        matches!(self, Role::Admin)
    }

    pub fn can_view_campaigns(&self) -> bool {
        matches!(self, Role::Admin | Role::Operator)
    }

    pub fn can_view_inbox(&self) -> bool {
        matches!(self, Role::Admin | Role::Operator)
    }

    pub fn can_view_recon(&self) -> bool {
        matches!(self, Role::Admin | Role::Operator | Role::Viewer)
    }

    pub fn can_view_analytics(&self) -> bool {
        matches!(self, Role::Admin | Role::Operator | Role::Viewer)
    }

    pub fn can_create_rules(&self) -> bool {
        matches!(self, Role::Admin | Role::Operator)
    }

    pub fn can_create_campaigns(&self) -> bool {
        matches!(self, Role::Admin | Role::Operator)
    }
}

// === User Model ===

#[derive(Debug, Clone, sqlx::FromRow)]
#[allow(dead_code)]
pub struct User {
    pub id: String,
    pub username: String,
    pub email: Option<String>,
    pub password_hash: String,
    pub role: String,
    pub super_admin: bool,
    pub suspended: bool,
    pub expires_at: Option<chrono::DateTime<Utc>>,
    pub usage_days: Option<i32>,
    pub api_url: Option<String>,
    pub frontend_url: Option<String>,
    pub worker_url: Option<String>,
    pub created_at: chrono::DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize)]
pub struct UserResponse {
    pub id: String,
    pub username: String,
    pub email: Option<String>,
    pub role: String,
    pub super_admin: bool,
    pub suspended: bool,
    pub expires_at: Option<String>,
    pub usage_days: Option<i32>,
    pub api_url: Option<String>,
    pub frontend_url: Option<String>,
    pub worker_url: Option<String>,
    pub created_at: String,
}

impl From<User> for UserResponse {
    fn from(u: User) -> Self {
        Self {
            id: u.id,
            username: u.username,
            email: u.email,
            role: u.role,
            super_admin: u.super_admin,
            suspended: u.suspended,
            expires_at: u.expires_at.map(|d| d.to_rfc3339()),
            usage_days: u.usage_days,
            api_url: u.api_url,
            frontend_url: u.frontend_url,
            worker_url: u.worker_url,
            created_at: u.created_at.to_rfc3339(),
        }
    }
}

// === JWT Claims ===

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Claims {
    pub sub: String,
    pub username: String,
    pub role: String,
    pub exp: usize,
    pub iat: usize,
}

fn jwt_secret() -> String {
    std::env::var("JWT_SECRET").unwrap_or_else(|_| {
        eprintln!("[auth] WARNING: JWT_SECRET not set, using insecure default");
        "simdia-default-jwt-secret-change-me".to_string()
    })
}

fn create_jwt(user: &User) -> anyhow::Result<String> {
    let now = chrono::Utc::now().timestamp() as usize;
    let exp = now + 86400 * 7; // 7 days
    let claims = Claims {
        sub: user.id.clone(),
        username: user.username.clone(),
        role: user.role.clone(),
        exp,
        iat: now,
    };
    let secret = jwt_secret();
    encode(&Header::default(), &claims, &EncodingKey::from_secret(secret.as_bytes()))
        .map_err(|e| anyhow::anyhow!("JWT encode failed: {}", e))
}

fn decode_jwt(token: &str) -> anyhow::Result<Claims> {
    let secret = jwt_secret();
    let token_data = decode::<Claims>(
        token,
        &DecodingKey::from_secret(secret.as_bytes()),
        &Validation::default(),
    )
    .map_err(|e| anyhow::anyhow!("JWT decode failed: {}", e))?;
    Ok(token_data.claims)
}

// === Password Hashing ===

fn hash_password(password: &str) -> anyhow::Result<String> {
    use argon2::PasswordHasher;
    let salt = argon2::password_hash::SaltString::generate(&mut rand::thread_rng());
    let argon2 = argon2::Argon2::default();
    let hash = argon2
        .hash_password(password.as_bytes(), &salt)
        .map_err(|e| anyhow::anyhow!("Password hash failed: {}", e))?;
    Ok(hash.to_string())
}

fn verify_password(password: &str, hash: &str) -> bool {
    use argon2::PasswordVerifier;
    let parsed_hash = match argon2::PasswordHash::new(hash) {
        Ok(h) => h,
        Err(_) => return false,
    };
    argon2::Argon2::default()
        .verify_password(password.as_bytes(), &parsed_hash)
        .is_ok()
}

// === Auth Context Extractor ===

#[derive(Clone)]
pub struct AuthContext {
    pub user_id: String,
    pub username: String,
    pub role: Role,
}

impl actix_web::FromRequest for AuthContext {
    type Error = actix_web::Error;
    type Future = std::future::Ready<Result<Self, Self::Error>>;

    fn from_request(req: &actix_web::HttpRequest, _payload: &mut actix_web::dev::Payload) -> Self::Future {
        let auth_header = req.headers().get("Authorization");
        let token = auth_header
            .and_then(|v| v.to_str().ok())
            .and_then(|s| s.strip_prefix("Bearer "));

        match token {
            Some(t) => match decode_jwt(t) {
                Ok(claims) => std::future::ready(Ok(AuthContext {
                    user_id: claims.sub,
                    username: claims.username,
                    role: Role::from_str(&claims.role),
                })),
                Err(_) => std::future::ready(Err(actix_web::error::ErrorUnauthorized(
                    serde_json::json!({"error": "invalid_token"})
                ))),
            },
            None => std::future::ready(Err(actix_web::error::ErrorUnauthorized(
                serde_json::json!({"error": "missing_token"})
            ))),
        }
    }
}

// === HTTP Handlers ===

#[derive(Deserialize)]
pub struct RegisterRequest {
    pub username: String,
    pub password: String,
    pub role: Option<String>,
}

#[derive(Deserialize)]
pub struct LoginRequest {
    pub username: String,
    pub password: String,
}

#[derive(Serialize)]
pub struct AuthResponse {
    pub token: String,
    pub user: UserResponse,
}

pub async fn register_handler(
    body: web::Json<RegisterRequest>,
    state: web::Data<crate::AppState>,
) -> impl Responder {
    if body.username.len() < 3 || body.password.len() < 8 {
        return HttpResponse::BadRequest().json(serde_json::json!({
            "error": "invalid_credentials",
            "message": "Username must be >= 3 chars, password >= 8 chars"
        }));
    }

    // Check if username exists
    let existing: Option<(String,)> = sqlx::query_as("SELECT id FROM users WHERE username = ?")
        .bind(&body.username)
        .fetch_optional(&state.pool)
        .await
        .unwrap_or(None);

    if existing.is_some() {
        return HttpResponse::Conflict().json(serde_json::json!({
            "error": "username_taken",
            "message": "Username already exists"
        }));
    }

    let password_hash = match hash_password(&body.password) {
        Ok(h) => h,
        Err(e) => {
            eprintln!("[auth] Hash failed: {}", e);
            return HttpResponse::InternalServerError().json(serde_json::json!({"error": "hash_failed"}));
        }
    };

    let id = uuid::Uuid::new_v4().to_string();
    let role = body.role.as_deref().unwrap_or("viewer");

    let result = sqlx::query(
        "INSERT INTO users (id, username, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)"
    )
    .bind(&id)
    .bind(&body.username)
    .bind(&password_hash)
    .bind(role)
    .bind(Utc::now())
    .execute(&state.pool)
    .await;

    match result {
        Ok(_) => {
            let user = User {
                id,
                username: body.username.clone(),
                email: None,
                password_hash,
                role: role.to_string(),
                super_admin: false,
                suspended: false,
                expires_at: None,
                usage_days: None,
                api_url: None,
                frontend_url: None,
                worker_url: None,
                created_at: Utc::now(),
            };
            match create_jwt(&user) {
                Ok(token) => HttpResponse::Ok().json(AuthResponse {
                    token,
                    user: user.into(),
                }),
                Err(_) => HttpResponse::InternalServerError().json(serde_json::json!({"error": "jwt_failed"})),
            }
        }
        Err(e) => {
            eprintln!("[auth] Insert failed: {}", e);
            HttpResponse::InternalServerError().json(serde_json::json!({"error": "insert_failed"}))
        }
    }
}

pub async fn login_handler(
    body: web::Json<LoginRequest>,
    state: web::Data<crate::AppState>,
) -> impl Responder {
    let user: Option<User> = sqlx::query_as::<_, User>(
        "SELECT id, username, email, password_hash, role, super_admin, suspended, expires_at, usage_days, created_at FROM users WHERE username = ?"
    )
    .bind(&body.username)
    .fetch_optional(&state.pool)
    .await
    .unwrap_or(None);

    let user = match user {
        Some(u) => u,
        None => {
            return HttpResponse::Unauthorized().json(serde_json::json!({
                "error": "invalid_credentials",
                "message": "Invalid username or password"
            }));
        }
    };

    if !verify_password(&body.password, &user.password_hash) {
        return HttpResponse::Unauthorized().json(serde_json::json!({
            "error": "invalid_credentials",
            "message": "Invalid username or password"
        }));
    }

    match create_jwt(&user) {
        Ok(token) => HttpResponse::Ok().json(AuthResponse {
            token,
            user: user.into(),
        }),
        Err(_) => HttpResponse::InternalServerError().json(serde_json::json!({"error": "jwt_failed"})),
    }
}

pub async fn me_handler(auth: AuthContext) -> impl Responder {
    HttpResponse::Ok().json(serde_json::json!({
        "id": auth.user_id,
        "username": auth.username,
        "role": match auth.role {
            Role::Admin => "admin",
            Role::Operator => "operator",
            Role::Viewer => "viewer",
        }
    }))
}

// === Password Change ===

#[derive(Deserialize)]
pub struct ChangePasswordRequest {
    pub current_password: String,
    pub new_password: String,
}

pub async fn change_password_handler(
    auth: AuthContext,
    body: web::Json<ChangePasswordRequest>,
    state: web::Data<crate::AppState>,
) -> impl Responder {
    if body.new_password.len() < 8 {
        return HttpResponse::BadRequest().json(serde_json::json!({
            "error": "weak_password",
            "message": "New password must be at least 8 characters"
        }));
    }

    let user: Option<User> = sqlx::query_as::<_, User>(
        "SELECT id, username, email, password_hash, role, super_admin, suspended, expires_at, usage_days, created_at FROM users WHERE id = ?"
    )
    .bind(&auth.user_id)
    .fetch_optional(&state.pool)
    .await
    .unwrap_or(None);

    let user = match user {
        Some(u) => u,
        None => {
            return HttpResponse::NotFound().json(serde_json::json!({"error": "user_not_found"}));
        }
    };

    if !verify_password(&body.current_password, &user.password_hash) {
        return HttpResponse::Unauthorized().json(serde_json::json!({
            "error": "invalid_credentials",
            "message": "Current password is incorrect"
        }));
    }

    let new_hash = match hash_password(&body.new_password) {
        Ok(h) => h,
        Err(_) => {
            return HttpResponse::InternalServerError().json(serde_json::json!({"error": "hash_failed"}));
        }
    };

    match sqlx::query("UPDATE users SET password_hash = ? WHERE id = ?")
        .bind(&new_hash)
        .bind(&auth.user_id)
        .execute(&state.pool)
        .await
    {
        Ok(_) => HttpResponse::Ok().json(serde_json::json!({"status": "password_changed"})),
        Err(_) => HttpResponse::InternalServerError().json(serde_json::json!({"error": "update_failed"})),
    }
}

// === DB Setup ===

pub async fn ensure_users_table(pool: &SqlitePool) -> anyhow::Result<()> {
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            username TEXT NOT NULL UNIQUE,
            email TEXT,
            password_hash TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'viewer',
            super_admin BOOLEAN NOT NULL DEFAULT 0,
            suspended BOOLEAN NOT NULL DEFAULT 0,
            expires_at DATETIME,
            usage_days INTEGER,
            api_url TEXT,
            frontend_url TEXT,
            worker_url TEXT,
            created_at DATETIME NOT NULL
        )
        "#
    )
    .execute(pool)
    .await?;
    
    // Migration: add new columns if they don't exist
    let _ = sqlx::query("ALTER TABLE users ADD COLUMN email TEXT").execute(pool).await;
    let _ = sqlx::query("ALTER TABLE users ADD COLUMN super_admin BOOLEAN NOT NULL DEFAULT 0").execute(pool).await;
    let _ = sqlx::query("ALTER TABLE users ADD COLUMN suspended BOOLEAN NOT NULL DEFAULT 0").execute(pool).await;
    let _ = sqlx::query("ALTER TABLE users ADD COLUMN expires_at DATETIME").execute(pool).await;
    let _ = sqlx::query("ALTER TABLE users ADD COLUMN usage_days INTEGER").execute(pool).await;
    let _ = sqlx::query("ALTER TABLE users ADD COLUMN api_url TEXT").execute(pool).await;
    let _ = sqlx::query("ALTER TABLE users ADD COLUMN frontend_url TEXT").execute(pool).await;
    let _ = sqlx::query("ALTER TABLE users ADD COLUMN worker_url TEXT").execute(pool).await;
    Ok(())
}

// === Seed Default Admin ===

pub async fn seed_default_admin(pool: &SqlitePool) -> anyhow::Result<()> {
    let existing: Option<(String,)> = sqlx::query_as("SELECT id FROM users WHERE username = ?")
        .bind("admin")
        .fetch_optional(pool)
        .await
        .unwrap_or(None);

    if existing.is_none() {
        let id = uuid::Uuid::new_v4().to_string();
        let hash = hash_password("admin12345")?;
        sqlx::query(
            "INSERT INTO users (id, username, email, password_hash, role, super_admin, suspended, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
        )
        .bind(&id)
        .bind("admin")
        .bind("admin@simdiatokens.local")
        .bind(&hash)
        .bind("admin")
        .bind(true)
        .bind(false)
        .bind(Utc::now())
        .execute(pool)
        .await?;
        eprintln!("[auth] Created default super admin user: admin / admin12345");
    }

    Ok(())
}

// === Super Admin Endpoints ===

#[derive(Debug, Deserialize)]
pub struct CreateAdminRequest {
    pub username: String,
    pub email: String,
    pub password: String,
    pub role: String,
    pub usage_days: Option<i32>,
    pub api_url: Option<String>,
    pub frontend_url: Option<String>,
    pub worker_url: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateAdminRequest {
    pub username: Option<String>,
    pub email: Option<String>,
    pub password: Option<String>,
    pub role: Option<String>,
    pub usage_days: Option<i32>,
    pub expires_at: Option<String>,
    pub suspended: Option<bool>,
    pub api_url: Option<String>,
    pub frontend_url: Option<String>,
    pub worker_url: Option<String>,
}

pub async fn is_super_admin(pool: &SqlitePool, user_id: &str) -> bool {
    let row: Option<(bool,)> = sqlx::query_as("SELECT super_admin FROM users WHERE id = ?")
        .bind(user_id)
        .fetch_optional(pool)
        .await
        .unwrap_or(None);
    row.map(|r| r.0).unwrap_or(false)
}

pub async fn list_admins_handler(
    req: actix_web::HttpRequest,
    state: web::Data<crate::AppState>,
) -> impl Responder {
    let auth_header = req.headers().get("Authorization");
    if auth_header.is_none() {
        return HttpResponse::Unauthorized().json(serde_json::json!({"error": "unauthorized"}));
    }
    let token_str = auth_header.unwrap().to_str().unwrap_or("").replace("Bearer ", "");
    let claims = match decode_jwt(&token_str) {
        Ok(c) => c,
        Err(_) => return HttpResponse::Unauthorized().json(serde_json::json!({"error": "invalid_token"})),
    };
    
    if !is_super_admin(&state.pool, &claims.sub).await {
        return HttpResponse::Forbidden().json(serde_json::json!({"error": "super_admin_required"}));
    }
    
    let users: Vec<User> = match sqlx::query_as::<_, User>("SELECT * FROM users ORDER BY created_at DESC")
        .fetch_all(&state.pool)
        .await {
        Ok(u) => u,
        Err(e) => {
            eprintln!("[super_admin] Failed to list admins: {}", e);
            return HttpResponse::InternalServerError().json(serde_json::json!({"error": "database_error"}));
        }
    };
    
    let responses: Vec<UserResponse> = users.into_iter().map(|u| u.into()).collect();
    HttpResponse::Ok().json(serde_json::json!({"admins": responses}))
}

pub async fn create_admin_handler(
    req: actix_web::HttpRequest,
    body: web::Json<CreateAdminRequest>,
    state: web::Data<crate::AppState>,
) -> impl Responder {
    let auth_header = req.headers().get("Authorization");
    if auth_header.is_none() {
        return HttpResponse::Unauthorized().json(serde_json::json!({"error": "unauthorized"}));
    }
    let token_str = auth_header.unwrap().to_str().unwrap_or("").replace("Bearer ", "");
    let claims = match decode_jwt(&token_str) {
        Ok(c) => c,
        Err(_) => return HttpResponse::Unauthorized().json(serde_json::json!({"error": "invalid_token"})),
    };
    
    if !is_super_admin(&state.pool, &claims.sub).await {
        return HttpResponse::Forbidden().json(serde_json::json!({"error": "super_admin_required"}));
    }
    
    let password_hash = match hash_password(&body.password) {
        Ok(h) => h,
        Err(e) => return HttpResponse::InternalServerError().json(serde_json::json!({"error": format!("{}", e)})),
    };
    
    let expires_at = body.usage_days.map(|days| Utc::now() + chrono::Duration::days(days as i64));
    let id = uuid::Uuid::new_v4().to_string();
    
    match sqlx::query(
        "INSERT INTO users (id, username, email, password_hash, role, usage_days, expires_at, api_url, frontend_url, worker_url, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(&id)
    .bind(&body.username)
    .bind(&body.email)
    .bind(&password_hash)
    .bind(&body.role)
    .bind(body.usage_days)
    .bind(expires_at)
    .bind(&body.api_url)
    .bind(&body.frontend_url)
    .bind(&body.worker_url)
    .bind(Utc::now())
    .execute(&state.pool)
    .await {
        Ok(_) => HttpResponse::Ok().json(serde_json::json!({"success": true, "id": id})),
        Err(e) => {
            eprintln!("[super_admin] Failed to create admin: {}", e);
            HttpResponse::InternalServerError().json(serde_json::json!({"error": "creation_failed", "details": format!("{}", e)}))
        }
    }
}

pub async fn update_admin_handler(
    req: actix_web::HttpRequest,
    path: web::Path<String>,
    body: web::Json<UpdateAdminRequest>,
    state: web::Data<crate::AppState>,
) -> impl Responder {
    let auth_header = req.headers().get("Authorization");
    if auth_header.is_none() {
        return HttpResponse::Unauthorized().json(serde_json::json!({"error": "unauthorized"}));
    }
    let token_str = auth_header.unwrap().to_str().unwrap_or("").replace("Bearer ", "");
    let claims = match decode_jwt(&token_str) {
        Ok(c) => c,
        Err(_) => return HttpResponse::Unauthorized().json(serde_json::json!({"error": "invalid_token"})),
    };
    
    if !is_super_admin(&state.pool, &claims.sub).await {
        return HttpResponse::Forbidden().json(serde_json::json!({"error": "super_admin_required"}));
    }
    
    let admin_id = path.into_inner();
    
    let mut query_str = "UPDATE users SET ".to_string();
    let mut set_parts = Vec::new();
    
    if let Some(username) = &body.username {
        set_parts.push(format!("username = '{}'", username.replace("'", "''")));
    }
    if let Some(email) = &body.email {
        set_parts.push(format!("email = '{}'", email.replace("'", "''")));
    }
    if let Some(password) = &body.password {
        if let Ok(hash) = hash_password(password) {
            set_parts.push(format!("password_hash = '{}'", hash.replace("'", "''")));
        }
    }
    if let Some(role) = &body.role {
        set_parts.push(format!("role = '{}'", role.replace("'", "''")));
    }
    if let Some(usage_days) = body.usage_days {
        set_parts.push(format!("usage_days = {}", usage_days));
        let expires_at = Utc::now() + chrono::Duration::days(usage_days as i64);
        set_parts.push(format!("expires_at = '{}'", expires_at.to_rfc3339()));
    }
    if let Some(expires_at) = &body.expires_at {
        set_parts.push(format!("expires_at = '{}'", expires_at.replace("'", "''")));
    }
    if let Some(suspended) = body.suspended {
        set_parts.push(format!("suspended = {}", if suspended { 1 } else { 0 }));
    }
    if let Some(api_url) = &body.api_url {
        set_parts.push(format!("api_url = '{}'", api_url.replace("'", "''")));
    }
    if let Some(frontend_url) = &body.frontend_url {
        set_parts.push(format!("frontend_url = '{}'", frontend_url.replace("'", "''")));
    }
    if let Some(worker_url) = &body.worker_url {
        set_parts.push(format!("worker_url = '{}'", worker_url.replace("'", "''")));
    }
    
    if set_parts.is_empty() {
        return HttpResponse::BadRequest().json(serde_json::json!({"error": "no_fields_to_update"}));
    }
    
    query_str.push_str(&set_parts.join(", "));
    query_str.push_str(&format!(" WHERE id = '{}'", admin_id.replace("'", "''")));
    
    match sqlx::query(&query_str).execute(&state.pool).await {
        Ok(result) => {
            if result.rows_affected() > 0 {
                HttpResponse::Ok().json(serde_json::json!({"success": true}))
            } else {
                HttpResponse::NotFound().json(serde_json::json!({"error": "admin_not_found"}))
            }
        }
        Err(e) => {
            eprintln!("[super_admin] Failed to update admin: {}", e);
            HttpResponse::InternalServerError().json(serde_json::json!({"error": "update_failed", "details": format!("{}", e)}))
        }
    }
}

pub async fn delete_admin_handler(
    req: actix_web::HttpRequest,
    path: web::Path<String>,
    state: web::Data<crate::AppState>,
) -> impl Responder {
    let auth_header = req.headers().get("Authorization");
    if auth_header.is_none() {
        return HttpResponse::Unauthorized().json(serde_json::json!({"error": "unauthorized"}));
    }
    let token_str = auth_header.unwrap().to_str().unwrap_or("").replace("Bearer ", "");
    let claims = match decode_jwt(&token_str) {
        Ok(c) => c,
        Err(_) => return HttpResponse::Unauthorized().json(serde_json::json!({"error": "invalid_token"})),
    };
    
    if !is_super_admin(&state.pool, &claims.sub).await {
        return HttpResponse::Forbidden().json(serde_json::json!({"error": "super_admin_required"}));
    }
    
    let admin_id = path.into_inner();
    
    if admin_id == claims.sub {
        return HttpResponse::BadRequest().json(serde_json::json!({"error": "cannot_delete_self"}));
    }
    
    match sqlx::query("DELETE FROM users WHERE id = ?")
        .bind(&admin_id)
        .execute(&state.pool)
        .await {
        Ok(result) => {
            if result.rows_affected() > 0 {
                HttpResponse::Ok().json(serde_json::json!({"success": true}))
            } else {
                HttpResponse::NotFound().json(serde_json::json!({"error": "admin_not_found"}))
            }
        }
        Err(e) => {
            eprintln!("[super_admin] Failed to delete admin: {}", e);
            HttpResponse::InternalServerError().json(serde_json::json!({"error": "delete_failed"}))
        }
    }
}


