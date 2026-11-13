import bcrypt from 'bcryptjs';

const ROUNDS = 10;
/** Pre-computed hash used to equalise timing when a user does not exist. */
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', ROUNDS);

export const hashSecret = (secret: string): Promise<string> => bcrypt.hash(secret, ROUNDS);

export const verifySecret = async (secret: string, hash: string | null | undefined): Promise<boolean> => {
  if (!hash) {
    await bcrypt.compare(secret, DUMMY_HASH);
    return false;
  }
  return bcrypt.compare(secret, hash);
};
