// src/validate.ts
import { Request, Response, NextFunction } from 'express';
import { z, ZodError } from 'zod';
import { logger } from './logger';

// Using the universal z.ZodSchema type
export const validate = (schema: z.ZodSchema) => 
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await schema.parseAsync({
        body: req.body,
        query: req.query,
        params: req.params,
      });
      next(); 
    } catch (error) {
      if (error instanceof ZodError) {
        logger.warn({ ip: req.ip, violations: error.issues }, "Blocked invalid payload");
        res.status(400).json({ error: "Invalid input payload" });
        return;
      }
      next(error);
    }
};