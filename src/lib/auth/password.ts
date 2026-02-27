import { APIError } from 'better-auth/api';
import bcrypt from 'bcrypt';

const password = {
  async hash(password: string) {
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(password, saltRounds);
    if (!hashedPassword) {
      throw new APIError('INTERNAL_SERVER_ERROR', {
        message: 'Failed to hash password',
      });
    }
    return hashedPassword;
  },
  async verify({ password, hash }: { password: string; hash: string }) {
    const isMatch = await bcrypt.compare(password, hash);
    if (!isMatch) {
      throw new APIError('UNAUTHORIZED', {
        message: 'Invalid credentials',
      });
    }
    return true;
  },
};

export default password;
