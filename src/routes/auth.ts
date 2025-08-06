import express from 'express';
import { authService } from '../services/authService';
import { validateRegistration, validateLogin } from '../middleware/validation';
import { authenticateToken } from '../middleware/auth';
import { CreateUserDto, LoginDto, ApiResponse, AuthResponse } from '../types';

const router = express.Router();

/**
 * POST /api/auth/register
 * Register a new user (DISABLED FOR TESTING)
 */
router.post('/register', async (req: express.Request, res: express.Response): Promise<void> => {
  // Auto-create a test user for development
  try {
    const testUser = {
      id: 'test-user-123',
      email: 'test@example.com',
      firstName: 'Test',
      lastName: 'User',
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const testToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJ0ZXN0LXVzZXItMTIzIiwiaWF0IjoxNzU0NDM4MDAwLCJleHAiOjE3NTUwNDI4MDB9.test-token-for-development';

    res.status(201).json({
      success: true,
      data: {
        user: testUser,
        token: testToken,
        expiresIn: '7d'
      },
      message: 'Test user created successfully (registration bypassed for testing)'
    } as ApiResponse<AuthResponse>);
  } catch (error) {
    console.error('Test registration error:', error);

    res.status(400).json({
      success: false,
      error: 'Test registration failed'
    } as ApiResponse);
  }
});

/**
 * POST /api/auth/login
 * Login user (SIMPLIFIED FOR TESTING)
 */
router.post('/login', async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    // Accept any login for testing purposes
    const testUser = {
      id: 'test-user-123',
      email: req.body.email || 'test@example.com',
      firstName: 'Test',
      lastName: 'User',
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const testToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJ0ZXN0LXVzZXItMTIzIiwiaWF0IjoxNzU0NDM4MDAwLCJleHAiOjE3NTUwNDI4MDB9.test-token-for-development';

    res.status(200).json({
      success: true,
      data: {
        user: testUser,
        token: testToken,
        expiresIn: '7d'
      },
      message: 'Login successful (authentication bypassed for testing)'
    } as ApiResponse<AuthResponse>);
  } catch (error) {
    console.error('Test login error:', error);

    res.status(401).json({
      success: false,
      error: 'Test login failed'
    } as ApiResponse);
  }
});

/**
 * GET /api/auth/me
 * Get current user profile
 */
router.get('/me', authenticateToken, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    res.status(200).json({
      success: true,
      data: req.user,
      message: 'User profile retrieved successfully'
    } as ApiResponse);
  } catch (error) {
    console.error('Profile retrieval error:', error);

    res.status(500).json({
      success: false,
      error: 'Failed to retrieve user profile'
    } as ApiResponse);
  }
});

/**
 * POST /api/auth/verify
 * Verify JWT token
 */
router.post('/verify', async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { token } = req.body;

    if (!token) {
      res.status(400).json({
        success: false,
        error: 'Token is required'
      } as ApiResponse);
      return;
    }

    const user = await authService.verifyToken(token);

    res.status(200).json({
      success: true,
      data: { user, valid: true },
      message: 'Token is valid'
    } as ApiResponse);
  } catch (error) {
    res.status(401).json({
      success: false,
      error: 'Invalid or expired token',
      data: { valid: false }
    } as ApiResponse);
  }
});

export default router;