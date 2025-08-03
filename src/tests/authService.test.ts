// Mock all dependencies before importing
jest.mock('@prisma/client');
jest.mock('bcrypt');
jest.mock('jsonwebtoken');

import { AuthService } from '../services/authService';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

// Create mock implementations
const mockPrisma = {
  user: {
    findUnique: jest.fn(),
    create: jest.fn(),
  },
  $disconnect: jest.fn(),
};

// Mock the PrismaClient constructor
(PrismaClient as jest.Mock).mockImplementation(() => mockPrisma);

// Mock bcrypt methods
(bcrypt.hash as jest.Mock) = jest.fn();
(bcrypt.compare as jest.Mock) = jest.fn();

// Mock jwt methods
(jwt.sign as jest.Mock) = jest.fn();
(jwt.verify as jest.Mock) = jest.fn();

describe('AuthService', () => {
  let authService: AuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    authService = new AuthService(mockPrisma as any);
  });

  afterEach(async () => {
    await authService.disconnect();
  });

  describe('register', () => {
    const mockUserData = {
      email: 'test@example.com',
      password: 'TestPassword123',
      firstName: 'John',
      lastName: 'Doe',
    };

    const mockCreatedUser = {
      id: 'user-123',
      email: 'test@example.com',
      firstName: 'John',
      lastName: 'Doe',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('should successfully register a new user', async () => {
      // Mock user doesn't exist
      mockPrisma.user.findUnique.mockResolvedValue(null);
      
      // Mock password hashing
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-password');
      
      // Mock user creation
      mockPrisma.user.create.mockResolvedValue(mockCreatedUser);
      
      // Mock JWT generation
      (jwt.sign as jest.Mock).mockReturnValue('mock-jwt-token');

      const result = await authService.register(mockUserData);

      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'test@example.com' }
      });
      
      expect(bcrypt.hash).toHaveBeenCalledWith('TestPassword123', 12);
      
      expect(mockPrisma.user.create).toHaveBeenCalledWith({
        data: {
          email: 'test@example.com',
          passwordHash: 'hashed-password',
          firstName: 'John',
          lastName: 'Doe',
        },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          createdAt: true,
          updatedAt: true,
        }
      });

      expect(jwt.sign).toHaveBeenCalledWith(
        { userId: 'user-123' },
        expect.any(String),
        { expiresIn: '24h' }
      );

      expect(result).toEqual({
        user: mockCreatedUser,
        token: 'mock-jwt-token',
        expiresIn: '24h',
      });
    });

    it('should throw error if user already exists', async () => {
      // Mock user already exists
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'existing-user',
        email: 'test@example.com',
      });

      await expect(authService.register(mockUserData)).rejects.toThrow(
        'User with this email already exists'
      );

      expect(mockPrisma.user.create).not.toHaveBeenCalled();
    });
  });

  describe('login', () => {
    const mockLoginData = {
      email: 'test@example.com',
      password: 'TestPassword123',
    };

    const mockUser = {
      id: 'user-123',
      email: 'test@example.com',
      passwordHash: 'hashed-password',
      firstName: 'John',
      lastName: 'Doe',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('should successfully login with valid credentials', async () => {
      // Mock user exists
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      
      // Mock password verification
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      
      // Mock JWT generation
      (jwt.sign as jest.Mock).mockReturnValue('mock-jwt-token');

      const result = await authService.login(mockLoginData);

      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'test@example.com' }
      });
      
      expect(bcrypt.compare).toHaveBeenCalledWith('TestPassword123', 'hashed-password');
      
      expect(jwt.sign).toHaveBeenCalledWith(
        { userId: 'user-123' },
        expect.any(String),
        { expiresIn: '24h' }
      );

      expect(result).toEqual({
        user: {
          id: 'user-123',
          email: 'test@example.com',
          firstName: 'John',
          lastName: 'Doe',
          createdAt: mockUser.createdAt,
          updatedAt: mockUser.updatedAt,
        },
        token: 'mock-jwt-token',
        expiresIn: '24h',
      });
    });

    it('should throw error if user does not exist', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(authService.login(mockLoginData)).rejects.toThrow(
        'Invalid email or password'
      );

      expect(bcrypt.compare).not.toHaveBeenCalled();
    });

    it('should throw error if password is invalid', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(authService.login(mockLoginData)).rejects.toThrow(
        'Invalid email or password'
      );
    });
  });

  describe('verifyToken', () => {
    const mockUser = {
      id: 'user-123',
      email: 'test@example.com',
      firstName: 'John',
      lastName: 'Doe',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('should successfully verify valid token', async () => {
      const mockToken = 'valid-jwt-token';
      const mockDecoded = { userId: 'user-123' };

      (jwt.verify as jest.Mock).mockReturnValue(mockDecoded);
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      const result = await authService.verifyToken(mockToken);

      expect(jwt.verify).toHaveBeenCalledWith(mockToken, expect.any(String));
      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'user-123' },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          createdAt: true,
          updatedAt: true,
        }
      });

      expect(result).toEqual(mockUser);
    });

    it('should throw error for invalid token', async () => {
      const mockToken = 'invalid-jwt-token';

      (jwt.verify as jest.Mock).mockImplementation(() => {
        throw new Error('Invalid token');
      });

      await expect(authService.verifyToken(mockToken)).rejects.toThrow(
        'Invalid or expired token'
      );
    });

    it('should throw error if user not found', async () => {
      const mockToken = 'valid-jwt-token';
      const mockDecoded = { userId: 'non-existent-user' };

      (jwt.verify as jest.Mock).mockReturnValue(mockDecoded);
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(authService.verifyToken(mockToken)).rejects.toThrow(
        'Invalid or expired token'
      );
    });
  });
});