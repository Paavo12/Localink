require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const businessRoutes = require('./routes/businesses');
const bookingsRoutes = require('./routes/bookings');
const quotesRoutes = require('./routes/quotes');
const reviewsRoutes = require('./routes/reviews');
const servicesRoutes = require('./routes/services');
const subscriptionsRoutes = require('./routes/subscriptions');
const dashboardRoutes = require('./routes/dashboard');
const uploadRoutes = require('./routes/upload');   // <-- import upload routes

const app = express();
app.use(cors());
app.use(express.json());

// Serve uploaded images
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Serve static frontend files
app.use(express.static(path.join(__dirname, '../frontend')));

// API routes (all must come after app definition)
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/businesses', businessRoutes);
app.use('/api/bookings', bookingsRoutes);
app.use('/api/quotes', quotesRoutes);
app.use('/api/reviews', reviewsRoutes);
app.use('/api/services', servicesRoutes);
app.use('/api/subscriptions', subscriptionsRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/upload', uploadRoutes);   // <-- now correctly placed after app

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));