import express from 'express';
import { authService } from '../services/authService';
import { validateRegistration, validateLogin } from '../middleware/validation';
import { authenticateToken } from '../middleware/auth';
import { CreateUserDto, LoginDto, ApiResponse, AuthResponse } from '../types';

const router = express.Router();

/**
 * POST /api/auth/register
 * Register a new user
 */
router.post('/register', validateRegistration, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const userData: CreateUserDto = req.body;
    const result: AuthResponse = await authService.register(userData);
    
    res.status(201).json({
      success: true,
      data: result,
      message: 'User registered successfully'
    } as ApiResponse<AuthResponse>);
  } catch (error) {
    console.error('Registration error:', error);
    
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : 'Registration failed'
    } as ApiResponse);
  }
});

/**
 * POST /api/auth/login
 * Login user
 */
router.post('/login', validateLogin, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const loginData: LoginDto = req.body;
    const result: AuthResponse = await authService.login(loginData);
    
    res.status(200).json({
      success: true,
      data: result,
      message: 'Login successful'
    } as ApiResponse<AuthResponse>);
  } catch (error) {
    console.error('Login error:', error);
    
    res.status(401).json({
      success: false,
      error: error instanceof Error ? error.message : 'Login failed'
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