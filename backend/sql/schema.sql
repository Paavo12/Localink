-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
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

-- Provider profiles
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
  subscription_tier VARCHAR(20) DEFAULT 'basic',
  subscription_end DATE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Services
CREATE TABLE services (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  provider_id UUID REFERENCES provider_profiles(user_id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  price DECIMAL(10,2),
  duration_minutes INT,
  image_urls TEXT[],
  is_active BOOLEAN DEFAULT true,
  is_available BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Business hours – note: no created_at originally, we add it later
CREATE TABLE business_hours (
  id SERIAL PRIMARY KEY,
  provider_id UUID REFERENCES provider_profiles(user_id) ON DELETE CASCADE,
  day_of_week INT CHECK (day_of_week BETWEEN 0 AND 6),
  open_time TIME,
  close_time TIME,
  is_closed BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()  -- added this line
);

-- Appointments
CREATE TABLE appointments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  provider_id UUID REFERENCES provider_profiles(user_id),
  client_id UUID REFERENCES users(id),
  service_id UUID REFERENCES services(id),
  start_time TIMESTAMP NOT NULL,
  end_time TIMESTAMP NOT NULL,
  status VARCHAR(20) CHECK (status IN ('pending','confirmed','cancelled','completed')) DEFAULT 'pending',
  notes TEXT,
  calendar_event_id VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Google Calendar OAuth tokens (one per provider who has connected their calendar)
CREATE TABLE IF NOT EXISTS calendar_tokens (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  token_expiry TIMESTAMP,
  calendar_id VARCHAR(255) DEFAULT 'primary',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Quote requests
CREATE TABLE quote_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  provider_id UUID REFERENCES provider_profiles(user_id),
  client_name VARCHAR(255) NOT NULL,
  client_email VARCHAR(255) NOT NULL,
  client_phone VARCHAR(50),
  service_type VARCHAR(255),
  message TEXT NOT NULL,
  status VARCHAR(20) DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT NOW()
);

-- Quote broadcast recipients: when a client requests a quote for a service
-- category (rather than a specific provider), one quote_requests row is
-- created (provider_id NULL) and one row per matching provider goes here,
-- so each provider can see and respond to the same request independently,
-- notified in priority order by subscription tier.
CREATE TABLE quote_recipients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  quote_id UUID REFERENCES quote_requests(id) ON DELETE CASCADE,
  provider_id UUID REFERENCES provider_profiles(user_id) ON DELETE CASCADE,
  priority_rank INT DEFAULT 0,
  is_read BOOLEAN DEFAULT false,
  notified_at TIMESTAMP DEFAULT NOW()
);

-- Reviews
CREATE TABLE reviews (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  provider_id UUID REFERENCES provider_profiles(user_id),
  client_id UUID REFERENCES users(id),
  rating INT CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  is_anonymous BOOLEAN DEFAULT false,
  response TEXT,
  responded_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Anonymous comments
CREATE TABLE anonymous_comments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  provider_id UUID REFERENCES provider_profiles(user_id),
  alias VARCHAR(100),
  comment TEXT NOT NULL,
  sentiment VARCHAR(20),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Reports
CREATE TABLE reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reporter_user_id UUID REFERENCES users(id),
  provider_id UUID REFERENCES provider_profiles(user_id),
  reason TEXT NOT NULL,
  status VARCHAR(20) DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT NOW()
);

-- Profile views
CREATE TABLE profile_views (
  id SERIAL PRIMARY KEY,
  provider_id UUID REFERENCES provider_profiles(user_id) ON DELETE CASCADE,
  viewed_at TIMESTAMP DEFAULT NOW()
);

-- Payment requests (new – add this table)
CREATE TABLE payment_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  invoice_number VARCHAR(50) UNIQUE NOT NULL,
  tier VARCHAR(20) NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','submitted','approved','rejected')),
  proof_image_url TEXT,
  admin_notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Notifications
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  type VARCHAR(50),
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Portfolio
CREATE TABLE portfolio_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  provider_id UUID REFERENCES provider_profiles(user_id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  title VARCHAR(255),
  description TEXT,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);