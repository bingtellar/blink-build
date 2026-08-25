import geoip from 'geoip-lite';
import { db } from '../db'; 
import { users } from '../schema'; 
import { eq } from 'drizzle-orm';
import { Request } from 'express';

// 🌟 THE EXTRACTOR: Unifies IP extraction for the entire backend
export const extractTrueIp = (req: Request): string => {
  const rawIp = 
    req.headers['cf-connecting-ip'] || 
    req.headers['x-forwarded-for'] || 
    req.socket.remoteAddress || 
    '0.0.0.0';
    
  let clientIp = (typeof rawIp === 'string' ? rawIp.split(',')[0] : rawIp[0]).trim();

  // 🌟 THE LOCALHOST BYPASS: If testing locally, mock a public IP to trigger UI flags
  // In production, real users won't use loopback addresses, so this is safely bypassed.
  if (clientIp === '::1' || clientIp === '127.0.0.1') {
    // We are mocking a standard Nigerian IP (e.g., MTN/Airtel in Port Harcourt/Lagos)
    // Change this to '104.28.x.x' (US) or '8.8.8.8' to test different flags!
    clientIp = '102.89.34.1'; 
  }

  return clientIp;
};

export const captureSecurityMetadata = async (userId: string, req: Request) => {
  try {
    // 1. Get the true (or mocked) IP
    const clientIp = extractTrueIp(req);

    // 2. Resolve Geolocation locally
    const geo = geoip.lookup(clientIp);
    const countryCode = geo ? geo.country : null; 
    const countryName = geo ? geo.country : "Unknown"; 

    // 3. Update the Database
    await db.update(users)
      .set({ 
        lastIp: clientIp, 
        countryCode: countryCode,
        country: countryName
      })
      .where(eq(users.id, userId));
      
  } catch (error) {
    console.error("Failed to capture security metadata:", error);
  }
};