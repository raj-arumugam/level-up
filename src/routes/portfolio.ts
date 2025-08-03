import express, { Request, Response } from 'express';
import { body, param } from 'express-validator';
import { authenticateToken } from '../middleware/auth';
import { handleValidationErrors } from '../middleware/validation';
import { portfolioService } from '../services/portfolioService';
import { ApiResponse } from '../types';

const router = express.Router();

/**
 * Validation rules for creating a stock position
 */
const validateCreatePosition = [
  body('symbol')
    .trim()
    .isLength({ min: 1, max: 10 })
    .withMessage('Stock symbol must be between 1 and 10 characters')
    .matches(/^[A-Za-z0-9.-]+$/)
    .withMessage('Stock symbol can only contain letters, numbers, dots, and hyphens'),
  
  body('quantity')
    .isFloat({ min: 0.001, max: 1000000 })
    .withMessage('Quantity must be a positive number between 0.001 and 1,000,000'),
  
  body('purchasePrice')
    .isFloat({ min: 0.01, max: 100000 })
    .withMessage('Purchase price must be between $0.01 and $100,000'),
  
  body('purchaseDate')
    .isISO8601()
    .withMessage('Purchase date must be a valid date')
    .custom((value) => {
      const date = new Date(value);
      const now = new Date();
      if (date > now) {
        throw new Error('Purchase date cannot be in the future');
      }
      return true;
    }),
  
  handleValidationErrors
];

/**
 * Validation rules for updating a stock position
 */
const validateUpdatePosition = [
  param('id')
    .isString()
    .isLength({ min: 1 })
    .withMessage('Position ID is required'),
  
  body('quantity')
    .optional()
    .isFloat({ min: 0.001, max: 1000000 })
    .withMessage('Quantity must be a positive number between 0.001 and 1,000,000'),
  
  body('purchasePrice')
    .optional()
    .isFloat({ min: 0.01, max: 100000 })
    .withMessage('Purchase price must be between $0.01 and $100,000'),
  
  body('purchaseDate')
    .optional()
    .isISO8601()
    .withMessage('Purchase date must be a valid date')
    .custom((value) => {
      if (value) {
        const date = new Date(value);
        const now = new Date();
        if (date > now) {
          throw new Error('Purchase date cannot be in the future');
        }
      }
      return true;
    }),
  
  handleValidationErrors
];

/**
 * Validation rules for position ID parameter
 */
const validatePositionId = [
  param('id')
    .isString()
    .isLength({ min: 1 })
    .withMessage('Position ID is required'),
  
  handleValidationErrors
];

/**
 * POST /api/positions
 * Add a new stock position to user's portfolio
 */
router.post('/positions', authenticateToken, validateCreatePosition, async (req: Request, res: Response) => {
  try {
    const { symbol, quantity, purchasePrice, purchaseDate } = req.body;
    const userId = req.user.id;

    const position = await portfolioService.addPosition(userId, {
      symbol,
      quantity: parseFloat(quantity),
      purchasePrice: parseFloat(purchasePrice),
      purchaseDate: new Date(purchaseDate)
    });

    const response: ApiResponse = {
      success: true,
      data: position,
      message: 'Stock position added successfully'
    };

    res.status(201).json(response);
  } catch (error) {
    console.error('Error adding stock position:', error);
    
    const response: ApiResponse = {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to add stock position'
    };

    // Return appropriate status code based on error type
    if (error instanceof Error && error.message.includes('Invalid stock symbol')) {
      res.status(400).json(response);
    } else {
      res.status(500).json(response);
    }
  }
});

/**
 * PUT /api/positions/:id
 * Update an existing stock position
 */
router.put('/positions/:id', authenticateToken, validateUpdatePosition, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { quantity, purchasePrice, purchaseDate } = req.body;
    const userId = req.user.id;

    // First verify that the position belongs to the authenticated user
    const existingPosition = await portfolioService.getPortfolio(userId);
    const userPosition = existingPosition.positions.find(pos => pos.id === id);
    
    if (!userPosition) {
      const response: ApiResponse = {
        success: false,
        error: 'Stock position not found or access denied'
      };
      res.status(404).json(response);
      return;
    }

    const updates: any = {};
    if (quantity !== undefined) updates.quantity = parseFloat(quantity);
    if (purchasePrice !== undefined) updates.purchasePrice = parseFloat(purchasePrice);
    if (purchaseDate !== undefined) updates.purchaseDate = new Date(purchaseDate);

    const updatedPosition = await portfolioService.updatePosition(id, updates);

    const response: ApiResponse = {
      success: true,
      data: updatedPosition,
      message: 'Stock position updated successfully'
    };

    res.status(200).json(response);
  } catch (error) {
    console.error('Error updating stock position:', error);
    
    const response: ApiResponse = {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update stock position'
    };

    if (error instanceof Error && error.message.includes('not found')) {
      res.status(404).json(response);
    } else {
      res.status(500).json(response);
    }
  }
});

/**
 * DELETE /api/positions/:id
 * Remove a stock position from user's portfolio
 */
router.delete('/positions/:id', authenticateToken, validatePositionId, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // First verify that the position belongs to the authenticated user
    const existingPosition = await portfolioService.getPortfolio(userId);
    const userPosition = existingPosition.positions.find(pos => pos.id === id);
    
    if (!userPosition) {
      const response: ApiResponse = {
        success: false,
        error: 'Stock position not found or access denied'
      };
      res.status(404).json(response);
      return;
    }

    await portfolioService.deletePosition(id);

    const response: ApiResponse = {
      success: true,
      message: 'Stock position deleted successfully'
    };

    res.status(200).json(response);
  } catch (error) {
    console.error('Error deleting stock position:', error);
    
    const response: ApiResponse = {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete stock position'
    };

    if (error instanceof Error && error.message.includes('not found')) {
      res.status(404).json(response);
    } else {
      res.status(500).json(response);
    }
  }
});

/**
 * GET /api/portfolio
 * Get user's complete portfolio with current values
 */
router.get('/portfolio', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = req.user.id;
    const portfolio = await portfolioService.getPortfolio(userId);

    const response: ApiResponse = {
      success: true,
      data: portfolio,
      message: 'Portfolio retrieved successfully'
    };

    res.status(200).json(response);
  } catch (error) {
    console.error('Error retrieving portfolio:', error);
    
    const response: ApiResponse = {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to retrieve portfolio'
    };

    res.status(500).json(response);
  }
});

export default router;