import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export const authenticateToken = (req: Request, res: Response, next: NextFunction) => {
  // 🌟 THE UPGRADE: Handle Cookies (Web), Bearer Tokens (Mobile/API), AND Query Strings (SSE Streams)
  const token = 
      req.cookies?.bingtellar_jwt || 
      req.headers.authorization?.split(' ')[1] || 
      (req.query.token as string); // <--- THIS ENABLES THE REAL-TIME SSE CONNECTION

  if (!token) {
    return res.status(401).json({ error: "Access denied. No session token provided." });
  }

  try {
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error("JWT_SECRET is missing");

    const decoded = jwt.verify(token, secret);
    (req as any).user = decoded; // Attach the user payload to the request
    
    next(); // Pass control to the next route handler
  } catch (error) {
    return res.status(403).json({ error: "Session expired or invalid. Please log in again." });
  }
};