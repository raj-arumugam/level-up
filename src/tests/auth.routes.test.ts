import request from 'supertest';
import express from 'express';
import authRoutes from '../routes/auth';
import { authService } from '../services/authService';

// Mock the auth service
jest.mock('../services/authService');

const mockAuthService = authService as jest.Mocked<typeof authService>;

// Create test app
const app = express();
app.use(express.json());
app.use('/api/auth', authRoutes);

describe('Auth Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/auth/register', () => {
    const validRegistrationData = {
      email: 'test@example.com',
      password: 'TestPassword123',
      firstName: 'John',
      lastName: 'Doe',
    };

    const mockAuthResponse = {
      user: {
        id: 'user-123',
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      token: 'mock-jwt-token',
      expiresIn: '24h',
    };

    it('should successfully register a new user', async () => {
      mockAuthService.register.mockResolvedValue(mockAuthResponse);

      const response = await request(app)
        .post('/api/auth/register')
        .send(validRegistrationData);

      expect(response.status).toBe(201);
      expect(response.body).toEqual({
        success: true,
        data: {
          ...mockAuthResponse,
          user: {
            ...mockAuthResponse.user,
            createdAt: expect.any(String),
            updatedAt: expect.any(String),
          }
        },
        message: 'User registered successfully',
      });

      expect(mockAuthService.register).toHaveBeenCalledWith(validRegistrationData);
    });

    it('should return 400 for invalid email', async () => {
      const invalidData = {
        ...validRegistrationData,
        email: 'invalid-email',
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(invalidData);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
      expect(mockAuthService.register).not.toHaveBeenCalled();
    });

    it('should return 400 for weak password', async () => {
      const invalidData = {
        ...validRegistrationData,
        password: 'weak',
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(invalidData);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
      expect(mockAuthService.register).not.toHaveBeenCalled();
    });

    it('should return 400 for missing required fields', async () => {
      const invalidData = {
        email: 'test@example.com',
        password: 'TestPassword123',
        // Missing firstName and lastName
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(invalidData);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
      expect(mockAuthService.register).not.toHaveBeenCalled();
    });

    it('should return 400 when user already exists', async () => {
      mockAuthService.register.mockRejectedValue(new Error('User with this email already exists'));

      const response = await request(app)
        .post('/api/auth/register')
        .send(validRegistrationData);

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        success: false,
        error: 'User with this email already exists',
      });
    });
  });

  describe('POST /api/auth/login', () => {
    const validLoginData = {
      email: 'test@example.com',
      password: 'TestPassword123',
    };

    const mockAuthResponse = {
      user: {
        id: 'user-123',
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      token: 'mock-jwt-token',
      expiresIn: '24h',
    };

    it('should successfully login with valid credentials', async () => {
      mockAuthService.login.mockResolvedValue(mockAuthResponse);

      const response = await request(app)
        .post('/api/auth/login')
        .send(validLoginData);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: {
          ...mockAuthResponse,
          user: {
            ...mockAuthResponse.user,
            createdAt: expect.any(String),
            updatedAt: expect.any(String),
          }
        },
        message: 'Login successful',
      });

      expect(mockAuthService.login).toHaveBeenCalledWith(validLoginData);
    });

    it('should return 400 for invalid email format', async () => {
      const invalidData = {
        ...validLoginData,
        email: 'invalid-email',
      };

      const response = await request(app)
        .post('/api/auth/login')
        .send(invalidData);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
      expect(mockAuthService.login).not.toHaveBeenCalled();
    });

    it('should return 400 for missing password', async () => {
      const invalidData = {
        email: 'test@example.com',
        // Missing password
      };

      const response = await request(app)
        .post('/api/auth/login')
        .send(invalidData);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
      expect(mockAuthService.login).not.toHaveBeenCalled();
    });

    it('should return 401 for invalid credentials', async () => {
      mockAuthService.login.mockRejectedValue(new Error('Invalid email or password'));

      const response = await request(app)
        .post('/api/auth/login')
        .send(validLoginData);

      expect(response.status).toBe(401);
      expect(response.body).toEqual({
        success: false,
        error: 'Invalid email or password',
      });
    });
  });

  describe('GET /api/auth/me', () => {
    const mockUser = {
      id: 'user-123',
      email: 'test@example.com',
      firstName: 'John',
      lastName: 'Doe',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('should return user profile with valid token', async () => {
      mockAuthService.verifyToken.mockResolvedValue(mockUser);

      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer valid-token');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: {
          ...mockUser,
          createdAt: expect.any(String),
          updatedAt: expect.any(String),
        },
        message: 'User profile retrieved successfully',
      });
    });

    it('should return 401 without token', async () => {
      const response = await request(app)
        .get('/api/auth/me');

      expect(response.status).toBe(401);
      expect(response.body).toEqual({
        success: false,
        error: 'Access token required',
      });
    });

    it('should return 401 with invalid token', async () => {
      mockAuthService.verifyToken.mockRejectedValue(new Error('Invalid token'));

      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer invalid-token');

      expect(response.status).toBe(401);
      expect(response.body).toEqual({
        success: false,
        error: 'Invalid or expired token',
      });
    });
  });

  describe('POST /api/auth/verify', () => {
    const mockUser = {
      id: 'user-123',
      email: 'test@example.com',
      firstName: 'John',
      lastName: 'Doe',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('should verify valid token', async () => {
      mockAuthService.verifyToken.mockResolvedValue(mockUser);

      const response = await request(app)
        .post('/api/auth/verify')
        .send({ token: 'valid-token' });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: { 
          user: {
            ...mockUser,
            createdAt: expect.any(String),
            updatedAt: expect.any(String),
          }, 
          valid: true 
        },
        message: 'Token is valid',
      });
    });

    it('should return 400 without token', async () => {
      const response = await request(app)
        .post('/api/auth/verify')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        success: false,
        error: 'Token is required',
      });
    });

    it('should return 401 for invalid token', async () => {
      mockAuthService.verifyToken.mockRejectedValue(new Error('Invalid token'));

      const response = await request(app)
        .post('/api/auth/verify')
        .send({ token: 'invalid-token' });

      expect(response.status).toBe(401);
      expect(response.body).toEqual({
        success: false,
        error: 'Invalid or expired token',
        data: { valid: false },
      });
    });
  });
});