import jwt from 'jsonwebtoken';

export const generateToken = (user, tenantId = null) =>
  jwt.sign(
    { id: user._id, tenant: tenantId || user.lastActiveTenant },
    process.env.JWT_SECRET,
    {
      expiresIn: "24d",
    }
  );
