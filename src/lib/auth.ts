import { db } from '@/configs/db/mongodb';
import env from '@/configs/env';
import { betterAuth, BetterAuthOptions } from 'better-auth';
import password from '@/lib/auth/password';
import { mongodbAdapter } from 'better-auth/adapters/mongodb';
import { authDbHooks, authHooks } from './auth/hooks';
import emailVerification from './auth/emailVerification';
import { openAPI, admin, organization } from 'better-auth/plugins';
import origins from '@/configs/origins';
import adminConfig from './auth/adminConfig';
import organisationConfig from './auth/organizationConfig';
import { sendPasswordResetEmail } from '@/configs/emailTemplates';

const betterAuthConfig: BetterAuthOptions = {
  database: mongodbAdapter(db),
  emailAndPassword: {
    enabled: true,
    password,
    sendResetPassword: async ({ user, url }) => {
      await sendPasswordResetEmail(user.email, {
        name: user.name,
        resetLink: url,
        expiresIn: '1 hour',
      });
    },
  },
  socialProviders: {
    google: {
      clientId: env.GOOGLE_CLIENT_ID!,
      clientSecret: env.GOOGLE_CLIENT_SECRET!,
    },
  },
  user: {
    additionalFields: {
      isOnboarded: {
        type: 'boolean',
        input: false,
        defaultValue: false,
      },
      caId: {
        type: 'string',
        input: true,
        required: false,
      },
    },
  },
  hooks: authHooks,
  databaseHooks: authDbHooks,
  emailVerification,
  plugins: [openAPI(), admin(adminConfig), organization(organisationConfig)],
  advanced: {
    cookiePrefix: 'finagerIndia',
    crossSubDomainCookies: {
      enabled: true,
      domain: env.COOKIE_DOMAIN!,
    },
  },
  trustedOrigins: origins,
};

export const auth = betterAuth(betterAuthConfig);
