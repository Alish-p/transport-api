import jwt from 'jsonwebtoken';

export const generateToken = (user) =>
  jwt.sign({ id: user._id, tenant: user.tenant }, process.env.JWT_SECRET, {
    expiresIn: "24d",
  });
