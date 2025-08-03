import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { CreateUserDto, LoginDto, AuthResponse } from '../types';

export class AuthService {
  private readonly JWT_SECRET: string;
  private readonly JWT_EXPIRES_IN: string;
  private readonly SALT_ROUNDS = 12;
  private readonly prisma: PrismaClient;

  constructor(prismaClient?: PrismaClient) {
    this.JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
    this.JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';
    this.prisma = prismaClient || new PrismaClient();
    
    if (!process.env.JWT_SECRET) {
      console.warn('JWT_SECRET not set in environment variables. Using default secret.');
    }
  }

  /**
   * Register a new user
   */
  async register(userData: CreateUserDto): Promise<AuthResponse> {
    const { email, password, firstName, lastName } = userData;

    // Check if user already exists
    const existingUser = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() }
    });

    if (existingUser) {
      throw new Error('User with this email already exists');
    }

    // Hash password
    const passwordHash = await this.hashPassword(password);

    // Create user
    const user = await this.prisma.user.create({
      data: {
        email: email.toLowerCase(),
        passwordHash,
        firstName,
        lastName,
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

    // Generate JWT token
    const token = this.generateToken(user.id);

    return {
      user,
      token,
      expiresIn: this.JWT_EXPIRES_IN,
    };
  }

  /**
   * Login user
   */
  async login(loginData: LoginDto): Promise<AuthResponse> {
    const { email, password } = loginData;

    // Find user by email
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() }
    });

    if (!user) {
      throw new Error('Invalid email or password');
    }

    // Verify password
    const isPasswordValid = await this.verifyPassword(password, user.passwordHash);
    
    if (!isPasswordValid) {
      throw new Error('Invalid email or password');
    }

    // Generate JWT token
    const token = this.generateToken(user.id);

    // Return user without password hash
    const { passwordHash, ...userWithoutPassword } = user;

    return {
      user: userWithoutPassword,
      token,
      expiresIn: this.JWT_EXPIRES_IN,
    };
  }

  /**
   * Verify JWT token and return user
   */
  async verifyToken(token: string): Promise<any> {
    try {
      const decoded = jwt.verify(token, this.JWT_SECRET) as { userId: string };
      
      const user = await this.prisma.user.findUnique({
        where: { id: decoded.userId },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          createdAt: true,
          updatedAt: true,
        }
      });

      if (!user) {
        throw new Error('User not found');
      }

      return user;
    } catch (error) {
      throw new Error('Invalid or expired token');
    }
  }

  /**
   * Hash password using bcrypt
   */
  private async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, this.SALT_ROUNDS);
  }

  /**
   * Verify password against hash
   */
  private async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  /**
   * Generate JWT token
   */
  private generateToken(userId: string): string {
    return jwt.sign(
      { userId },
      this.JWT_SECRET,
      { expiresIn: this.JWT_EXPIRES_IN } as jwt.SignOptions
    );
  }

  /**
   * Cleanup method for testing
   */
  async disconnect(): Promise<void> {
    await this.prisma.$disconnect();
  }
}

export const authService = new AuthService();