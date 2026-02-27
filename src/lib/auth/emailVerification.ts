import { BetterAuthOptions } from 'better-auth';
import { sendVerificationEmail } from '@/configs/emailTemplates';

const emailVerification: BetterAuthOptions['emailVerification'] = {
  sendVerificationEmail: async ({ user, url, token }) => {
    await sendVerificationEmail(user.email, {
      name: user.name,
      verificationLink: url,
      token,
      expiresIn: '1 hour',
    });
  },
  sendOnSignUp: true,
  autoSignInAfterVerification: true,
  expiresIn: 3600, // 1 hour
};
export default emailVerification;
