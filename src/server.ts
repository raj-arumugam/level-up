import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';

// Import routes
// import authRoutes from './routes/auth'; // Disabled - no auth needed
import portfolioRoutes from './routes/portfolio';
import analyticsRoutes from './routes/analytics';
import schedulerRoutes from './routes/scheduler';

// Import services
import { schedulerService } from './services/schedulerService';

// Import security middleware
import { 
  rateLimiters, 
  sanitizeInput, 
  securityHeaders, 
  requestSizeLimit,
  ipWhitelist 
} from './middleware/security';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Trust proxy for accurate IP addresses (important for rate limiting)
app.set('trust proxy', 1);

// Enhanced security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://api.alphavantage.co", "https://query1.finance.yahoo.com"],
      fontSrc: ["'self'", "https:"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}));

// CORS configuration
const corsOptions = {
  origin: process.env.NODE_ENV === 'production' 
    ? process.env.FRONTEND_URL || 'https://your-domain.com'
    : ['http://localhost:3000', 'http://127.0.0.1:3000'],
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  maxAge: 86400 // 24 hours
};

app.use(cors(corsOptions));

// Additional security headers
app.use(securityHeaders);

// Request size limiting
app.use(requestSizeLimit);

// Body parsing with size limits
app.use(express.json({ 
  limit: '1mb',
  strict: true,
  type: 'application/json'
}));
app.use(express.urlencoded({ 
  extended: true, 
  limit: '1mb',
  parameterLimit: 100
}));

// Input sanitization
app.use(sanitizeInput);

// General rate limiting
app.use(rateLimiters.general);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

// API routes
app.get('/api', (req, res) => {
  res.json({ message: 'Portfolio Tracker API' });
});

// Authentication routes disabled - no auth needed for testing
// app.use('/api/auth', rateLimiters.auth, authRoutes);

// Portfolio routes with portfolio-specific rate limiting
app.use('/api', rateLimiters.portfolio, portfolioRoutes);

// Analytics routes with general rate limiting
app.use('/api/analytics', analyticsRoutes);

// Scheduler routes (admin only with IP whitelist)
const adminIPs = process.env.ADMIN_IPS?.split(',') || ['127.0.0.1', '::1'];
app.use('/api/scheduler', ipWhitelist(adminIPs), schedulerRoutes);

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV}`);
  
  // Start the daily update scheduler in production
  if (process.env.NODE_ENV === 'production' || process.env.ENABLE_SCHEDULER === 'true') {
    try {
      schedulerService.startDailyUpdateScheduler();
      console.log('Daily update scheduler started');
    } catch (error) {
      console.error('Failed to start daily update scheduler:', error);
    }
  } else {
    console.log('Daily update scheduler disabled (set ENABLE_SCHEDULER=true to enable in development)');
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  schedulerService.stopDailyUpdateScheduler();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  schedulerService.stopDailyUpdateScheduler();
  process.exit(0);
});