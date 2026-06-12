CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name VARCHAR(255),
  role VARCHAR(20) CHECK (role IN ('client', 'provider', 'admin')) DEFAULT 'client',
  phone VARCHAR(50),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE provider_profiles (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  business_name VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(100),
  logo_url TEXT,
  cover_image_url TEXT,
  address TEXT,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  whatsapp_number VARCHAR(50),
  is_verified BOOLEAN DEFAULT false,
  subscription_end DATE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE business_hours (
  id SERIAL PRIMARY KEY,
  provider_id UUID REFERENCES provider_profiles(user_id) ON DELETE CASCADE,
  day_of_week INT CHECK (day_of_week BETWEEN 0 AND 6),
  open_time TIME,
  close_time TIME,
  is_closed BOOLEAN DEFAULT false
);

CREATE TABLE appointments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  provider_id UUID REFERENCES provider_profiles(user_id),
  client_id UUID REFERENCES users(id),
  service_name VARCHAR(255),
  start_time TIMESTAMP NOT NULL,
  end_time TIMESTAMP NOT NULL,
  status VARCHAR(20) CHECK (status IN ('pending','confirmed','cancelled','completed')) DEFAULT 'pending',
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE subscriptions (
  id SERIAL PRIMARY KEY,
  provider_id UUID REFERENCES provider_profiles(user_id),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  amount DECIMAL(10,2),
  status VARCHAR(20) DEFAULT 'paid'
);

-- Insert a default admin (password: admin123)
-- Use bcrypt to hash: will do in code, but you can insert manually later.