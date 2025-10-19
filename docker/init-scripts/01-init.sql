-- Initialize PostgreSQL database for testing
-- This script runs when the postgres container first starts

-- Create test schema
CREATE SCHEMA IF NOT EXISTS test_schema;

-- Create sample tables for comparison testing
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255),
    email VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS posts (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    title VARCHAR(500) NOT NULL,
    content TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Insert sample data
INSERT INTO users (name, email) VALUES
    ('Alice Smith', 'alice@example.com'),
    ('Bob Jones', 'bob@example.com'),
    ('Charlie Brown', 'charlie@example.com')
ON CONFLICT (email) DO NOTHING;

INSERT INTO posts (user_id, title, content) VALUES
    (1, 'First Post', 'This is the first post content'),
    (1, 'Second Post', 'This is the second post content'),
    (2, 'Bobs Post', 'Hello from Bob')
ON CONFLICT DO NOTHING;

-- Create indexes for testing
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_posts_user_id ON posts(user_id);

-- Grant permissions
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO postgres;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO postgres;

-- Log initialization complete
DO $$
BEGIN
    RAISE NOTICE 'PostgreSQL test database initialized successfully';
END $$;
